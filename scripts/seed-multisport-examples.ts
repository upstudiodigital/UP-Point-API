import "dotenv/config";
import { readFile } from "node:fs/promises";
import { sign } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import prisma from "../src/prisma";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !/127\.0\.0\.1:5434\/uppoint_dev$/.test(process.env.DATABASE_URL ?? "")
  )
    throw Error("Examples are restricted to the local development database.");
  const owner = await prisma.users.findUniqueOrThrow({
    where: { id: "sports-demo-owner" },
  });
  const token = sign({}, process.env.JWT_SECRET!, {
    subject: owner.id,
    expiresIn: "10m",
    algorithm: "HS256",
  });
  const fixtures = JSON.parse(
    await readFile("scripts/fixtures/sports-examples.json", "utf8"),
  ) as { key: string; body: Record<string, string> }[];
  const banner = await readFile(
    "../UP-Point-Web/public/images/festival-hero.png",
  );
  for (const fixture of fixtures) {
    const existing = await prisma.events.findFirst({
      where: { idUserOwner: owner.id, name: fixture.body.name },
      include: { sportCompetition: true },
    });
    if (existing) {
      console.log(`${fixture.key}: /esportes/${existing.sportCompetition?.id}`);
      continue;
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(fixture.body))
      form.set(key, value);
    form.set("publicationKey", randomUUID());
    form.set(
      "bannerEvento",
      new Blob([banner], { type: "image/png" }),
      "demo.png",
    );
    const response = await fetch("http://127.0.0.1:3333/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok)
      throw Error(
        `Example ${fixture.key}: HTTP ${response.status} ${await response.text()}`,
      );
    const saved = (await response.json()) as {
      event: { id: string; sportCompetition: { id: string } };
      order: { id: string };
    };
    // Synthetic fixture only: no call to PagBank, no payment attempt or receipt queue.
    await prisma.$transaction([
      prisma.adOrder.update({
        where: { id: saved.order.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          paymentEnvironment: "sandbox",
          paymentMethod: "DEMONSTRATION",
        },
      }),
      prisma.events.update({
        where: { id: saved.event.id },
        data: { moderationStatus: "approved" },
      }),
    ]);
    console.log(`${fixture.key}: /esportes/${saved.event.sportCompetition.id}`);
  }
}
void main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Unable to create examples");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
