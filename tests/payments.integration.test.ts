import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { sign } from "jsonwebtoken";
import prisma from "../src/prisma";
import { payments, paymentWebhook } from "../src/portal/payments";
import { portalError } from "../src/portal/routes";

test(
  "checkout reaproveitado, confirmação autenticada, moeda/valor e estorno preservam histórico",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const before = { ...process.env };
    const actualFetch = globalThis.fetch;
    const userId = randomUUID(),
      otherId = randomUUID(),
      categoryId = randomUUID(),
      eventId = randomUUID(),
      orderId = randomUUID();
    const checkoutId = `CHEC_${randomUUID().toUpperCase()}`,
      remoteId = `ORDE_${randomUUID().toUpperCase()}`,
      chargeId = `CHAR_${randomUUID().toUpperCase()}`;
    let posts = 0;
    let state = "WAITING";
    let amount = 1000;
    let currency = "BRL";
    const paidAt = new Date().toISOString();
    const payloads: string[] = [];
    process.env.PAGBANK_TOKEN = "mock-provider-token";
    process.env.PAGBANK_ENVIRONMENT = "sandbox";
    process.env.PAGBANK_WEBHOOK_URL =
      "https://example.test/payments/pagbank/webhook";
    process.env.PAGBANK_DEBIT_ENABLED = "true";
    const remoteOrder = () => ({
      id: remoteId,
      reference_id: orderId,
      charges: [
        {
          id: chargeId,
          status: state,
          paid_at: paidAt,
          amount: {
            value: amount,
            currency,
            summary: {
              paid: state === "WAITING" ? 0 : 1000,
              refunded: state === "CANCELED" ? 1000 : 0,
            },
          },
          payment_method: { type: "DEBIT_CARD" },
        },
      ],
    });
    const checkout = () => ({
      id: checkoutId,
      reference_id: orderId,
      status: "ACTIVE",
      expiration_date: new Date(Date.now() + 86400000).toISOString(),
      links: [
        {
          rel: "PAY",
          href: "https://sandbox.pagamento.pagseguro.uol.com.br/pagamento?code=test",
        },
      ],
      orders: [{ id: remoteId, reference_id: orderId }],
    });
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = String(input);
      if (!url.startsWith("https://sandbox.api.pagseguro.com"))
        return actualFetch(input, init);
      if (init?.method === "POST") {
        posts++;
        payloads.push(String(init.body));
        return new Response(JSON.stringify(checkout()), { status: 200 });
      }
      return new Response(
        JSON.stringify(url.includes("/orders/") ? remoteOrder() : checkout()),
        { status: 200 },
      );
    }) as typeof fetch;
    const app = express();
    app.post(
      "/payments/pagbank/webhook",
      express.raw({ type: "application/json" }),
      paymentWebhook,
    );
    app.use(express.json());
    app.use(payments);
    app.use(portalError);
    const server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    const token = sign({}, process.env.JWT_SECRET!, {
      subject: userId,
      expiresIn: "5m",
      algorithm: "HS256",
    });
    const foreign = sign({}, process.env.JWT_SECRET!, {
      subject: otherId,
      expiresIn: "5m",
      algorithm: "HS256",
    });
    const post = (route: string, authorization = token) =>
      actualFetch(base + route, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authorization}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountCents: 1 }),
      });
    try {
      await prisma.users.createMany({
        data: [
          {
            id: userId,
            name: "Payment test",
            email: `${userId}@example.test`,
            password: "not-a-login-hash",
          },
          {
            id: otherId,
            name: "Other test",
            email: `${otherId}@example.test`,
            password: "not-a-login-hash",
          },
        ],
      });
      await prisma.categories.create({
        data: { id: categoryId, name: "Payment test", idUserOwner: userId },
      });
      await prisma.events.create({
        data: {
          id: eventId,
          idUserOwner: userId,
          idCategory: categoryId,
          name: "Evento teste pagamento",
          description: "Anúncio fictício usado no teste de integração.",
          localityEvent: "Local teste",
          urlLocalityEvent: "",
          bannerImageUrl: "https://example.test/banner.png",
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
      assert.equal(
        (await post(`/payments/orders/${orderId}/checkout`, foreign)).status,
        404,
      );
      const responses = await Promise.all([
        post(`/payments/orders/${orderId}/checkout`),
        post(`/payments/orders/${orderId}/checkout`),
      ]);
      assert.ok(responses.every((x) => x.status === 200));
      assert.equal(posts, 1);
      const body = JSON.parse(payloads[0]) as {
        items: { unit_amount: number }[];
        payment_methods: { type: string }[];
      };
      assert.equal(body.items[0].unit_amount, 1000);
      assert.deepEqual(
        body.payment_methods.map((x) => x.type),
        ["PIX", "CREDIT_CARD", "DEBIT_CARD"],
      );
      const raw = JSON.stringify(remoteOrder());
      assert.equal(
        (
          await actualFetch(base + "/payments/pagbank/webhook", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-authenticity-token": "bad",
            },
            body: raw,
          })
        ).status,
        401,
      );
      assert.equal(
        (await post(`/payments/orders/${orderId}/sync`)).status,
        200,
      );
      assert.equal(
        (await prisma.adOrder.findUniqueOrThrow({ where: { id: orderId } }))
          .status,
        "awaiting_payment",
      );
      state = "PAID";
      amount = 999;
      await post(`/payments/orders/${orderId}/sync`);
      assert.notEqual(
        (await prisma.adOrder.findUniqueOrThrow({ where: { id: orderId } }))
          .status,
        "paid",
      );
      amount = 1000;
      currency = "USD";
      await post(`/payments/orders/${orderId}/sync`);
      assert.notEqual(
        (await prisma.adOrder.findUniqueOrThrow({ where: { id: orderId } }))
          .status,
        "paid",
      );
      currency = "BRL";
      const notification = JSON.stringify(remoteOrder());
      const signature = createHash("sha256")
        .update(`mock-provider-token-${notification}`)
        .digest("hex");
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await actualFetch(base + "/payments/pagbank/webhook", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-authenticity-token": signature,
              },
              body: notification,
            })
          ).status,
          204,
        );
      const paid = await prisma.adOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      assert.equal(paid.status, "paid");
      assert.equal(paid.paymentMethod, "DEBIT_CARD");
      assert.equal(paid.providerPaymentId, chargeId);
      assert.equal(paid.paidAt?.toISOString(), paidAt);
      assert.equal(
        (await post(`/payments/orders/${orderId}/checkout`)).status,
        409,
      );
      state = "CANCELED";
      await post(`/payments/orders/${orderId}/sync`);
      const refunded = await prisma.adOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      assert.equal(refunded.status, "refunded");
      assert.equal(refunded.paidAt?.toISOString(), paidAt);
    } finally {
      globalThis.fetch = actualFetch;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await prisma.paymentEmail.deleteMany({where:{orderId}});
      await prisma.adOrder.deleteMany({ where: { id: orderId } });
      await prisma.events.deleteMany({ where: { id: eventId } });
      await prisma.categories.deleteMany({ where: { id: categoryId } });
      await prisma.users.deleteMany({
        where: { id: { in: [userId, otherId] } },
      });
      await prisma.$disconnect();
      for (const key of Object.keys(process.env))
        if (!(key in before)) delete process.env[key];
      Object.assign(process.env, before);
    }
  },
);
