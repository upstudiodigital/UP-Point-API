import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  paymentConfig,
  checkoutPayload,
  type Checkout,
} from "../src/portal/pagbank";
async function main() {
  const config = paymentConfig();
  if (config.environment !== "sandbox")
    throw Error("Verificação permitida somente no sandbox.");
  const reference = randomUUID();
  const response = await fetch(`${config.base}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "UPPoint/1.0",
      "x-idempotency-key": reference.replaceAll("-", ""),
    },
    body: JSON.stringify(
      checkoutPayload(
        reference,
        1000,
        "cards",
        new Date(Date.now() + 86400000),
      ),
    ),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    let body: {
      error_messages?: { code?: string; parameter_name?: string }[];
    } = {};
    try {
      body = await response.json();
    } catch {}
    console.log(
      JSON.stringify({
        status: response.status,
        contentType: response.headers.get("content-type"),
        errors: body.error_messages?.map((x) => ({
          code: x.code,
          parameter: x.parameter_name,
        })),
      }),
    );
    process.exitCode = 1;
    return;
  }
  const checkout = (await response.json()) as Checkout;
  await writeFile(
    "../.local/pagbank-sandbox-checkout.json",
    JSON.stringify(checkout, null, 2),
  );
  const inspected = await fetch(`${config.base}/checkouts/${checkout.id}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(15000),
  });
  const queried = (await inspected.json()) as Record<string, unknown>;
  console.log(
    JSON.stringify({
      status: response.status,
      checkoutId: checkout.id,
      paymentHosts: checkout.links
        ?.filter((l) => l.rel === "PAY")
        .map((l) => new URL(l.href).hostname),
      queryStatus: inspected.status,
      queryFields: Object.keys(queried),
    }),
  );
}
void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      message: "Não foi possível validar a conexão com o sandbox.",
      type: error instanceof Error ? error.name : "unknown",
      code:
        typeof error === "object" && error && "cause" in error
          ? (error.cause as { code?: string } | undefined)?.code
          : undefined,
    }),
  );
  process.exitCode = 1;
});
