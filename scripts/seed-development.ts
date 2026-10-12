import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { hash } from "bcryptjs";
import prisma from "../src/prisma";
import events from "./events-fixtures.json";
async function main() {
  if (!(process.env.DATABASE_URL ?? "").endsWith("127.0.0.1:5434/uppoint_dev"))
    throw new Error("Seed permitido somente no banco local de desenvolvimento.");
  const email = "organizador@example.test", password = randomBytes(18).toString("hex");
  const user = await prisma.users.upsert({ where: { id: "development-organizer" },
    create: { id: "development-organizer", name: "Organizador de demonstração", email, password: await hash(password,12) },
    update: { password: await hash(password,12) } });
  for (const item of events) {
    const category = await prisma.categories.upsert({ where: { id: "development-" + item.category },
      create: { id: "development-" + item.category, name: item.category, idUserOwner: user.id }, update: {} });
    const data = { moderationStatus: "approved", name: "Demonstração · " + item.title, description: "Evento fictício para validar o ambiente de desenvolvimento. " + item.description,
      city: item.city, state: item.state, country: "BR", localityEvent: item.venue, urlLocalityEvent: "",
      bannerImageUrl: item.image, dateEvent: item.date, hourEvent: item.time, idCategory: category.id,
      idUserOwner: user.id, priceCents: item.price === "Entrada gratuita" ? 0 : Number(item.price.replace(/[^0-9]/g,"")) * 100,
      featuredPriority: Number(item.id) <= 3 ? Number(item.id) : null };
    await prisma.events.upsert({ where: { id: "development-event-" + item.id }, create: { id: "development-event-" + item.id, ...data }, update: data });
  }
  await writeFile("../.local/demo-account.json", JSON.stringify({ email, password }, null, 2));
  console.log("Seis eventos fictícios salvos no banco local. Conta de teste em .local/demo-account.json.");
}
main().finally(() => prisma.$disconnect());

