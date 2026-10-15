import { publicEventWhere } from "./publicVisibility";
import { parseSession } from "./sportSchedule";
import { storeSportFile } from "./sportUploads";
import { activePublication, scToday } from "./publicationPeriod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { uploadUrl } from "./localConfig";
import type { Prisma } from "@prisma/client";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import prisma from "../prisma";
import { isLogged } from "../middlewares/isLogged";
import {
  SportError,
  scCity,
  string,
  integer,
  oneOf,
  link,
  admission,
  standings,
} from "./sportRules";
export const sports = Router();
const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch(next);
  };
const eventSelect = {
  id: true,
  name: true,
  description: true,
  city: true,
  state: true,
  dateEvent: true,
  hourEvent: true,
  localityEvent: true,
  streetAddress: true,
  latitude: true,
  longitude: true,
  priceCents: true,
  bannerImageUrl: true,
  moderationStatus: true,
  ticketUrl: true,
} as const;
const detailInclude = {
  sessions: { orderBy: [{ date: "asc" as const }, { time: "asc" as const }] },
  event: { select: eventSelect },
  teams: {
    include: { players: { orderBy: { shirt: "asc" as const } } },
    orderBy: { name: "asc" as const },
  },
  rounds: { orderBy: { number: "asc" as const } },
  matches: {
    include: {
      home: true,
      away: true,
      selections: { include: { player: true } },
    },
    orderBy: [{ date: "asc" as const }, { time: "asc" as const }],
  },
} satisfies Prisma.SportCompetitionInclude;
async function owner(req: Request) {
  const user = await prisma.users.findFirst({
    where: { id: req.user_id, status: true },
  });
  if (!user) throw new SportError(401, "Entre novamente.");
  const competition = await prisma.sportCompetition.findFirst({
    where: {
      id: req.params.id,
      event: {
        status: true,
        ...(user.typeAccess === "admin" ? {} : { idUserOwner: user.id }),
      },
    },
  });
  if (!competition) throw new SportError(404, "Competição não encontrada.");
  return competition;
}
async function audit(req: Request, action: string, targetId: string) {
  await prisma.adminAudit.create({
    data: {
      actorId: req.user_id,
      action: `sports_${action}`,
      targetId,
      detail: "Atualização esportiva pelo responsável",
    },
  });
}
async function football(req: Request) {
  const c = await owner(req);
  if (c.sport !== "football")
    throw new SportError(400, "Esta função é exclusiva do futebol.");
  return c;
}
function dateTime(body: Record<string, unknown>) {
  const date = string(body.date, 10, 10),
    time = string(body.time, 5, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new SportError(400, "Confira categoria, local, data e horário.");
  return { date, time };
}
async function detail(id: string, publicView = false) {
  const c = await prisma.sportCompetition.findUniqueOrThrow({
    where: { id },
    include: detailInclude,
  });
  return {
    ...c,
    sessions: publicView
      ? c.sessions.map((s) => ({
          ...s,
          officials: s.officialsConfirmed ? s.officials : [],
        }))
      : c.sessions,
    matches: publicView
      ? c.matches.map((match) => ({
          ...match,
          hasOccurred: match.status === "finished",
          datePassed:
            match.status !== "cancelled" &&
            match.status !== "postponed" &&
            match.date < scToday(),
          officials: match.officialsConfirmed ? match.officials : [],
          selections: match.lineupConfirmed ? match.selections : [],
          homeFormation: match.lineupConfirmed ? match.homeFormation : "",
          awayFormation: match.lineupConfirmed ? match.awayFormation : "",
        }))
      : c.matches,
    standings: standings(c.teams, c.matches, c),
  };
}
sports.get(
  "/sports/competitions",
  run(async (_req, res) => {
    const competitions = await prisma.sportCompetition.findMany({
      where: {
        event: {
          status: true,
          moderationStatus: "approved",
          ...publicEventWhere(),
          AND: [activePublication()],
          state: "SC",
          userOwner: { status: true },
          orders: { some: { status: { in: ["paid", "free"] } } },
        },
      },
      include: {
        event: { select: eventSelect },
        _count: { select: { teams: true, matches: true } },
      },
      orderBy: { event: { dateEvent: "asc" } },
      take: 100,
    });
    res.json({ competitions });
  }),
);
sports.get(
  "/sports/competitions/:id",
  run(async (req, res) => {
    const visible = await prisma.sportCompetition.findFirst({
      where: {
        id: req.params.id,
        event: {
          status: true,
          moderationStatus: "approved",
          ...publicEventWhere(),
          AND: [activePublication()],
          userOwner: { status: true },
          orders: { some: { status: { in: ["paid", "free"] } } },
        },
      },
    });
    if (!visible) throw new SportError(404, "Competição não encontrada.");
    res.json({ competition: await detail(visible.id, true) });
  }),
);
sports.get(
  "/account/sports",
  isLogged,
  run(async (req, res) => {
    const user = await prisma.users.findFirst({
      where: { id: req.user_id, status: true },
    });
    if (!user) throw new SportError(401, "Entre novamente.");
    res.json({
      competitions: await prisma.sportCompetition.findMany({
        where: { event: { idUserOwner: user.id, status: true } },
        include: { event: { select: eventSelect } },
      }),
    });
  }),
);
sports.get(
  "/account/sports/:id",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req);
    res.json({ competition: await detail(c.id) });
  }),
);
sports.patch(
  "/account/sports/:id/settings",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req);
    const a = admission(
      req.body.admissionType,
      req.body.donation,
      req.body.priceCents,
    );
    const startsOn =
        req.body.startsOn === undefined
          ? c.startsOn
          : string(req.body.startsOn, 10, 10),
      endsOn =
        req.body.endsOn === undefined
          ? c.endsOn
          : string(req.body.endsOn, 10, 10);
    const validDate = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s;
    if (!validDate(startsOn) || !validDate(endsOn) || endsOn < startsOn)
      throw new SportError(400, "Confira o período desta edição.");
    const paidLimit =
      c.advertisingUntil > c.endsOn ? c.advertisingUntil : c.endsOn;
    if (endsOn > paidLimit)
      throw new SportError(
        409,
        "Para ampliar o período contratado, solicite uma nova contratação.",
      );
    if (
      (await prisma.sportMatch.count({
        where: {
          competitionId: c.id,
          OR: [{ date: { lt: startsOn } }, { date: { gt: endsOn } }],
        },
      })) ||
      (await prisma.sportSession.count({
        where: {
          competitionId: c.id,
          OR: [{ date: { lt: startsOn } }, { date: { gt: endsOn } }],
        },
      }))
    )
      throw new SportError(
        400,
        "As partidas cadastradas devem estar dentro do período da edição.",
      );
    const tieBreakers: unknown[] = Array.isArray(req.body.tieBreakers)
      ? req.body.tieBreakers
      : ["points", "wins", "goalDifference", "goalsFor"];
    if (
      tieBreakers.length < 1 ||
      tieBreakers[0] !== "points" ||
      new Set(tieBreakers).size !== tieBreakers.length ||
      tieBreakers.some(
        (x) =>
          typeof x !== "string" ||
          !["points", "wins", "goalDifference", "goalsFor"].includes(x),
      )
    )
      throw new SportError(400, "Confira os critérios de desempate.");
    await prisma.$transaction(async (tx) => {
      await tx.sportCompetition.update({
        where: { id: c.id },
        data: {
          startsOn,
          endsOn,
          admissionType: a.admissionType,
          donation: a.donation,
          rulesUrl: link(req.body.rulesUrl),
          winPoints: integer(req.body.winPoints, 0, 100),
          drawPoints: integer(req.body.drawPoints, 0, 100),
          lossPoints: integer(req.body.lossPoints, 0, 100),
          tieBreakers: tieBreakers as string[],
        },
      });
      await tx.events.update({
        where: { id: c.eventId },
        data: {
          dateEvent: startsOn,
          priceCents: a.priceCents,
          moderationStatus: "pending",
          featuredPriority: null,
        },
      });
    });
    await audit(req, "settings", c.id);
    res.json({ ok: true });
  }),
);
sports.post(
  "/account/sports/:id/teams",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req);
    if (
      (await prisma.sportTeam.count({ where: { competitionId: c.id } })) >= 64
    )
      throw new SportError(400, "Limite de equipes atingido.");
    const name = string(req.body.name, 2, 100);
    if (
      await prisma.sportTeam.findFirst({
        where: {
          competitionId: c.id,
          name: { equals: name, mode: "insensitive" },
        },
      })
    )
      throw new SportError(409, "Esta equipe já está cadastrada.");
    const team = await prisma.sportTeam.create({
      data: {
        competitionId: c.id,
        name,
        crestUrl: link(req.body.crestUrl),
        groupName:
          typeof req.body.groupName === "string"
            ? req.body.groupName.trim().slice(0, 50)
            : "",
      },
    });
    await audit(req, "team", team.id);
    res.status(201).json({ team });
  }),
);
sports.post(
  "/account/sports/:id/players",
  isLogged,
  run(async (req, res) => {
    const c = await football(req),
      teamId = string(req.body.teamId);
    if (
      !(await prisma.sportTeam.findFirst({
        where: { id: teamId, competitionId: c.id },
      }))
    )
      throw new SportError(400, "Selecione uma equipe desta competição.");
    const shirt = integer(req.body.shirt, 1, 99);
    if (await prisma.sportPlayer.findFirst({ where: { teamId, shirt } }))
      throw new SportError(409, "Este número já está em uso na equipe.");
    if ((await prisma.sportPlayer.count({ where: { teamId } })) >= 80)
      throw new SportError(400, "Limite de atletas atingido.");
    const player = await prisma.sportPlayer.create({
      data: {
        teamId,
        name: string(req.body.name, 2, 120),
        shirt,
        position: oneOf(req.body.position, ["GK", "DEF", "MID", "FWD"]),
      },
    });
    await audit(req, "player", player.id);
    res.status(201).json({ player });
  }),
);
sports.post(
  "/account/sports/:id/rounds",
  isLogged,
  run(async (req, res) => {
    const c = await football(req),
      number = integer(req.body.number, 1, 200);
    if (
      await prisma.sportRound.findFirst({
        where: { competitionId: c.id, number },
      })
    )
      throw new SportError(409, "Esta rodada já está cadastrada.");
    const round = await prisma.sportRound.create({
      data: {
        competitionId: c.id,
        number,
        name: string(req.body.name, 2, 100),
      },
    });
    await audit(req, "round", round.id);
    res.status(201).json({ round });
  }),
);
sports.post(
  "/account/sports/:id/matches",
  isLogged,
  run(async (req, res) => {
    const c = await football(req),
      homeId = string(req.body.homeId),
      awayId = string(req.body.awayId),
      roundId = string(req.body.roundId);
    if (
      homeId === awayId ||
      (await prisma.sportTeam.count({
        where: { id: { in: [homeId, awayId] }, competitionId: c.id },
      })) !== 2 ||
      !(await prisma.sportRound.findFirst({
        where: { id: roundId, competitionId: c.id },
      }))
    )
      throw new SportError(
        400,
        "Selecione equipes diferentes e uma rodada desta competição.",
      );
    if (
      (await prisma.sportMatch.count({ where: { competitionId: c.id } })) >=
      2000
    )
      throw new SportError(400, "Limite de partidas atingido.");
    const coords = (value: unknown, limit: number) =>
      value == null || value === "" ? null : Number(value);
    const latitude = coords(req.body.latitude, 90),
      longitude = coords(req.body.longitude, 180);
    if (
      (latitude == null) !== (longitude == null) ||
      (latitude != null &&
        (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) ||
      (longitude != null &&
        (!Number.isFinite(longitude) || Math.abs(longitude) > 180))
    )
      throw new SportError(400, "Coordenadas inválidas.");
    const scheduled = dateTime(req.body);
    if (scheduled.date < c.startsOn || scheduled.date > c.endsOn)
      throw new SportError(
        400,
        "A partida deve estar dentro do período desta edição.",
      );
    const match = await prisma.sportMatch.create({
      data: {
        competitionId: c.id,
        roundId,
        homeId,
        awayId,
        ...dateTime(req.body),
        venue: string(req.body.venue, 3, 200),
        city: scCity(req.body.city),
        address: string(req.body.address, 5, 300),
        latitude,
        longitude,
        countsForStandings: req.body.countsForStandings !== false,
        ...admission(
          req.body.admissionType,
          req.body.donation,
          req.body.priceCents,
          true,
        ),
      },
    });
    await audit(req, "match", match.id);
    res.status(201).json({ match });
  }),
);
sports.patch(
  "/account/sports/:id/rounds/:roundId",
  isLogged,
  run(async (req, res) => {
    const c = await football(req),
      round = await prisma.sportRound.findFirst({
        where: { id: req.params.roundId, competitionId: c.id },
      });
    if (!round) throw new SportError(404, "Rodada não encontrada.");
    const number = integer(req.body.number, 1, 200),
      name = string(req.body.name, 2, 100);
    if (
      await prisma.sportRound.findFirst({
        where: { competitionId: c.id, number, id: { not: round.id } },
      })
    )
      throw new SportError(409, "Esta rodada já está cadastrada.");
    await prisma.sportRound.update({
      where: { id: round.id },
      data: { number, name },
    });
    await audit(req, "round_update", round.id);
    res.json({ ok: true });
  }),
);
sports.patch(
  "/account/sports/:id/matches/:matchId",
  isLogged,
  run(async (req, res) => {
    const c = await football(req),
      match = await prisma.sportMatch.findFirst({
        where: { id: req.params.matchId, competitionId: c.id },
      });
    if (!match) throw new SportError(404, "Partida não encontrada.");
    const homeId =
        req.body.homeId === undefined ? match.homeId : string(req.body.homeId),
      awayId =
        req.body.awayId === undefined ? match.awayId : string(req.body.awayId),
      roundId =
        req.body.roundId === undefined
          ? match.roundId
          : string(req.body.roundId);
    if (
      homeId === awayId ||
      (await prisma.sportTeam.count({
        where: { competitionId: c.id, id: { in: [homeId, awayId] } },
      })) !== 2 ||
      !(await prisma.sportRound.findFirst({
        where: { id: roundId, competitionId: c.id },
      }))
    )
      throw new SportError(
        400,
        "Selecione equipes diferentes e uma rodada desta competição.",
      );
    const entrance =
      req.body.admissionType === undefined
        ? {}
        : admission(
            req.body.admissionType,
            req.body.donation,
            req.body.priceCents,
            true,
          );
    const scheduled = dateTime({
      date: match.date,
      time: match.time,
      ...req.body,
    });
    if (scheduled.date < c.startsOn || scheduled.date > c.endsOn)
      throw new SportError(
        400,
        "A partida deve estar dentro do período desta edição.",
      );
    const status = oneOf(req.body.status, [
      "scheduled",
      "postponed",
      "cancelled",
      "live",
      "finished",
    ]);
    const scored = ["live", "finished"].includes(status);
    const officials = Array.isArray(req.body.officials)
      ? req.body.officials
      : [];
    if (officials.length > 12)
      throw new SportError(400, "Confira a arbitragem.");
    const parsedOfficials = officials.map((x: unknown) => {
      if (!x || typeof x !== "object")
        throw new SportError(400, "Confira a arbitragem.");
      const o = x as Record<string, unknown>;
      return { name: string(o.name, 2, 120), role: string(o.role, 2, 100) };
    });
    const selection: unknown[] = Array.isArray(req.body.selections)
      ? req.body.selections
      : [];
    if (selection.length > 60)
      throw new SportError(400, "Confira as escalações.");
    const players = await prisma.sportPlayer.findMany({
      where: { teamId: { in: [homeId, awayId] } },
    });
    const parsed: { playerId: string; starter: boolean; position: string }[] =
      selection.map((x: unknown) => {
        if (!x || typeof x !== "object")
          throw new SportError(400, "Confira as escalações.");
        const o = x as Record<string, unknown>,
          playerId = string(o.playerId);
        if (!players.some((p) => p.id === playerId))
          throw new SportError(400, "Confira as escalações.");
        return {
          playerId,
          starter: o.starter === true,
          position: oneOf(o.position, ["GK", "DEF", "MID", "FWD"]),
        };
      });
    if (new Set(parsed.map((p) => p.playerId)).size !== parsed.length)
      throw new SportError(400, "Confira as escalações.");
    const max = 11;
    for (const teamId of [homeId, awayId])
      if (
        parsed.filter(
          (x) =>
            x.starter &&
            players.find((p) => p.id === x.playerId)?.teamId === teamId,
        ).length > max
      )
        throw new SportError(400, "Confira as escalações.");
    await prisma.$transaction(async (tx) => {
      await tx.sportMatch.update({
        where: { id: match.id },
        data: {
          homeId,
          awayId,
          roundId,
          ...entrance,
          ...(req.body.countsForStandings === undefined
            ? {}
            : { countsForStandings: req.body.countsForStandings === true }),
          status,
          ...((req.body.address !== undefined &&
            req.body.address !== match.address) ||
          (req.body.city !== undefined && req.body.city !== match.city)
            ? { latitude: null, longitude: null }
            : {}),
          ...dateTime({ date: match.date, time: match.time, ...req.body }),
          venue:
            req.body.venue === undefined
              ? match.venue
              : string(req.body.venue, 3, 200),
          city:
            req.body.city === undefined ? match.city : scCity(req.body.city),
          address:
            req.body.address === undefined
              ? match.address
              : string(req.body.address, 5, 300),
          homeScore: scored ? integer(req.body.homeScore, 0, 99) : null,
          awayScore: scored ? integer(req.body.awayScore, 0, 99) : null,
          homeFormation:
            typeof req.body.homeFormation === "string"
              ? req.body.homeFormation.slice(0, 30)
              : "",
          awayFormation:
            typeof req.body.awayFormation === "string"
              ? req.body.awayFormation.slice(0, 30)
              : "",
          officials: parsedOfficials,
          officialsConfirmed: req.body.officialsConfirmed === true,
          lineupConfirmed: req.body.lineupConfirmed === true,
        },
      });
      await tx.sportSelection.deleteMany({ where: { matchId: match.id } });
      if (parsed.length)
        await tx.sportSelection.createMany({
          data: parsed.map((p) => ({ ...p, matchId: match.id })),
        });
      await tx.adminAudit.create({
        data: {
          actorId: req.user_id,
          action: "sports_match_update",
          targetId: match.id,
          detail: `${status}; resultado e programação esportiva`,
        },
      });
    });
    res.json({ ok: true });
  }),
);

sports.post(
  "/account/sports/:id/crest",
  isLogged,
  run(async (req, res) => {
    await owner(req);
    const file = req.files?.crest;
    if (
      !file ||
      Array.isArray(file) ||
      file.size > 2 * 1024 * 1024 ||
      !["image/png", "image/jpeg"].includes(file.mimetype)
    )
      throw new SportError(400, "Selecione uma imagem JPG ou PNG de até 2 MB.");
    const valid =
      file.mimetype === "image/png"
        ? file.data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.data[0] === 255 && file.data[1] === 216 && file.data[2] === 255;
    if (!valid) throw new SportError(400, "Imagem inválida.");
    let url: string;
    if (
      process.env.UPLOAD_STORAGE === "local" &&
      process.env.NODE_ENV !== "production"
    ) {
      const name = `sport-${randomUUID()}.${file.mimetype === "image/png" ? "png" : "jpg"}`;
      const directory = path.join(process.cwd(), "uploads");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, name), file.data);
      url = uploadUrl(req, name);
    } else {
      if (!process.env.CLOUDINARY_NAME)
        throw new SportError(
          503,
          "Upload indisponível. Configure o serviço de imagens.",
        );
      url = await new Promise<string>((resolve, reject) =>
        cloudinary.uploader
          .upload_stream(
            { folder: "uppoint/sports", resource_type: "image" },
            (error, result) =>
              error || !result
                ? reject(error ?? Error())
                : resolve(result.secure_url),
          )
          .end(file.data),
      );
    }
    res.json({ url });
  }),
);
sports.patch(
  "/account/sports/:id/teams/:teamId",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req),
      team = await prisma.sportTeam.findFirst({
        where: { id: req.params.teamId, competitionId: c.id },
      });
    if (!team) throw new SportError(404, "Equipe não encontrada.");
    const name = string(req.body.name, 2, 100);
    if (
      await prisma.sportTeam.findFirst({
        where: {
          competitionId: c.id,
          id: { not: team.id },
          name: { equals: name, mode: "insensitive" },
        },
      })
    )
      throw new SportError(409, "Esta equipe já está cadastrada.");
    const pointsAdjustment = integer(req.body.pointsAdjustment, -100, 100),
      adjustmentReason =
        pointsAdjustment !== 0 ? string(req.body.adjustmentReason, 5, 300) : "";
    await prisma.sportTeam.update({
      where: { id: team.id },
      data: {
        name,
        crestUrl: link(req.body.crestUrl),
        groupName:
          typeof req.body.groupName === "string"
            ? req.body.groupName.trim().slice(0, 50)
            : "",
        pointsAdjustment,
        adjustmentReason,
      },
    });
    await audit(req, "team_update", team.id);
    res.json({ ok: true });
  }),
);
sports.patch(
  "/account/sports/:id/players/:playerId",
  isLogged,
  run(async (req, res) => {
    const c = await football(req),
      player = await prisma.sportPlayer.findFirst({
        where: { id: req.params.playerId, team: { competitionId: c.id } },
      });
    if (!player) throw new SportError(404, "Atleta não encontrado.");
    const shirt = integer(req.body.shirt, 1, 99);
    if (
      await prisma.sportPlayer.findFirst({
        where: { teamId: player.teamId, shirt, id: { not: player.id } },
      })
    )
      throw new SportError(409, "Este número já está em uso na equipe.");
    await prisma.sportPlayer.update({
      where: { id: player.id },
      data: {
        name: string(req.body.name, 2, 120),
        shirt,
        position: oneOf(req.body.position, ["GK", "DEF", "MID", "FWD"]),
      },
    });
    await audit(req, "player_update", player.id);
    res.json({ ok: true });
  }),
);

sports.post(
  "/account/sports/:id/rules",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req);
    const file = req.files?.rulesFile;
    if (!file) throw new SportError(400, "Selecione um PDF de até 5 MB.");
    const asset = await storeSportFile(req, file, "rules");
    try {
      await prisma.$transaction([
        prisma.sportCompetition.update({
          where: { id: c.id },
          data: { rulesUrl: asset.url },
        }),
        prisma.events.update({
          where: { id: c.eventId },
          data: { moderationStatus: "pending", featuredPriority: null },
        }),
      ]);
      await audit(req, "rules_upload", c.id);
      res.json({ url: asset.url });
    } catch (e) {
      await asset.remove();
      throw e;
    }
  }),
);
sports.post(
  "/account/sports/:id/sessions",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req);
    if (c.sport === "football" && c.format === "championship")
      throw new SportError(400, "Use a programação de partidas do futebol.");
    if (
      (await prisma.sportSession.count({ where: { competitionId: c.id } })) >=
      500
    )
      throw new SportError(400, "Limite de atividades atingido.");
    const row = parseSession(req.body, c.sport, c.startsOn, c.endsOn);
    const session = await prisma.sportSession.create({
      data: { ...row, competitionId: c.id },
    });
    await audit(req, "session_create", session.id);
    res.status(201).json({ session });
  }),
);
sports.patch(
  "/account/sports/:id/sessions/:sessionId",
  isLogged,
  run(async (req, res) => {
    const c = await owner(req),
      session = await prisma.sportSession.findFirst({
        where: { id: req.params.sessionId, competitionId: c.id },
      });
    if (!session) throw new SportError(404, "Atividade não encontrada.");
    const row = parseSession(
      { ...session, ...req.body },
      c.sport,
      c.startsOn,
      c.endsOn,
    );
    await prisma.sportSession.update({ where: { id: session.id }, data: row });
    await audit(req, "session_update", session.id);
    res.json({ ok: true });
  }),
);
