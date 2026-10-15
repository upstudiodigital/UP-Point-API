import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { decode } from "jsonwebtoken";
import prisma from "../src/prisma";

test("cadastro, login, agenda pública, publicação, destaque e isolamento por dono", { skip: process.env.RUN_INTEGRATION !== "1" }, async () => {
  assert.match(process.env.DATABASE_URL ?? "", /127\.0\.0\.1:5434\/uppoint_dev$/);
  const base = "http://127.0.0.1:3333";
  const ids: string[] = [], events: string[] = [], files: string[] = [];
  async function json(route: string, body: unknown, token?: string, method = "POST") {
    return fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
  }
  try {
    assert.equal((await fetch(base + "/events")).status, 200);
    assert.equal((await json("/events", {})).status, 401);
    const users = [];
    for (let i = 0; i < 2; i++) {
      const email = "test-" + randomUUID() + "@example.test";
      const res = await json("/auth/register", { name: "Teste Sprint 2", email, password: "Testing12345!", acceptTerms: true });
      assert.equal(res.status, 201, await res.clone().text());
      const session = await res.json() as { token: string; user: { id: string } };
      ids.push(session.user.id); users.push({ ...session, email });
      assert.deepEqual(Object.keys(decode(session.token) as object).sort(), ["exp", "iat", "sub"]);
    }
    const owner = users[0], other = users[1];
    assert.equal((await json("/auth/register", { name: "Outra pessoa", email: owner.email, password: "Testing12345!", acceptTerms: true })).status, 409);
    assert.equal((await json("/auth/login", { account: owner.email, password: "errada" })).status, 401);
    assert.equal((await json("/auth/login", { account: owner.email, password: "Testing12345!" })).status, 200);
    assert.equal((await fetch(base + "/auth/me", { headers: { Authorization: "Bearer " + owner.token } })).status, 200);
    assert.equal((await json("/events", {}, owner.token)).status, 400);
    assert.equal((await json("/account/profile", {name:"Teste Sprint 2",cpfCnpj:"11111111111"}, owner.token,"PATCH")).status,400);
    assert.equal((await json("/account/profile", {name:"Teste Sprint 2",cpfCnpj:"52998224725"}, owner.token,"PATCH")).status,200);
    assert.equal((await json("/events", {}, owner.token)).status,400);
    const data = { publicationKey: randomUUID(), acceptResponsibility: "true", streetAddress:"Rua fictícia 123, Centro", name: "Evento de teste Sprint 2", category: "Shows", venue: "Arena teste", city: "Florianópolis", state: "SC",
      date: "2027-01-25", time: "20:00", phone: "48999999999", url: "", description: "Evento fictício criado apenas para testes automatizados.", priceCents: "1250", artists: "Artista teste" };
    const body = new FormData();
    Object.entries(data).forEach(([key,value]) => body.append(key, value));
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRmsAAAAASUVORK5CYII=", "base64");
    body.append("bannerEvento", new Blob([png], { type: "image/png" }), "test.png");
    const created = await fetch(base + "/events", { method: "POST", headers: { Authorization: "Bearer " + owner.token }, body });
    assert.equal(created.status, 201, await created.clone().text());
    const { event } = await created.json() as { event: { id: string; bannerImageUrl: string; priceCents: number; idUserOwner: string } };
    events.push(event.id); files.push(path.basename(event.bannerImageUrl));
    const retry=await json("/events",{publicationKey:data.publicationKey,acceptResponsibility:true},owner.token);
    assert.equal(retry.status,200);assert.equal((await retry.json() as {event:{id:string}}).event.id,event.id);
    assert.equal(await prisma.adOrder.count({where:{publicationKey:data.publicationKey}}),1);
    assert.equal(event.idUserOwner, owner.user.id); assert.equal(event.priceCents, 1250);
    assert.equal((await fetch(event.bannerImageUrl)).status, 200);
    assert.equal((await fetch(base + "/events/" + event.id)).status, 404);
    assert.equal((await json("/events/" + event.id, data, other.token, "PUT")).status, 404);
    assert.equal((await fetch(base + "/events/" + event.id, { method: "DELETE", headers: { Authorization: "Bearer " + other.token } })).status, 404);
    assert.equal((await json("/events/" + event.id, { ...data, acceptResponsibility: true, name: "Evento atualizado" }, owner.token, "PUT")).status, 200);
    await prisma.events.update({ where: { id: event.id }, data: { moderationStatus: "approved", featuredPriority: 1, featuredStartsAt: new Date(Date.now() - 1000), featuredEndsAt: new Date(Date.now() + 60000) } });
    const featured = await (await fetch(base + "/events/featured")).json() as { events: { id: string }[] };
    assert.ok(featured.events.some(e => e.id === event.id));
    await prisma.events.update({ where: { id: event.id }, data: { featuredEndsAt: new Date(Date.now() - 1000) } });
    const expired = await (await fetch(base + "/events/featured")).json() as { events: { id: string }[] };
    assert.ok(!expired.events.some(e => e.id === event.id));
    assert.equal((await fetch(base + "/events/" + event.id, { method: "DELETE", headers: { Authorization: "Bearer " + owner.token } })).status, 204);
    assert.equal((await fetch(base + "/events/" + event.id)).status, 404);
  } finally {
    await prisma.adOrder.deleteMany({where:{eventId:{in:events}}});
    await prisma.events.deleteMany({ where: { id: { in: events } } });
    await prisma.categories.deleteMany({ where: { idUserOwner: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
    for (const file of files) await unlink(path.join(process.cwd(), "uploads", file)).catch(() => {});
    await prisma.$disconnect();
  }
});
