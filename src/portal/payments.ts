import { assertPayablePeriod } from "./payablePeriod";
import { deliverReceipts } from "./receipts";

import { inlinePayment } from "./inlinePayments";

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";

import prisma from "../prisma";

import { isLogged } from "../middlewares/isLogged";

import {
  paymentConfig,
  paymentsReady,
  PaymentError,
  providerRequest,
  paymentLink,
  checkoutPayload,
  verifyNotification,
  verifiedCharge,
  type Checkout,
  type ProviderOrder,
} from "./pagbank";

export const payments = Router();

const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };

const limits = new Map<string, { count: number; until: number }>();

const limit = (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();

  for (const [id, value] of limits) if (value.until < now) limits.delete(id);

  const entry = limits.get(req.user_id) ?? { count: 0, until: now + 60000 };

  if (entry.count >= 20) {
    res.setHeader("Retry-After", "60");

    return res

      .status(429)

      .json({ message: "Aguarde um momento antes de verificar novamente." });
  }

  entry.count++;

  limits.set(req.user_id, entry);

  next();
};

const activeUser = async (req: Request) => {
  const user = await prisma.users.findFirst({
    where: { id: req.user_id, status: true },
  });

  if (!user) throw new PaymentError(401, "Entre novamente.");

  return user;
};

export async function reconcileProviderOrder(remote: ProviderOrder) {
  if (typeof remote.reference_id !== "string")
    throw new PaymentError(400, "Notificação inválida.");

  const order = await prisma.adOrder.findUnique({
    where: { id: remote.reference_id },
  });

  if (!order || order.amountCents === 0) return;

  if (
    !order.checkoutId &&
    (!order.providerOrderId || order.providerOrderId !== remote.id)
  )
    throw new PaymentError(503, "Aguarde a confirmação do pagamento.");

  if (order.paymentEnvironment !== paymentConfig().environment)
    throw new PaymentError(409, "O pagamento não corresponde ao pedido.");

  const paid = verifiedCharge(remote, order.id, order.amountCents);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;

    const current = await tx.adOrder.findUniqueOrThrow({
      where: { id: order.id },
    });

    if (paid) {
      if (current.status === "refunded") return;

      if (current.providerPaymentId && current.providerPaymentId !== paid.id)
        throw new PaymentError(409, "O pagamento não corresponde ao pedido.");

      await tx.adOrder.update({
        where: { id: order.id },

        data: {
          status: "paid",

          providerOrderId: remote.id,

          providerPaymentId: paid.id,

          paidAt: new Date(paid.paid_at!),

          paymentMethod: paid.payment_method.type,
        },
      });

      // Only the first confirmed payment releases the ad. Replayed notifications
      // must never override later rejection, deletion or a fresh moderation review.
      if (current.status !== "paid") {
        await tx.events.updateMany({
          where: {
            id: order.eventId,
            status: true,
            moderationStatus: { not: "rejected" },
            userOwner: { status: true },
          },
          data: {
            moderationStatus: "approved",
            featuredPriority: current.placement === "carousel" ? 1 : null,
          },
        });
      }

      const customer = await tx.users.findUniqueOrThrow({
        where: { id: current.userId },
      });

      for (const recipientType of ["customer", "finance"]) {
        await tx.paymentEmail.upsert({
          where: {
            orderId_recipientType: { orderId: order.id, recipientType },
          },
          create: {
            orderId: order.id,
            recipientType,
            recipient:
              recipientType === "customer"
                ? customer.email
                : process.env.FINANCE_EMAIL,
          },
          update: {},
        });
      }

      return;
    }

    const reversal = remote.charges?.find(
      (c) =>
        c.id === current.providerPaymentId &&
        (c.status === "CANCELED" || (c.amount?.summary?.refunded ?? 0) > 0),
    );

    if (reversal && current.status === "paid") {
      await tx.adOrder.update({
        where: { id: order.id },

        data: { status: "refunded" },
      });

      await tx.events.update({
        where: { id: order.eventId },

        data: { moderationStatus: "pending", featuredPriority: null },
      });
    } else if (!["paid", "free", "refunded"].includes(current.status)) {
      const status = remote.charges?.some((c) => c.status === "IN_ANALYSIS")
        ? "in_analysis"
        : remote.charges?.some((c) => c.status === "WAITING")
          ? "awaiting_payment"
          : remote.charges?.some((c) => c.status === "DECLINED")
            ? "declined"
            : "awaiting_payment";

      await tx.adOrder.update({
        where: { id: order.id },

        data: { status, providerOrderId: remote.id },
      });
    }
  });

  void deliverReceipts().catch(() => {});
}

async function syncCheckout(id: string, checkoutId: string) {
  const remote = await providerRequest<Checkout>(
    `/checkouts/${encodeURIComponent(checkoutId)}?limit=100`,
  );

  if (remote.id !== checkoutId || remote.reference_id !== id)
    throw new PaymentError(409, "O pagamento não corresponde ao pedido.");

  for (const item of remote.orders ?? []) {
    if (!/^ORDE_[A-Z0-9-]+$/i.test(item.id)) continue;

    await reconcileProviderOrder(
      await providerRequest<ProviderOrder>(`/orders/${item.id}`),
    );
  }

  if (
    remote.status === "EXPIRED" ||
    Date.parse(remote.expiration_date) <= Date.now()
  )
    await prisma.adOrder.updateMany({
      where: { id, status: { notIn: ["paid", "free", "refunded"] } },

      data: { status: "expired" },
    });

  return remote;
}

payments.post(
  "/payments/orders/:id/checkout",

  isLogged,

  limit,

  run(async (req, res) => {
    await activeUser(req);

    const config = paymentConfig();

    // Commit the exact request before contacting the provider. A timeout must not

    // roll back the payload and change it when the stable idempotency key is retried.

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.id}))`;

      const order = await tx.adOrder.findFirst({
        where: { id: req.params.id, userId: req.user_id },

        include: { event: { include: { sportCompetition: true } } },
      });

      if (!order || !order.event.status)
        throw new PaymentError(404, "Pedido não encontrado.");

      if (
        order.amountCents <= 0 ||
        ["paid", "free", "refunded"].includes(order.status)
      )
        throw new PaymentError(409, "Este pedido não precisa de pagamento.");

      if (
        order.paymentEnvironment &&
        order.paymentEnvironment !== config.environment
      )
        throw new PaymentError(409, "O pagamento não corresponde ao pedido.");

      if (
        order.checkoutExpiresAt &&
        order.checkoutExpiresAt.getTime() <= Date.now()
      )
        throw new PaymentError(
          409,

          "Este pagamento expirou. Entre em contato com a equipe.",
        );

      if (!order.checkoutPayload) {
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await tx.adOrder.update({
          where: { id: order.id },

          data: {
            checkoutPayload: checkoutPayload(
              order.id,

              order.amountCents,

              order.placement,

              expires,
            ),

            checkoutExpiresAt: expires,

            paymentEnvironment: config.environment,
          },
        });
      }
    });

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.id}))`;

        const order = await tx.adOrder.findFirst({
          where: { id: req.params.id, userId: req.user_id },

          include: { event: { include: { sportCompetition: true } } },
        });

        if (!order || !order.event.status)
          throw new PaymentError(404, "Pedido não encontrado.");
        assertPayablePeriod(order);

        if (
          order.amountCents <= 0 ||
          ["paid", "free", "refunded"].includes(order.status)
        )
          throw new PaymentError(409, "Este pedido não precisa de pagamento.");

        if (order.event.moderationStatus === "rejected")
          throw new PaymentError(
            409,

            "Corrija o evento recusado antes de pagar.",
          );

        if (order.checkoutId) {
          if (order.paymentEnvironment !== config.environment)
            throw new PaymentError(
              409,

              "O pagamento não corresponde ao pedido.",
            );

          if (
            order.checkoutExpiresAt &&
            order.checkoutExpiresAt.getTime() <= Date.now()
          )
            throw new PaymentError(
              409,

              "Este pagamento expirou. Entre em contato com a equipe.",
            );

          return { url: order.checkoutUrl, environment: config.environment };
        }

        const expires =
          order.checkoutExpiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

        const payload =
          order.checkoutPayload ??
          checkoutPayload(
            order.id,

            order.amountCents,

            order.placement,

            expires,
          );

        // Persisted request + stable key make repeated submissions identical.

        await tx.adOrder.update({
          where: { id: order.id },

          data: {
            checkoutExpiresAt: expires,

            checkoutPayload: payload,

            paymentEnvironment: config.environment,
          },
        });

        const checkout = await providerRequest<Checkout>(
          "/checkouts",

          payload,

          order.id.replace(/[^a-z0-9]/gi, ""),
        );

        if (
          !/^CHEC_[A-Z0-9-]+$/i.test(checkout.id) ||
          checkout.reference_id !== order.id
        )
          throw new PaymentError(
            502,

            "O PagBank retornou uma resposta inválida.",
          );

        const url = paymentLink(checkout);

        await tx.adOrder.update({
          where: { id: order.id },

          data: {
            checkoutId: checkout.id,

            checkoutUrl: url,

            status: "awaiting_payment",

            paymentMethod: "PAGBANK",
          },
        });

        return { url, environment: config.environment };
      },

      { timeout: 20000 },
    );

    res.json(result);
  }),
);

payments.post(
  "/payments/orders/:id/sync",

  isLogged,

  limit,

  run(async (req, res) => {
    const user = await activeUser(req);

    const order = await prisma.adOrder.findFirst({
      where: {
        id: req.params.id,

        ...(user.typeAccess === "admin" ? {} : { userId: user.id }),
      },
    });

    if (!order) throw new PaymentError(404, "Pedido não encontrado.");

    if (order.checkoutId) {
      await syncCheckout(order.id, order.checkoutId);

      if (order.providerOrderId)
        await reconcileProviderOrder(
          await providerRequest<ProviderOrder>(
            `/orders/${encodeURIComponent(order.providerOrderId)}`,
          ),
        );
    }

    if (!order.checkoutId && order.providerOrderId)
      await reconcileProviderOrder(
        await providerRequest<ProviderOrder>(
          `/orders/${encodeURIComponent(order.providerOrderId)}`,
        ),
      );

    res.json({
      order: await prisma.adOrder.findUnique({ where: { id: order.id } }),
    });
  }),
);

payments.get(
  "/payments/orders/:id/payment",
  isLogged,
  limit,
  run(async (req, res) => {
    await activeUser(req);
    const order = await prisma.adOrder.findFirst({
      where: { id: req.params.id, userId: req.user_id },
    });
    if (!order) throw new PaymentError(404, "Pedido não encontrado.");
    const attempt = await prisma.paymentAttempt.findUnique({
      where: { orderId: order.id },
    });
    res.json({
      payment: attempt?.result ?? null,
      status: order.status,
      environment: paymentConfig().environment,
      legacyUrl: order.checkoutId ? order.checkoutUrl : null,
    });
  }),
);
payments.get(
  "/payments/public-key",
  isLogged,
  limit,
  run(async (req, res) => {
    await activeUser(req);
    const result = await providerRequest<{ public_key: string }>(
      "/public-keys",
      { type: "card" },
    );

    if (!result.public_key)
      throw new PaymentError(502, "O PagBank retornou uma resposta inválida.");

    res.json({ publicKey: result.public_key });
  }),
);

payments.post(
  "/payments/orders/:id/pay",
  isLogged,
  limit,
  run(async (req, res) => {
    await activeUser(req);

    const result = await inlinePayment(req.params.id, req.user_id, req.body);

    const local = await prisma.adOrder.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    if (local.providerOrderId)
      await reconcileProviderOrder(
        await providerRequest<ProviderOrder>(
          `/orders/${encodeURIComponent(local.providerOrderId)}`,
        ),
      );

    res.json({
      ...result,
      status: (
        await prisma.adOrder.findUniqueOrThrow({ where: { id: local.id } })
      ).status,
    });
  }),
);

export const paymentWebhook = run(async (req, res) => {
  if (!paymentsReady())
    throw new PaymentError(503, "Configure o PagBank para receber pagamentos.");

  if (
    !Buffer.isBuffer(req.body) ||
    !verifyNotification(
      req.body,

      req.get("x-authenticity-token"),

      paymentConfig().token,
    )
  )
    throw new PaymentError(401, "Notificação inválida.");

  let body: { id?: unknown; reference_id?: unknown };

  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch {
    throw new PaymentError(400, "Notificação inválida.");
  }

  if (typeof body.id !== "string")
    throw new PaymentError(400, "Notificação inválida.");

  if (/^ORDE_[A-Z0-9-]+$/i.test(body.id))
    await reconcileProviderOrder(
      await providerRequest<ProviderOrder>(`/orders/${body.id}`),
    );
  else if (/^CHEC_[A-Z0-9-]+$/i.test(body.id)) {
    const local = await prisma.adOrder.findUnique({
      where: { checkoutId: body.id },
    });

    if (local) await syncCheckout(local.id, body.id);
  } else throw new PaymentError(400, "Notificação inválida.");

  res.status(204).end();
});
