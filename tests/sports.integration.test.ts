import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import prisma from "../src/prisma";
test(
  "sports competition is one ad; ownership, lineup embargo, confirmed standings and payment moderation",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const base = "http://127.0.0.1:3333",
      users: string[] = [];
    let eventId = "",
      file = "",
      competitionId = "";
    const request = (
      route: string,
      token: string,
      body: unknown = {},
      method = "POST",
    ) =>
      fetch(base + route, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    async function account() {
      const response = await request("/auth/register", "", {
        name: "Sports QA",
        email: `${randomUUID()}@example.test`,
        password: "Testing12345!",
        acceptTerms: true,
      });
      assert.equal(response.status, 201);
      const data = (await response.json()) as {
        token: string;
        user: { id: string };
      };
      users.push(data.user.id);
      await prisma.users.update({
        where: { id: data.user.id },
        data: { cpfCnpj: "12345678909" },
      });
      return data;
    }
    try {
      const owner = await account(),
        foreign = await account();
      const form = new FormData();
      Object.entries({
        acceptResponsibility: "true",
        name: "QA campeonato",
        category: "Esportes",
        sport: "football",
        edition: "2026",
        sportFormat: "championship",
        sportEndDate: "2026-11-21",
        advertisingFrom: "2026-10-20",
        advertisingUntil: "2026-11-21",
        programme: JSON.stringify({
          teams: [
            { key: "initial-a", name: "Initial A" },
            { key: "initial-b", name: "Initial B" },
          ],
          matches: [
            {
              homeKey: "initial-a",
              awayKey: "initial-b",
              round: 2,
              date: "2026-11-21",
              time: "14:00",
              venue: "Campo teste",
              city: "Florianópolis",
              address: "Rua teste 123 Centro",
            },
          ],
        }),
        admissionType: "donation",
        donation: "1 kg de alimento",
        venue: "Campo teste",
        city: "Florianópolis",
        state: "SC",
        streetAddress: "Rua teste 123 Centro",
        date: "2026-11-20",
        time: "14:00",
        phone: "48999999999",
        description: "Competição fictícia de teste, não publicar.",
        placement: "cards",
        priceCents: "5000",
      }).forEach(([key, value]) => form.append(key, value));
      form.append(
        "bannerEvento",
        new Blob(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRmsAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          { type: "image/png" },
        ),
        "qa.png",
      );
      const created = await fetch(base + "/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${owner.token}` },
        body: form,
      });
      assert.equal(created.status, 201, await created.clone().text());
      const data = (await created.json()) as {
        event: { id: string; bannerImageUrl: string };
      };
      eventId = data.event.id;
      file = path.basename(data.event.bannerImageUrl);
      const c = await prisma.sportCompetition.findUniqueOrThrow({
        where: { eventId },
      });
      competitionId = c.id;
      const billed = await prisma.adOrder.findUniqueOrThrow({
        where: { eventId },
      });
      assert.equal(billed.amountCents, 10000);
      assert.equal(billed.billedMonths, 2);
      assert.notEqual(billed.status, "free");
      assert.equal(
        (await prisma.users.findUniqueOrThrow({ where: { id: owner.user.id } }))
          .freeAdUsed,
        false,
      );
      assert.equal(
        await prisma.sportTeam.count({ where: { competitionId } }),
        2,
      );
      assert.equal(
        await prisma.sportMatch.count({ where: { competitionId } }),
        1,
      );
      assert.equal(
        (await prisma.events.findUniqueOrThrow({ where: { id: eventId } }))
          .priceCents,
        0,
      );
      assert.equal(
        (await fetch(base + `/sports/competitions/${c.id}`)).status,
        404,
      );
      assert.equal(
        (
          await request(`/account/sports/${c.id}/teams`, foreign.token, {
            name: "Wrong",
          })
        ).status,
        404,
      );
      const add = async (kind: string, body: unknown) => {
        const r = await request(
          `/account/sports/${c.id}/${kind}`,
          owner.token,
          body,
        );
        assert.equal(r.status, 201, await r.clone().text());
        return r.json() as Promise<Record<string, { id: string }>>;
      };
      const a = (await add("teams", { name: "Home" })).team,
        b = (await add("teams", { name: "Away" })).team;
      const pa = (
          await add("players", {
            teamId: a.id,
            name: "Keeper home",
            shirt: 1,
            position: "GK",
          })
        ).player,
        pb = (
          await add("players", {
            teamId: b.id,
            name: "Keeper away",
            shirt: 1,
            position: "GK",
          })
        ).player;
      const round = (await add("rounds", { number: 1, name: "Round one" }))
        .round;
      assert.equal(
        (
          await request(
            `/account/sports/${c.id}/rounds/${round.id}`,
            owner.token,
            { number: 1, name: "Primeira rodada revisada" },
            "PATCH",
          )
        ).status,
        200,
      );
      const match = (
        await add("matches", {
          roundId: round.id,
          homeId: a.id,
          awayId: b.id,
          date: "2026-11-20",
          time: "14:00",
          venue: "Campo teste",
          city: "Florianópolis",
          address: "Rua teste 123 Centro",
          admissionType: "inherit",
        })
      ).match;
      assert.equal(await prisma.adOrder.count({ where: { eventId } }), 1);
      assert.equal(
        (
          await request(`/account/sports/${c.id}/matches`, owner.token, {
            roundId: round.id,
            homeId: a.id,
            awayId: b.id,
            date: "2027-11-20",
            time: "14:00",
            venue: "Campo teste",
            city: "Florianópolis",
            address: "Rua teste 123 Centro",
            admissionType: "inherit",
          })
        ).status,
        400,
      );
      await prisma.adOrder.updateMany({
        where: { eventId },
        data: { status: "paid", paidAt: new Date() },
      });
      await prisma.sportCompetition.update({
        where: { id: c.id },
        data: { advertisingFrom: "2026-10-01" },
      });
      await prisma.events.update({
        where: { id: eventId },
        data: { moderationStatus: "approved" },
      });
      const update = {
        status: "finished",
        homeScore: 2,
        awayScore: 1,
        officials: [{ name: "QA referee", role: "Principal" }],
        officialsConfirmed: false,
        lineupConfirmed: false,
        selections: [
          { playerId: pa.id, starter: true, position: "GK" },
          { playerId: pb.id, starter: true, position: "GK" },
        ],
      };
      assert.equal(
        (
          await request(
            `/account/sports/${c.id}/matches/${match.id}`,
            owner.token,
            update,
            "PATCH",
          )
        ).status,
        200,
      );
      let publicData = (await (
        await fetch(base + `/sports/competitions/${c.id}`)
      ).json()) as {
        competition: {
          matches: { officials: unknown[]; selections: unknown[] }[];
          standings: { id: string; points: number }[];
        };
      };
      assert.deepEqual(publicData.competition.matches[0].officials, []);
      assert.deepEqual(publicData.competition.matches[0].selections, []);
      assert.equal(publicData.competition.standings[0].id, a.id);
      assert.equal(publicData.competition.standings[0].points, 3);
      assert.equal(
        (
          await request(
            `/account/sports/${c.id}/matches/${match.id}`,
            owner.token,
            { ...update, lineupConfirmed: true, officialsConfirmed: true },
            "PATCH",
          )
        ).status,
        200,
      );
      publicData = (await (
        await fetch(base + `/sports/competitions/${c.id}`)
      ).json()) as typeof publicData;
      assert.equal(publicData.competition.matches[0].selections.length, 2);
      // A championship remains visible after its opening date, including played matches.
      await prisma.events.update({
        where: { id: eventId },
        data: { dateEvent: "2026-10-01", featuredPriority: 1 },
      });
      assert.equal((await fetch(base + `/events/${eventId}`)).status, 200);
      const featured = (await (
        await fetch(base + "/events/featured")
      ).json()) as { events: { id: string }[] };
      assert.ok(featured.events.some((e) => e.id === eventId));
      await prisma.sportCompetition.update({
        where: { id: c.id },
        data: { advertisingUntil: "2026-10-12" },
      });
      assert.equal((await fetch(base + `/events/${eventId}`)).status, 404);
      assert.equal(
        (await fetch(base + `/sports/competitions/${c.id}`)).status,
        404,
      );
      const expired = (await (
        await fetch(base + "/events/featured")
      ).json()) as { events: { id: string }[] };
      assert.ok(!expired.events.some((e) => e.id === eventId));
      assert.equal(
        (
          await fetch(base + `/account/sports/${c.id}`, {
            headers: { Authorization: `Bearer ${owner.token}` },
          })
        ).status,
        200,
      );
      await prisma.sportCompetition.update({
        where: { id: c.id },
        data: {
          advertisingUntil: "2026-11-21",
          format: "meeting",
          endsOn: "2026-10-12",
        },
      });
      assert.equal((await fetch(base + `/events/${eventId}`)).status, 404);
      await prisma.sportCompetition.update({
        where: { id: c.id },
        data: { format: "championship", endsOn: "2026-11-21" },
      });
      await prisma.adOrder.updateMany({
        where: { eventId },
        data: { status: "awaiting_payment", amountCents: 1000 },
      });
      assert.equal(
        (await fetch(base + `/sports/competitions/${c.id}`)).status,
        404,
      );
    } finally {
      if (competitionId) {
        await prisma.sportMatch.deleteMany({ where: { competitionId } });
        await prisma.sportTeam.deleteMany({ where: { competitionId } });
        await prisma.sportRound.deleteMany({ where: { competitionId } });
        await prisma.sportCompetition.deleteMany({
          where: { id: competitionId },
        });
      }
      if (eventId) {
        await prisma.adOrder.deleteMany({ where: { eventId } });
        await prisma.events.deleteMany({ where: { id: eventId } });
      }
      if (file) await unlink(path.join("uploads", file)).catch(() => {});
      await prisma.adminAudit.deleteMany({ where: { actorId: { in: users } } });
      await prisma.categories.deleteMany({
        where: { idUserOwner: { in: users } },
      });
      await prisma.users.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
);
