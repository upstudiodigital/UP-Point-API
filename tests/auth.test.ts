import { test } from "node:test";
import assert from "node:assert/strict";
import { sign } from "jsonwebtoken";
import type { Request, Response } from "express";
import { isLogged } from "../src/middlewares/isLogged";
const key = "test-only-secret-with-at-least-thirty-two-characters";
process.env.JWT_SECRET = key;
function check(authorization?: string) {
  const req = { headers: { authorization } } as Request;
  let status = 0, forwarded = 0;
  const res = { status(code: number) { status = code; return this; }, json() { return this; } } as unknown as Response;
  isLogged(req, res, () => { forwarded++; });
  return { status, forwarded, user: req.user_id };
}
test("sem token, token adulterado ou formato errado nunca chama next", () => {
  for (const token of [undefined, "Basic abc", "Bearer invalid", "Bearer a b"]) {
    assert.deepEqual(check(token), { status: 401, forwarded: 0, user: undefined });
  }
});
test("token expirado ou sem subject nunca passa", () => {
  assert.equal(check("Bearer " + sign({}, key, { subject: "user", expiresIn: -1 })).forwarded, 0);
  assert.equal(check("Bearer " + sign({}, key)).forwarded, 0);
});
test("token válido identifica o usuário e permite uma continuação", () => {
  assert.deepEqual(check("Bearer " + sign({}, key, { subject: "owner", algorithm: "HS256" })),
    { status: 0, forwarded: 1, user: "owner" });
});
test("outros algoritmos não são aceitos", () => {
  assert.equal(check("Bearer " + sign({}, key, { subject: "owner", algorithm: "HS512" })).status, 401);
});
