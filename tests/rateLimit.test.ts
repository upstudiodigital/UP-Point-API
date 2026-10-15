import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { authGuard } from "../src/portal/authGuard";

test("rate limit accepts 30 attempts, rejects attempt 31 and isolates client IPs", () => {
  let forwarded = 0, status = 0, retry = 0;
  const response = {
    setHeader(name: string, value: number) { if (name === "Retry-After") retry = value; },
    status(code: number) { status = code; return this; },
    json() { return this; },
  } as unknown as Response;
  const request = { ip: "qa-rate-limit-isolated" } as Request;
  for (let i = 0; i < 30; i++) authGuard(request, response, () => { forwarded++; });
  assert.equal(forwarded, 30);
  authGuard(request, response, () => { forwarded++; });
  assert.equal(forwarded, 30);
  assert.equal(status, 429);
  assert.ok(retry > 0 && retry <= 900);
  authGuard({ ip: "qa-other-isolated" } as Request, response, () => { forwarded++; });
  assert.equal(forwarded, 31);
});
