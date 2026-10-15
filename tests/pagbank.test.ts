import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  verifyNotification,
  verifiedCharge,
  checkoutPayload,
  paymentConfig,
  paymentLink,
} from "../src/portal/pagbank";
test("assinatura PagBank exige os bytes originais e token correto", () => {
  const raw = Buffer.from('{"id":"ORDE_TEST","status":"PAID"}');
  const token = "fake-test-token";
  const signature = createHash("sha256")
    .update(`${token}-${raw.toString()}`)
    .digest("hex");
  assert.equal(verifyNotification(raw, signature, token), true);
  assert.equal(
    verifyNotification(
      Buffer.from('{ "id":"ORDE_TEST","status":"PAID"}'),
      signature,
      token,
    ),
    false,
  );
  assert.equal(verifyNotification(raw, signature, "wrong"), false);
  assert.equal(verifyNotification(raw, "invalid", token), false);
});
test("pagamento só é confirmado com referência, moeda, total, captura e data válidos", () => {
  const charge = {
    id: "CHAR_TEST",
    status: "PAID",
    paid_at: new Date().toISOString(),
    amount: {
      value: 1000,
      currency: "BRL",
      summary: { paid: 1000, refunded: 0 },
    },
    payment_method: { type: "PIX" },
  };
  assert.equal(
    verifiedCharge(
      { id: "ORDE_TEST", reference_id: "local", charges: [charge] },
      "local",
      1000,
    )?.id,
    "CHAR_TEST",
  );
  assert.throws(() =>
    verifiedCharge(
      { id: "ORDE_TEST", reference_id: "foreign", charges: [charge] },
      "local",
      1000,
    ),
  );
  for (const changed of [
    { ...charge, status: "AUTHORIZED" },
    { ...charge, paid_at: "invalid" },
    { ...charge, amount: { ...charge.amount, currency: "USD" } },
    { ...charge, amount: { ...charge.amount, value: 999 } },
    {
      ...charge,
      amount: { ...charge.amount, summary: { paid: 1000, refunded: 1 } },
    },
  ])
    assert.equal(
      verifiedCharge(
        { id: "ORDE_TEST", reference_id: "local", charges: [changed] },
        "local",
        1000,
      ),
      undefined,
    );
});
test("checkout permite PIX, crédito e débito liberado sem receber dados de cartão", () => {
  const previous = { ...process.env };
  try {
    process.env.PAGBANK_TOKEN = "fake-test-token";
    process.env.PAGBANK_ENVIRONMENT = "sandbox";
    process.env.PAGBANK_FRONTEND_URL = "http://127.0.0.1:5174";
    delete process.env.PAGBANK_WEBHOOK_URL;
    delete process.env.NODE_ENV;
    process.env.PAGBANK_DEBIT_ENABLED = "true";
    const payload = checkoutPayload(
      "local",
      5000,
      "carousel",
      new Date("2027-01-01T00:00:00Z"),
    );
    assert.deepEqual(
      payload.payment_methods.map((x) => x.type),
      ["PIX", "CREDIT_CARD", "DEBIT_CARD"],
    );
    assert.equal(payload.items[0].unit_amount, 5000);
    assert.equal("customer" in payload, false);
    assert.equal("shipping" in payload, false);
    process.env.PAGBANK_DEBIT_ENABLED = "false";
    assert.equal(
      checkoutPayload("local", 1000, "cards", new Date()).payment_methods.some(
        (x) => x.type === "DEBIT_CARD",
      ),
      false,
    );
    assert.throws(() =>
      paymentLink({
        id: "CHEC_TEST",
        reference_id: "local",
        status: "ACTIVE",
        expiration_date: "",
        links: [{ rel: "PAY", href: "https://attacker.test/" }],
      }),
    );
    process.env.PAGBANK_ENVIRONMENT = "production";
    assert.throws(paymentConfig);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
