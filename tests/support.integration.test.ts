import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import express from "express";
import prisma from "../src/prisma";
import { support } from "../src/portal/support";
import { portalError } from "../src/portal/routes";
test(
  "support issues private protocols and only admins can read or resolve requests",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const admin = randomUUID(),
      client = randomUUID();
    let ticket = "";
    await prisma.users.createMany({
      data: [
        {
          id: admin,
          name: "Support QA",
          password: "not-a-login-account",
          typeAccess: "admin",
        },
        { id: client, name: "Client QA", password: "not-a-login-account" },
      ],
    });
    const app = express();
    app.use(express.json());
    app.use(support);
    app.use(portalError);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const headers = (id: string) => ({
      Authorization: `Bearer ${sign({ sv: 0 }, process.env.JWT_SECRET!, { subject: id, expiresIn: "1h" })}`,
      "Content-Type": "application/json",
    });
    try {
      const response = await fetch(base + "/support/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "qa@example.test",
          category: "report",
          description:
            "Solicitação fictícia apenas para validar o atendimento.",
        }),
      });
      assert.equal(response.status, 201);
      const data = (await response.json()) as { id: string; email?: string };
      ticket = data.id;
      assert.ok(ticket);
      assert.equal(data.email, undefined);
      assert.equal(
        (await fetch(base + "/admin/support", { headers: headers(client) }))
          .status,
        403,
      );
      assert.equal(
        (
          await fetch(base + `/admin/support/${ticket}`, {
            method: "PATCH",
            headers: headers(client),
            body: JSON.stringify({ status: "resolved" }),
          })
        ).status,
        403,
      );
      const list = (await (
        await fetch(base + "/admin/support", { headers: headers(admin) })
      ).json()) as { requests: { id: string }[] };
      assert.ok(list.requests.some((row) => row.id === ticket));
      assert.equal(
        (
          await fetch(base + `/admin/support/${ticket}`, {
            method: "PATCH",
            headers: headers(admin),
            body: JSON.stringify({ status: "resolved" }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await prisma.supportRequest.findUniqueOrThrow({
            where: { id: ticket },
          })
        ).status,
        "resolved",
      );
    } finally {
      if (ticket)
        await prisma.supportRequest.deleteMany({ where: { id: ticket } });
      await prisma.adminAudit.deleteMany({ where: { actorId: admin } });
      await prisma.users.deleteMany({ where: { id: { in: [admin, client] } } });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
    }
  },
);
