import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID, createHash } from "node:crypto";
import { hash, compare } from "bcryptjs";
import prisma from "../src/prisma";
import { createRecoveryRouter } from "../src/portal/recovery";
import { portal, portalError } from "../src/portal/routes";
import { sign } from "jsonwebtoken";

test(
  "recovery is generic, stores only a hash, expires, consumes once and revokes sessions",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const email = `recovery-${randomUUID()}@example.test`;
    const user = await prisma.users.create({
      data: {
        name: "Recovery QA",
        email,
        password: await hash("OldPassword123!", 12),
      },
    });
    const links: string[] = [];
    const app = express();
    app.use(express.json());
    app.use(
      createRecoveryRouter(async (_email, url) => {
        links.push(url);
      }),
    );
    app.use(portal);
    app.use(portalError);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const post = (route: string, body: unknown) =>
      fetch(base + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      const existing = await (
        await post("/auth/forgot-password", { email })
      ).json();
      const unknown = await (
        await post("/auth/forgot-password", {
          email: `unknown-${randomUUID()}@example.test`,
        })
      ).json();
      assert.deepEqual(existing, unknown);
      await post("/auth/forgot-password", { email });
      assert.equal(links.length, 1);
      const token = new URLSearchParams(new URL(links[0]).hash.slice(1)).get(
        "token",
      )!;
      const record = await prisma.passwordReset.findFirstOrThrow({
        where: { userId: user.id },
      });
      assert.notEqual(record.tokenHash, token);
      assert.equal(
        record.tokenHash,
        createHash("sha256").update(token).digest("hex"),
      );
      const oldToken = sign({ sv: 0 }, process.env.JWT_SECRET!, {
        subject: user.id,
        expiresIn: "8h",
      });
      assert.equal(
        (
          await post("/auth/reset-password", {
            token,
            password: "NewPassword123!",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post("/auth/reset-password", {
            token,
            password: "AnotherPassword123!",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(base + "/auth/me", {
            headers: { Authorization: `Bearer ${oldToken}` },
          })
        ).status,
        401,
      );
      assert.equal(
        await compare(
          "NewPassword123!",
          (await prisma.users.findUniqueOrThrow({ where: { id: user.id } }))
            .password,
        ),
        true,
      );
      await prisma.passwordReset.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 120000) },
      });
      await post("/auth/forgot-password", { email });
      const expiredToken = new URLSearchParams(
        new URL(links[1]).hash.slice(1),
      ).get("token")!;
      await prisma.passwordReset.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (
          await post("/auth/reset-password", {
            token: expiredToken,
            password: "AnotherPassword123!",
          })
        ).status,
        400,
      );
    } finally {
      await prisma.users.delete({ where: { id: user.id } });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
    }
  },
);
