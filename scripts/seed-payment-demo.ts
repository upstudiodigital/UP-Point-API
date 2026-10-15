import "dotenv/config";
import prisma from "../src/prisma";
async function main() {
  if (
    !(process.env.DATABASE_URL ?? "").endsWith("127.0.0.1:5434/uppoint_dev") ||
    process.env.PAGBANK_ENVIRONMENT !== "sandbox"
  )
    throw Error("Demonstração permitida somente no banco local e sandbox.");
  const user = await prisma.users.findUniqueOrThrow({
    where: { id: "development-organizer" },
  });
  const category = await prisma.categories.findFirstOrThrow({
    where: { name: "Festas" },
  });
  const source = await prisma.events.findFirstOrThrow({
    where: { id: "development-event-2" },
  });
  await prisma.events.upsert({
    where: { id: "development-payment-event" },
    update: {},
    create: {
      id: "development-payment-event",
      idUserOwner: user.id,
      idCategory: category.id,
      name: "Demonstração · Pagamento de anúncio",
      description:
        "Evento fictício para testar pagamentos exclusivamente no sandbox do PagBank. Não há festa real nem cobrança em produção.",
      localityEvent: "Espaço de demonstração",
      streetAddress: "Endereço fictício usado apenas em demonstração",
      city: "Florianópolis",
      state: "SC",
      country: "BR",
      urlLocalityEvent: "",
      bannerImageUrl: source.bannerImageUrl,
      dateEvent: "2027-01-30",
      hourEvent: "20:00",
      moderationStatus: "pending",
      placement: "cards",
    },
  });
  await prisma.adOrder.upsert({
    where: { eventId: "development-payment-event" },
    update: {},
    create: {
      id: "development-payment-order",
      eventId: "development-payment-event",
      userId: user.id,
      placement: "cards",
      amountCents: 1000,
      paymentMethod: "PAGBANK",
      status: "awaiting_payment",
      paymentEnvironment: "sandbox",
    },
  });
  console.log(
    "Anúncio fictício de R$ 10 preparado no painel da conta de demonstração, somente para sandbox.",
  );
}
void main().finally(() => prisma.$disconnect());
