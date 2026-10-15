import { createHash, timingSafeEqual } from "node:crypto";

export class PaymentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Charge {
  id: string;
  status: string;
  paid_at?: string;
  qr_code?: {id:string;text:string};
  amount: {
    value: number;
    currency: string;
    summary?: { paid: number; refunded: number };
  };
  payment_method: { type: string };
}
export interface ProviderOrder {
  id: string;
  reference_id: string;
  charges?: Charge[];
}
export interface Checkout {
  id: string;
  reference_id: string;
  status: string;
  expiration_date: string;
  links?: { rel: string; href: string }[];
  orders?: ProviderOrder[];
}
export function paymentConfig() {
  const environment = process.env.PAGBANK_ENVIRONMENT ?? "sandbox";
  if (!["sandbox", "production"].includes(environment))
    throw new PaymentError(503, "Configure o PagBank para receber pagamentos.");
  const token = process.env.PAGBANK_TOKEN?.trim();
  const frontend = process.env.PAGBANK_FRONTEND_URL ?? "http://127.0.0.1:5174";
  const webhook = process.env.PAGBANK_WEBHOOK_URL?.trim();
  if (
    !token ||
    (!webhook &&
      (environment === "production" || process.env.NODE_ENV === "production"))
  )
    throw new PaymentError(503, "Configure o PagBank para receber pagamentos.");
  try {
    const hook = webhook ? new URL(webhook) : null,
      back = new URL(frontend);
    if (
      (hook &&
        (hook.protocol !== "https:" ||
          hook.username ||
          hook.password ||
          webhook!.length > 100)) ||
      !["http:", "https:"].includes(back.protocol) ||
      back.username ||
      back.password ||
      (environment === "production" && back.protocol !== "https:")
    )
      throw Error();
  } catch {
    throw new PaymentError(503, "Configure o PagBank para receber pagamentos.");
  }
  return {
    environment,
    token,
    frontend: new URL(frontend).origin,
    webhook,
    base:
      environment === "production"
        ? "https://api.pagseguro.com"
        : "https://sandbox.api.pagseguro.com",
    debitEnabled: process.env.PAGBANK_DEBIT_ENABLED === "true",
  };
}
export function paymentsReady() {
  try {
    paymentConfig();
    return true;
  } catch {
    return false;
  }
}
export function verifyNotification(
  raw: Buffer,
  signature: string | undefined,
  token: string,
) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHash("sha256")
    .update(token)
    .update("-")
    .update(raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function providerRequest<T>(
  route: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const config = paymentConfig();
  let response: Response;
  try {
    response = await fetch(config.base + route, {
      method: body ? "POST" : "GET",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "UPPoint/1.0",
        ...(key ? { "x-idempotency-key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new PaymentError(
      502,
      "Não foi possível conectar ao PagBank. Tente novamente.",
    );
  }
  if (!response.ok)
    throw new PaymentError(
      502,
      "O PagBank não concluiu a solicitação. Confira a configuração ou tente novamente.",
    );
  return (await response.json()) as T;
}
export function paymentLink(checkout: Checkout) {
  const href = checkout.links?.find((x) => x.rel === "PAY")?.href;
  try {
    const url = new URL(href ?? "");
    const hosts =
      paymentConfig().environment === "production"
        ? ["pagamento.pagbank.com.br", "pagamento.pagseguro.uol.com.br"]
        : [
            "pagamento.sandbox.pagbank.com.br",
            "sandbox.pagamento.pagseguro.uol.com.br",
            "sandbox.pagamento.pagbank.com.br",
          ];
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !hosts.includes(url.hostname)
    )
      throw Error();
    return url.href;
  } catch {
    throw new PaymentError(502, "O PagBank retornou uma resposta inválida.");
  }
}
export function checkoutPayload(
  id: string,
  amountCents: number,
  placement: string,
  expires: Date,
) {
  const config = paymentConfig();
  return {
    reference_id: id,
    expiration_date: expires.toISOString(),
    customer_modifiable: true,
    items: [
      {
        reference_id: id,
        name:
          placement === "carousel"
            ? "Anúncio UP Point — carrossel"
            : "Anúncio UP Point — cards",
        quantity: 1,
        unit_amount: amountCents,
      },
    ],
    payment_methods: [
      { type: "PIX" },
      { type: "CREDIT_CARD" },
      ...(config.debitEnabled ? [{ type: "DEBIT_CARD" }] : []),
    ],
    payment_methods_configs: [
      {
        type: "CREDIT_CARD",
        config_options: [{ option: "INSTALLMENTS_LIMIT", value: "1" }],
      },
    ],
    ...(new URL(config.frontend).protocol === "https:"
      ? {
          redirect_url: `${config.frontend}/minha-conta?payment=${encodeURIComponent(id)}`,
          return_url: `${config.frontend}/minha-conta?payment=${encodeURIComponent(id)}`,
        }
      : {}),
    ...(config.webhook
      ? {
          notification_urls: [config.webhook],
          payment_notification_urls: [config.webhook],
        }
      : {}),
  };
}
export function verifiedCharge(
  order: ProviderOrder,
  id: string,
  expected: number,
) {
  if (order.reference_id !== id)
    throw new PaymentError(409, "O pagamento não corresponde ao pedido.");
  const charges = Array.isArray(order.charges) ? order.charges : [];
  return charges.find(
    (c) =>
      c.status === "PAID" &&
      c.amount?.value === expected &&
      c.amount.currency === "BRL" &&
      c.amount.summary?.paid === expected &&
      c.amount.summary.refunded === 0 &&
      ["PIX", "CREDIT_CARD", "DEBIT_CARD", "PAGBANK"].includes(
        c.payment_method?.type,
      ) &&
      !!c.paid_at &&
      Number.isFinite(Date.parse(c.paid_at)),
  );
}
