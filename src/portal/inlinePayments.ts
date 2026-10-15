import { assertPayablePeriod } from "./payablePeriod";
import prisma from "../prisma";
import {
  paymentConfig,
  providerRequest,
  PaymentError,
  type ProviderOrder,
} from "./pagbank";
import { validDocument } from "./document";
import { randomUUID } from "node:crypto";
export type InlineResult = {
  status: string;
  method: string;
  pix?: string;
  expiresAt?: string;
  environment: string;
};
export async function inlinePayment(
  orderId: string,
  userId: string,
  input: {
    method?: unknown;
    encryptedCard?: unknown;
    holder?: unknown;
    holderTaxId?: unknown;
  },
) {
  const config = paymentConfig();
  if (!["PIX", "CREDIT_CARD"].includes(String(input.method)))
    throw new PaymentError(400, "Escolha PIX ou cartão de crédito.");
  // Persist an immutable attempt before the remote request. Repeated clicks and
  // uncertain network outcomes reuse exactly the same provider idempotency key.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
    const order = await tx.adOrder.findFirst({
      where: { id: orderId, userId },
      include: { user: true, event: { include: { sportCompetition: true } } },
    });
    if (!order || !order.user.status || !order.event.status)
      throw new PaymentError(404, "Pedido não encontrado.");
    if (
      order.amountCents <= 0 ||
      ["paid", "free", "refunded"].includes(order.status)
    )
      throw new PaymentError(409, "Este pedido não precisa de pagamento.");
    assertPayablePeriod(order);
    if (order.checkoutId)
      throw new PaymentError(
        409,
        "Este pedido já possui um pagamento em andamento. Consulte seu painel.",
      );
    if (order.event.moderationStatus === "rejected")
      throw new PaymentError(409, "Corrija o evento recusado antes de pagar.");
    if (
      order.paymentEnvironment &&
      order.paymentEnvironment !== config.environment
    )
      throw new PaymentError(409, "O pagamento não corresponde ao pedido.");
    let existing = await tx.paymentAttempt.findUnique({ where: { orderId } });
    if (
      existing?.result &&
      (existing.result as { status?: string }).status === "DECLINED"
    ) {
      await tx.paymentAttempt.delete({ where: { id: existing.id } });
      existing = null;
    }
    if (existing) {
      if (existing.method !== input.method)
        throw new PaymentError(
          409,
          "Este pedido já possui um pagamento em andamento. Consulte seu painel.",
        );
      return;
    }
    if (!validDocument(order.user.cpfCnpj) || !order.user.email)
      throw new PaymentError(
        400,
        "Confira seu CPF ou CNPJ e email em Minha conta.",
      );
    const method = input.method as string;
    if (
      method === "CREDIT_CARD" &&
      (typeof input.encryptedCard !== "string" ||
        input.encryptedCard.length < 100 ||
        input.encryptedCard.length > 10000 ||
        typeof input.holder !== "string" ||
        input.holder.trim().length < 3 ||
        typeof input.holderTaxId !== "string" ||
        input.holderTaxId.replace(/\D/g, "").length !== 11 ||
        !validDocument(input.holderTaxId))
    )
      throw new PaymentError(400, "Confira os dados do cartão.");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const phone = order.user.phone?.replace(/\D/g, "");
    const payload = {
      reference_id: orderId,
      customer: {
        name: order.user.name,
        email: order.user.email,
        tax_id: order.user.cpfCnpj!.replace(/\D/g, ""),
        ...(phone && [10, 11].includes(phone.length)
          ? {
              phones: [
                {
                  country: "55",
                  area: phone.slice(0, 2),
                  number: phone.slice(2),
                  type: phone.length === 11 ? "MOBILE" : "HOME",
                },
              ],
            }
          : {}),
      },
      items: [
        {
          reference_id: orderId,
          name:
            order.placement === "carousel"
              ? "Anúncio UP Point — carrossel"
              : "Anúncio UP Point — cards",
          quantity: 1,
          unit_amount: order.amountCents,
        },
      ],
      charges: [
        {
          reference_id: orderId,
          description: "Divulgação de evento UP Point",
          amount: { value: order.amountCents, currency: "BRL" },
          payment_method:
            method === "PIX"
              ? { type: method, pix: { expiration_date: expires } }
              : {
                  type: method,
                  installments: 1,
                  capture: true,
                  card: {
                    encrypted: input.encryptedCard as string,
                    store: false,
                  },
                  holder: {
                    name: (input.holder as string).trim(),
                    tax_id: (input.holderTaxId as string).replace(/\D/g, ""),
                  },
                },
        },
      ],
      ...(config.webhook ? { notification_urls: [config.webhook] } : {}),
    };
    await tx.paymentAttempt.create({
      data: { id: randomUUID(), orderId, method, payload },
    });
    await tx.adOrder.update({
      where: { id: orderId },
      data: {
        paymentEnvironment: config.environment,
        paymentMethod: method,
        checkoutExpiresAt: new Date(expires),
      },
    });
  });
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
      const attempt = await tx.paymentAttempt.findUniqueOrThrow({
        where: { orderId },
      });
      if (attempt.result) return attempt.result as unknown as InlineResult;
      const remote = await providerRequest<ProviderOrder>(
        "/orders",
        attempt.payload,
        attempt.id.replace(/-/g, ""),
      );
      if (
        !/^ORDE_[A-Z0-9-]+$/i.test(remote.id) ||
        remote.reference_id !== orderId
      )
        throw new PaymentError(
          502,
          "O PagBank retornou uma resposta inválida.",
        );
      const charge = remote.charges?.[0];
      const order = await tx.adOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      const result: InlineResult = {
        status: charge?.status ?? "WAITING",
        method: attempt.method,
        environment: config.environment,
        ...(charge?.qr_code?.text
          ? {
              pix: charge.qr_code.text,
              expiresAt: order.checkoutExpiresAt?.toISOString(),
            }
          : {}),
      };
      await tx.adOrder.update({
        where: { id: orderId },
        data: {
          providerOrderId: remote.id,
          status:
            charge?.status === "DECLINED" ? "declined" : "awaiting_payment",
        },
      });
      // Clear encrypted card material as soon as the request has a definitive response.
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { result, payload: { reference_id: orderId } },
      });
      return result;
    },
    { timeout: 20000 },
  );
}
