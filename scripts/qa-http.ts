// Read-only bounded local black-box checks. Never targets production.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
async function main() {
const base = "http://127.0.0.1:3333";
const dir = "../testes/evidencias/2026-10-15-qa-ampliado";
const results: { scenario: string; status: string; detail?: string }[] = [];
async function check(scenario: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ scenario, status: "passed" }); }
  catch (error) { results.push({ scenario, status: "failed", detail: String(error) }); }
}
const get = (path: string, headers?: Record<string, string>) => fetch(base + path, { headers, signal: AbortSignal.timeout(10000) });
for (const path of ["/health", "/ready", "/events", "/events/featured", "/sports/competitions"]) {
  await check(`public GET ${path}`, async () => assert.equal((await get(path)).status, 200));
}
for (const path of ["/auth/me", "/account/dashboard", "/account/profile", "/admin/dashboard", "/admin/support", "/account/sports"]) {
  for (const token of ["", "Bearer forged.invalid.token"]) {
    await check(`private GET ${path} / ${token ? "forged" : "anonymous"}`, async () => {
      const r = await get(path, token ? { Authorization: token } : undefined);
      assert.equal(r.status, 401);
      assert.doesNotMatch(await r.text(), /password|JWT_SECRET|DATABASE_URL|node_modules/i);
    });
  }
}
for (const page of ["0", "-1", "1.5", "NaN", "100001"]) {
  await check(`invalid pagination ${page}`, async () => assert.equal((await get(`/events?page=${page}`)).status, 400));
}
await check("security headers and hostile CORS origin", async () => {
  const r = await get("/health", { Origin: "https://hostile.example.test" });
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
await check("removed forecast endpoint", async () => assert.equal((await get("/weather/forecast")).status, 404));
await check("unknown event returns 404 without stack", async () => {
  const r = await get("/events/qa-nonexistent-record");
  assert.equal(r.status, 404);
  assert.doesNotMatch(await r.text(), /node_modules|PrismaClient|stack/i);
});
const load = [];
for (const concurrency of [1, 5, 10]) {
  const durations: number[] = [];
  let failures = 0, next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next++ < 100) {
      const start = performance.now();
      try { const response = await get("/events"); if (!response.ok) failures++; await response.arrayBuffer(); } catch { failures++; }
      durations.push(performance.now() - start);
    }
  }));
  durations.sort((a, b) => a - b);
  load.push({ concurrency, requests: durations.length, failures, p95Ms: Math.round(durations[Math.ceil(durations.length * .95) - 1]), durationMs: Math.round(performance.now() - started) });
}
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/http-and-load.json`, JSON.stringify({ environment: base, results, load, limitation: "Bounded local read-only load; not capacity, endurance, DDoS or production benchmark." }, null, 2));
console.log(JSON.stringify({ passed: results.filter(r => r.status === "passed").length, failed: results.filter(r => r.status === "failed"), load }, null, 2));
if (results.some(r => r.status === "failed") || load.some(r => r.failures)) process.exitCode = 1;
}
void main().catch(error => { console.error(String(error)); process.exitCode = 1; });
