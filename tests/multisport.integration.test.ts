import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { sign } from "jsonwebtoken";
import prisma from "../src/prisma";
import { scToday } from "../src/portal/publicationPeriod";
import {
  normaliseScheduleBody,
  parseSportSchedule,
} from "../src/portal/sportSchedule";
import { validateSportFile } from "../src/portal/sportUploads";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRmsAAAAASUVORK5CYII=",
  "base64",
);
const day = (offset: number) => {
  const d = new Date(scToday() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const venue = {
  venue: "Centro QA fictício",
  city: "Florianópolis",
  address: "Endereço fictício para QA, 123",
  time: "08:00",
};
test("sport-specific schedules reject missing distance, invalid karate categories and unsafe file content", () => {
  const base = {
    title: "Atividade QA",
    category: "Adulto",
    ...venue,
    date: day(20),
    details: {},
  };
  assert.throws(() =>
    parseSportSchedule(
      { sessions: [base] },
      "running",
      "meeting",
      day(20),
      day(20),
    ),
  );
  assert.throws(() =>
    parseSportSchedule(
      { sessions: [{ ...base, details: { discipline: "Football" } }] },
      "karate",
      "championship",
      day(20),
      day(20),
    ),
  );
  assert.throws(() =>
    validateSportFile(
      {
        data: Buffer.from("<script>"),
        mimetype: "application/pdf",
        size: 8,
      } as never,
      "rules",
    ),
  );
  const normal = normaliseScheduleBody({
    category: "Esportes",
    sport: "swimming",
    sportFormat: "meeting",
    scheduleVersion: "2",
    date: "invalid",
    programme: {
      sessions: [
        { ...base, date: day(21) },
        { ...base, date: day(20) },
      ],
    },
  });
  assert.equal(normal.date, day(20));
  assert.equal(normal.sportEndDate, day(21));
});
test(
  "multisport publication: clubs before fixtures, PDF/crest uploads, dates, privacy, ownership, editing and single billing",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL || "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const base = "http://127.0.0.1:3333",
      userIds: string[] = [],
      eventIds: string[] = [],
      uploaded: string[] = [];
    async function user() {
      const u = await prisma.users.create({
        data: {
          name: "QA Multisport",
          email: `${randomUUID()}@example.test`,
          password: "not-a-login-password",
          cpfCnpj: "12345678909",
        },
      });
      userIds.push(u.id);
      return {
        id: u.id,
        token: sign({}, process.env.JWT_SECRET!, {
          subject: u.id,
          expiresIn: "10m",
          algorithm: "HS256",
        }),
      };
    }
    const call = (
      route: string,
      token: string,
      data: unknown,
      method = "PATCH",
    ) =>
      fetch(base + route, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    try {
      const owner = await user(),
        other = await user();
      const programmes = [
        {
          sport: "football",
          format: "championship",
          programme: {
            teams: [
              { key: "a", name: "Club A QA", roster: "1 | Keeper QA | GK" },
              { key: "b", name: "Club B QA" },
            ],
            matches: [
              {
                homeKey: "a",
                awayKey: "b",
                round: 1,
                date: day(5),
                ...venue,
                officials: "Árbitro principal | QA referee",
                officialsConfirmed: false,
              },
              {
                homeKey: "b",
                awayKey: "a",
                round: 2,
                date: day(40),
                ...venue,
                time: "15:00",
              },
            ],
          },
        },
        {
          sport: "running",
          format: "meeting",
          programme: {
            teams: [],
            sessions: [
              {
                title: "Corrida QA 5 km",
                date: day(10),
                ...venue,
                details: {
                  distanceKm: "5",
                  accessibility: "Área de apoio fictícia",
                },
              },
            ],
          },
        },
        {
          sport: "swimming",
          format: "meeting",
          programme: {
            teams: [],
            sessions: [
              {
                title: "50 m livre QA",
                date: day(-1),
                ...venue,
                details: {
                  distanceMeters: "50",
                  stroke: "Livre",
                  poolMeters: "25",
                },
              },
              {
                title: "100 m costas QA",
                date: day(2),
                ...venue,
                details: {
                  distanceMeters: "100",
                  stroke: "Costas",
                  poolMeters: "25",
                },
              },
            ],
          },
        },
        {
          sport: "karate",
          format: "championship",
          programme: {
            teams: [{ key: "a", name: "Academia QA" }],
            sessions: [
              {
                title: "Kata QA",
                category: "Adulto",
                date: day(4),
                ...venue,
                details: {
                  discipline: "Kata",
                  ageGroup: "Adulto",
                  area: "Tatame 1",
                },
                officials: "Árbitro principal | QA Karate",
                officialsConfirmed: false,
              },
              {
                title: "Kumite QA",
                date: day(35),
                ...venue,
                details: {
                  discipline: "Kumite",
                  weightClass: "Até 75 kg",
                  area: "Tatame 2",
                },
              },
            ],
          },
        },
      ];
      for (const scenario of programmes) {
        const form = new FormData();
        Object.entries({
          name: `QA ${scenario.sport}`,
          category: "Esportes",
          sport: scenario.sport,
          sportFormat: scenario.format,
          edition: "QA",
          scheduleVersion: "2",
          programme: JSON.stringify(scenario.programme),
          state: "SC",
          phone: "48999999999",
          description:
            "Primeiro parágrafo fictício.\n\nSegundo parágrafo de teste com uma linha extensa.",
          admissionType: "donation",
          donation: "1 kg de alimento",
          priceCents: "9999",
          placement: "cards",
          advertisingFrom: scToday(),
        }).forEach(([k, v]) => form.set(k, v));
        form.set("acceptResponsibility", "true");
        form.set(
          "bannerEvento",
          new Blob([png], { type: "image/png" }),
          "qa.png",
        );
        if (scenario.sport === "football") {
          form.set(
            "crest-a",
            new Blob([png], { type: "image/png" }),
            "crest.png",
          );
          form.set(
            "rulesFile",
            new Blob(["%PDF-1.4\n% QA fixture only\n%%EOF"], {
              type: "application/pdf",
            }),
            "rules.pdf",
          );
        }
        const response = await fetch(base + "/events", {
          method: "POST",
          headers: { Authorization: `Bearer ${owner.token}` },
          body: form,
        });
        assert.equal(response.status, 201, await response.clone().text());
        const saved = (await response.json()) as {
          event: {
            id: string;
            bannerImageUrl: string;
            sportCompetition: { id: string };
          };
          order: { amountCents: number; status: string };
        };
        eventIds.push(saved.event.id);
        uploaded.push(saved.event.bannerImageUrl);
        const c = await prisma.sportCompetition.findUniqueOrThrow({
          where: { eventId: saved.event.id },
          include: { sessions: true, teams: true, matches: true },
        });
        if (c.rulesUrl) uploaded.push(c.rulesUrl);
        uploaded.push(...c.teams.map((t) => t.crestUrl).filter(Boolean));
        assert.equal(
          (
            await prisma.events.findUniqueOrThrow({
              where: { id: saved.event.id },
            })
          ).priceCents,
          0,
        );
        assert.equal(
          await prisma.adOrder.count({ where: { eventId: saved.event.id } }),
          1,
        );
        if (scenario.format === "championship") {
          assert.ok(saved.order.amountCents >= 5000);
          assert.notEqual(saved.order.status, "free");
        }
        if (c.sport === "football") {
          assert.equal(c.matches.length, 2);
          assert.equal(c.teams.length, 2);
          assert.match(c.rulesUrl, /\.pdf$/);
          assert.ok((await fetch(c.rulesUrl)).ok);
          assert.ok(c.teams.some((t) => t.crestUrl));
        } else
          assert.equal(c.sessions.length, scenario.programme.sessions!.length);
        await prisma.adOrder.updateMany({
          where: { eventId: saved.event.id },
          data: { status: "paid", paidAt: new Date() },
        });
        await prisma.events.update({
          where: { id: saved.event.id },
          data: { moderationStatus: "approved" },
        });
        const publicResponse = await fetch(
          base + `/sports/competitions/${c.id}`,
        );
        assert.equal(publicResponse.status, 200);
        const visible = (await publicResponse.json()) as {
          competition: {
            sessions: { officials: unknown[] }[];
            matches: { officials: unknown[] }[];
          };
        };
        assert.ok(
          visible.competition.sessions.every((s) => s.officials.length === 0),
        );
        assert.ok(
          visible.competition.matches.every((s) => s.officials.length === 0),
        );
        if (c.sessions.length) {
          const session = c.sessions[0];
          const change = {
            title: "Atividade revisada QA",
            status: "completed",
          };
          assert.equal(
            (
              await call(
                `/account/sports/${c.id}/sessions/${session.id}`,
                other.token,
                change,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await call(
                `/account/sports/${c.id}/sessions/${session.id}`,
                owner.token,
                change,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await prisma.sportSession.findUniqueOrThrow({
                where: { id: session.id },
              })
            ).status,
            "completed",
          );
        }
      }
    } finally {
      const comps = await prisma.sportCompetition.findMany({
        where: { eventId: { in: eventIds } },
      });
      const ids = comps.map((c) => c.id);
      await prisma.sportMatch.deleteMany({
        where: { competitionId: { in: ids } },
      });
      await prisma.sportTeam.deleteMany({
        where: { competitionId: { in: ids } },
      });
      await prisma.sportRound.deleteMany({
        where: { competitionId: { in: ids } },
      });
      await prisma.sportCompetition.deleteMany({ where: { id: { in: ids } } });
      await prisma.adOrder.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.events.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.adminAudit.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.categories.deleteMany({
        where: { idUserOwner: { in: userIds } },
      });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      for (const url of uploaded)
        if (url.includes("/uploads/"))
          await unlink(path.join("uploads", path.basename(url))).catch(
            () => {},
          );
      await prisma.$disconnect();
    }
  },
);
