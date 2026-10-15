import { test } from "node:test";
import assert from "node:assert/strict";
import { sign } from "jsonwebtoken";
import type { Request, Response } from "express";
import { createAuthMiddleware } from "../src/middlewares/isLogged";
const key = "test-only-secret-with-at-least-thirty-two-characters";
process.env.JWT_SECRET = key;
async function check(authorization?: string, version: number | null = 0) {
  const req = { headers: { authorization } } as Request;
  let status = 0,
    forwarded = 0;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  await createAuthMiddleware(async () =>
    version === null ? null : { sessionVersion: version },
  )(req, res, () => {
    forwarded++;
  });
  return { status, forwarded, user: req.user_id };
}
test("sem token, token adulterado ou formato errado nunca chama next", async () => {
  for (const value of [undefined, "Basic abc", "Bearer invalid", "Bearer a b"])
    assert.deepEqual(await check(value), {
      status: 401,
      forwarded: 0,
      user: undefined,
    });
});
test("token expirado ou sem subject nunca passa", async () => {
  assert.equal(
    (await check("Bearer " + sign({}, key, { subject: "user", expiresIn: -1 })))
      .forwarded,
    0,
  );
  assert.equal((await check("Bearer " + sign({}, key))).forwarded, 0);
});
test("token válido identifica usuário; bloqueado e versão revogada são recusados", async () => {
  const token =
    "Bearer " + sign({ sv: 0 }, key, { subject: "owner", algorithm: "HS256" });
  assert.deepEqual(await check(token), {
    status: 0,
    forwarded: 1,
    user: "owner",
  });
  assert.equal((await check(token, null)).status, 401);
  assert.equal((await check(token, 1)).status, 401);
});
test("outros algoritmos não são aceitos", async () => {
  assert.equal(
    (
      await check(
        "Bearer " + sign({}, key, { subject: "owner", algorithm: "HS512" }),
      )
    ).status,
    401,
  );
});

test("authentication fails closed when the database is unavailable or signing config is missing", async () => {
  const authorization = "Bearer " + sign({ sv: 0 }, key, { subject: "owner" });
  const req = { headers: { authorization } } as Request;
  let status = 0, authenticated = false, failure: unknown;
  const res = { status(code: number) { status = code; return this; }, json() { return this; } } as unknown as Response;
  const unavailable = new Error("simulated database outage");
  await createAuthMiddleware(async () => { throw unavailable; })(req, res, (error) => {
    failure = error;
    if (!error) authenticated = true;
  });
  assert.equal(failure, unavailable);
  assert.equal(authenticated, false);
  const saved = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    await createAuthMiddleware(async () => { throw new Error("must not query"); })(req, res, () => { authenticated = true; });
    assert.equal(status, 503);
    assert.equal(authenticated, false);
  } finally { process.env.JWT_SECRET = saved; }
});
