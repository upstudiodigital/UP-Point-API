import "dotenv/config";
import prisma from "../src/prisma";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !/127\.0\.0\.1:5434\/uppoint_dev$/.test(process.env.DATABASE_URL ?? "")
  )
    throw Error("Local development only");
  if (
    await prisma.sportCompetition.findUnique({
      where: { eventId: "sports-demo-event" },
    })
  ) {
    console.log("Sports demo already exists; credentials preserved.");
    return;
  }
  const password = randomBytes(18).toString("hex");
  const user = await prisma.users.create({
    data: {
      id: "sports-demo-owner",
      name: "Organizador Esportes • Demonstração",
      email: "esportes@example.test",
      password: await hash(password, 12),
      cpfCnpj: "12345678909",
      freeAdUsed: true,
    },
  });
  const category =
    (await prisma.categories.findFirst({ where: { name: "Esportes" } })) ??
    (await prisma.categories.create({
      data: { name: "Esportes", idUserOwner: user.id },
    }));
  const competition = await prisma.$transaction(async (tx) => {
    const event = await tx.events.create({
      data: {
        id: "sports-demo-event",
        idUserOwner: user.id,
        idCategory: category.id,
        name: "Demonstração • Copa SC de Futebol",
        description:
          "Campeonato inteiramente fictício para explorar o UP Point Esportes. Equipes, atletas, árbitros, resultados e locais são demonstrativos. Este anúncio não representa uma competição real.",
        localityEvent: "Campo demonstrativo",
        urlLocalityEvent: "",
        bannerImageUrl: "http://127.0.0.1:5174/images/sports-demo/football.svg",
        dateEvent: "2026-10-10",
        hourEvent: "15:00",
        city: "Sombrio",
        state: "SC",
        streetAddress: "Local de demonstração, Sombrio",
        moderationStatus: "approved",
      },
    });
    await tx.adOrder.create({
      data: {
        eventId: event.id,
        userId: user.id,
        placement: "cards",
        amountCents: 0,
        status: "free",
      },
    });
    return tx.sportCompetition.create({
      data: {
        id: "sports-demo-competition",
        eventId: event.id,
        startsOn: "2026-10-10",
        endsOn: "2026-10-25",
        sport: "football",
        edition: "2026 · Demo",
        format: "championship",
        admissionType: "donation",
        donation: "1 kg de alimento não perecível · demonstração",
      },
    });
  });
  const home = await prisma.sportTeam.create({
      data: {
        competitionId: competition.id,
        name: "Serra FC · Demo",
        crestUrl: "http://127.0.0.1:5174/images/sports-demo/serra.svg",
      },
    }),
    away = await prisma.sportTeam.create({
      data: {
        competitionId: competition.id,
        name: "Praia AC · Demo",
        crestUrl: "http://127.0.0.1:5174/images/sports-demo/praia.svg",
      },
    });
  const a = await prisma.sportRound.create({
      data: {
        competitionId: competition.id,
        number: 1,
        name: "Primeira rodada",
      },
    }),
    b = await prisma.sportRound.create({
      data: {
        competitionId: competition.id,
        number: 2,
        name: "Rodada de volta",
      },
    });
  const game = await prisma.sportMatch.create({
    data: {
      competitionId: competition.id,
      roundId: a.id,
      homeId: home.id,
      awayId: away.id,
      date: "2026-10-10",
      time: "15:00",
      venue: "Campo demonstrativo",
      city: "Sombrio",
      address: "Local fictício para demonstração, Sombrio",
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      homeFormation: "4-3-3",
      awayFormation: "4-4-2",
      officials: [
        { name: "Árbitro Demo", role: "Árbitro principal" },
        { name: "Assistente Demo 1", role: "Assistente" },
        { name: "Assistente Demo 2", role: "Assistente" },
      ],
      officialsConfirmed: true,
      lineupConfirmed: true,
    },
  });
  await prisma.sportMatch.create({
    data: {
      competitionId: competition.id,
      roundId: b.id,
      homeId: away.id,
      awayId: home.id,
      date: "2026-10-25",
      time: "15:00",
      venue: "Campo demonstrativo",
      city: "Sombrio",
      address: "Local fictício para demonstração, Sombrio",
    },
  });
  const names = [
    "Alex",
    "Bruno",
    "Caio",
    "Diego",
    "Edu",
    "Felipe",
    "Gabriel",
    "Hugo",
    "Igor",
    "João",
    "Kai",
    "Lucas",
  ];
  for (const team of [home, away])
    for (let i = 0; i < 12; i++) {
      const position =
        i === 0
          ? "GK"
          : i < 5
            ? "DEF"
            : i < (team.id === away.id ? 9 : 8)
              ? "MID"
              : "FWD";
      const player = await prisma.sportPlayer.create({
        data: {
          teamId: team.id,
          name: `${names[i]} · Demo`,
          shirt: i + 1,
          position,
        },
      });
      await prisma.sportSelection.create({
        data: {
          matchId: game.id,
          playerId: player.id,
          position,
          starter: i < 11,
        },
      });
    }
  await writeFile(
    "../.local/sports-demo-account.json",
    JSON.stringify({
      email: user.email,
      password,
      competitionId: competition.id,
    }),
  );
  console.log(
    "Sports demo created locally. Credentials stored in .local/sports-demo-account.json.",
  );
}
main().finally(() => prisma.$disconnect());
