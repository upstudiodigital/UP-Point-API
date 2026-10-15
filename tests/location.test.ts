import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { locationTools } from "../src/portal/location";
test("location tools restrict SC, cache results and have no weather endpoint", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.startsWith("https://photon.komoot.io/")) {
      calls++;
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-48.5, -27.6] },
              properties: {
                state: "Santa Catarina",
                countrycode: "BR",
                name: "Arena de teste",
                city: "Florianópolis",
              },
            },
            {
              geometry: { coordinates: [-46.6, -23.5] },
              properties: {
                state: "São Paulo",
                countrycode: "BR",
                name: "Fora de SC",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return original(input, init);
  }) as typeof fetch;
  const app = express();
  app.use(locationTools);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal(
      (await fetch(base + "/locations/search?address=x")).status,
      400,
    );
    const route =
      "/locations/search?address=Rua%20ficticia%20123%20Florianopolis";
    const result = (await (await fetch(base + route)).json()) as {
      results: unknown[];
    };
    assert.equal(result.results.length, 1);
    await fetch(base + route);
    assert.equal(calls, 1);
    assert.equal((await fetch(base + "/weather/forecast")).status, 404);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
