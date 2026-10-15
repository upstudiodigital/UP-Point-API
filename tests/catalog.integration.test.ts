import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/prisma";
test(
  "public catalog returns every eligible item across page boundaries and rejects invalid pages",
  { skip: process.env.RUN_INTEGRATION !== "1" },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5434\/uppoint_dev$/,
    );
    const id = randomUUID(),
      cat = randomUUID(),
      ids: string[] = Array.from({ length: 201 }, () => randomUUID());
    try {
      await prisma.users.create({
        data: {
          id,
          name: "Pagination QA",
          email: `pagination-${id}@example.test`,
          password: "not-a-login-account",
        },
      });
      await prisma.categories.create({
        data: { id: cat, name: "Cultura", idUserOwner: id },
      });
      await prisma.events.createMany({
        data: ids.map((eventId) => ({
          id: eventId,
          name: "Paginação QA",
          description: "Evento fictício de paginação",
          localityEvent: "Local fictício",
          urlLocalityEvent:"",
          city: "Sombrio",
          state: "SC",
          country: "BR",
          dateEvent: "2050-01-01",
          hourEvent: "12:00",
          idUserOwner: id,
          idCategory: cat,
          moderationStatus: "approved",
          bannerImageUrl: "https://example.test/qa.png",
        })),
      });
      await prisma.adOrder.createMany({
        data: ids.map((eventId) => ({
          id: randomUUID(),
          eventId,
          userId: id,
          status: "free",
          placement: "cards",
          amountCents: 0,
        })),
      });
      const found = new Set<string>();
      for (let page = 1; ; page++) {
        const response = await fetch(
          `http://127.0.0.1:3333/events?page=${page}`,
        );
        assert.equal(response.status, 200);
        const data = (await response.json()) as {
          events: { id: string }[];
          hasMore: boolean;
        };
        assert.ok(data.events.length <= 200);
        for (const event of data.events)
          if (ids.includes(event.id)) found.add(event.id);
        if (!data.hasMore) break;
        assert.ok(page < 10);
      }
      assert.equal(found.size, 201);
      assert.equal(
        (await fetch("http://127.0.0.1:3333/events?page=NaN")).status,
        400,
      );
    } finally {
      await prisma.adOrder.deleteMany({ where: { eventId: { in: ids } } });
      await prisma.events.deleteMany({ where: { id: { in: ids } } });
      await prisma.categories.deleteMany({ where: { id: cat } });
      await prisma.users.deleteMany({ where: { id } });
      await prisma.$disconnect();
    }
  },
);

