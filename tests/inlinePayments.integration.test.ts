import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/prisma";
import { inlinePayment } from "../src/portal/inlinePayments";
import { reconcileProviderOrder } from "../src/portal/payments";

test(
  "inline PIX: ownership, concurrent idempotency, authoritative amount and two deduplicated receipts",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const env = { ...process.env },
      actualFetch = globalThis.fetch;
    const userId = randomUUID(),
      categoryId = randomUUID(),
      eventId = randomUUID(),
      orderId = randomUUID();
    const remoteId = `ORDE_${randomUUID()}`,
      chargeId = `CHAR_${randomUUID()}`;
    let posts = 0;
    let captured: Record<string, unknown> = {};
    process.env.PAGBANK_TOKEN = "test-token";
    process.env.PAGBANK_ENVIRONMENT = "sandbox";
    delete process.env.SMTP_HOST;
    const remote = {
      id: remoteId,
      reference_id: orderId,
      charges: [
        {
          id: chargeId,
          status: "WAITING",
          amount: {
            value: 1000,
            currency: "BRL",
            summary: { paid: 0, refunded: 0 },
          },
          payment_method: { type: "PIX" },
          qr_code: { id: "QRCO_test", text: "mock-pix-code" },
          paid_at: new Date().toISOString(),
        },
      ],
    };
    globalThis.fetch = (async (input, init) => {
      if (String(input) === "https://sandbox.api.pagseguro.com/orders") {
        posts++;
        captured = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(remote));
      }
      return actualFetch(input, init);
    }) as typeof fetch;
    try {
      await prisma.users.create({
        data: {
          id: userId,
          name: "Inline test",
          email: `${userId}@example.test`,
          password: "not-a-password",
          cpfCnpj: "12345678909",
        },
      });
      await prisma.categories.create({
        data: { id: categoryId, name: "Inline test", idUserOwner: userId },
      });
      await prisma.events.create({
        data: {
          id: eventId,
          idUserOwner: userId,
          idCategory: categoryId,
          name: "Inline test",
          description: "Synthetic integration fixture",
          localityEvent: "Test venue",
          urlLocalityEvent: "",
          bannerImageUrl: "https://example.test/a.png",
          dateEvent: "2027-01-01",
          hourEvent: "20:00",
          city: "Florianópolis",
        },
      });
      await prisma.adOrder.create({
        data: {
          id: orderId,
          userId,
          eventId,
          placement: "cards",
          amountCents: 1000,
        },
      });
      await assert.rejects(
        inlinePayment(orderId, randomUUID(), { method: "PIX" }),
        /Pedido não encontrado/,
      );
      const results = await Promise.all([
        inlinePayment(orderId, userId, { method: "PIX" }),
        inlinePayment(orderId, userId, { method: "PIX" }),
      ]);
      assert.equal(posts, 1);
      assert.equal(results[0].pix, "mock-pix-code");
      assert.deepEqual(results[0], results[1]);
      assert.equal(
        (captured.items as { unit_amount: number }[])[0].unit_amount,
        1000,
      );
      await assert.rejects(
        inlinePayment(orderId, userId, { method: "CREDIT_CARD" }),
        /em andamento/,
      );
      assert.equal(await prisma.paymentEmail.count({ where: { orderId } }), 0);
      remote.charges[0].status = "PAID";
      remote.charges[0].amount.summary.paid = 1000;
      await reconcileProviderOrder(remote);
      await reconcileProviderOrder(remote);
      assert.equal(
        (await prisma.adOrder.findUniqueOrThrow({ where: { id: orderId } }))
          .paymentMethod,
        "PIX",
      );
      assert.equal(await prisma.paymentEmail.count({ where: { orderId } }), 2);
      await assert.rejects(
        inlinePayment(orderId, userId, { method: "PIX" }),
        /não precisa de pagamento/,
      );
    } finally {
      globalThis.fetch = actualFetch;
      await prisma.paymentEmail.deleteMany({ where: { orderId } });
      await prisma.paymentAttempt.deleteMany({ where: { orderId } });
      await prisma.adOrder.deleteMany({ where: { id: orderId } });
      await prisma.events.deleteMany({ where: { id: eventId } });
      await prisma.categories.deleteMany({ where: { id: categoryId } });
      await prisma.users.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
      for (const key of Object.keys(process.env))
        if (!(key in env)) delete process.env[key];
      Object.assign(process.env, env);
    }
  },
);
