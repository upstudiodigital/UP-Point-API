import { publicEventWhere } from "./publicVisibility";
import {
  normaliseScheduleBody,
  decodeProgramme,
  parseSportSchedule,
  saveSportSchedule,
} from "./sportSchedule";
import { validateSportFile, storeSportFile } from "./sportUploads";
import { activePublication, publicationPeriod } from "./publicationPeriod";
import { parseProgramme, saveProgramme } from "./championshipSetup";
import {
  sportInput,
  SportError,
  admission,
  scCity,
  link,
  integer,
} from "./sportRules";
import { uploadUrl } from "./localConfig";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { hash, compare } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import prisma from "../prisma";
import { isLogged } from "../middlewares/isLogged";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authGuard } from "./authGuard";
import { PaymentError, paymentsReady } from "./pagbank";

import { validDocument } from "./document";

export const portal = Router();
const categories = [
  "Shows",
  "Festas",
  "Baladas",
  "Gastronomia",
  "Cultura",
  "Gospel",
  "Católicos",
  "Outras religiões",
  "Esportes",
];
const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const action =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
function text(value: unknown, min = 1, max = 500): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new HttpError(400, "Confira os campos obrigatórios.");
  return value.trim();
}
function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new HttpError(503, "Autenticação indisponível.");
  return process.env.JWT_SECRET;
}
function passwordValue(value: unknown, min: number) {
  if (typeof value !== "string" || value.length < min || value.length > 128)
    throw new HttpError(400, "Confira os campos obrigatórios.");
  return value;
}
function session(user: {
  sessionVersion: number;
  id: string;
  name: string;
  email: string | null;
  typeAccess: string;
  profileAvatar: string | null;
}) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      typeAccess: user.typeAccess,
      profileAvatar: user.profileAvatar,
    },
    token: sign({ sv: user.sessionVersion }, secret(), {
      subject: user.id,
      expiresIn: "8h",
      algorithm: "HS256",
    }),
  };
}
portal.post(
  "/auth/register",
  authGuard,
  action(async (req, res) => {
    const name = text(req.body.name, 2, 120);
    const email = text(req.body.email, 3, 254).toLowerCase();
    const password = passwordValue(req.body.password, 8);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      req.body.acceptTerms !== true
    )
      throw new HttpError(
        400,
        "Informe um email válido e aceite os termos e a privacidade.",
      );
    secret();
    // Serialize equal-email registrations even while the legacy schema allows repeated emails.
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
      if (
        await tx.users.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        })
      )
        throw new HttpError(409, "Este email já possui uma conta.");
      const registered = await tx.users.create({
        data: {
          name,
          email,
          password: await hash(password, 12),
          termsUsePlatform: true,
          termsPrivacyPolicy: true,
          termsUseLGPD: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          sessionVersion: true,
          typeAccess: true,
          profileAvatar: true,
        },
      });
      await tx.adminAudit.create({
        data: {
          actorId: registered.id,
          targetId: registered.id,
          action: "terms_accept",
          detail: JSON.stringify({
            version: "2026-10-15-v2",
            scope: "terms_and_privacy",
          }),
        },
      });
      return registered;
    });
    res.status(201).json(session(user));
  }),
);
portal.post(
  "/auth/login",
  authGuard,
  action(async (req, res) => {
    const account = text(req.body.account, 1, 254);
    const password = passwordValue(req.body.password, 1);
    const user = await prisma.users.findFirst({
      where: {
        status: true,
        OR: [
          { email: { equals: account, mode: "insensitive" } },
          { cpfCnpj: account },
        ],
      },
    });
    if (!user || !(await compare(password, user.password)))
      throw new HttpError(401, "Email ou senha inválidos.");
    res.json(session(user));
  }),
);
portal.get(
  "/auth/me",
  isLogged,
  action(async (req, res) => {
    const user = await prisma.users.findFirst({
      where: { id: req.user_id, status: true },
      select: {
        id: true,
        name: true,
        email: true,
        typeAccess: true,
        profileAvatar: true,
        cpfCnpj: true,
      },
    });
    if (!user) throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
    res.json({ user });
  }),
);
const publicInclude = {
  categories: { select: { name: true } },
  sportCompetition: {
    select: {
      id: true,
      sport: true,
      edition: true,
      format: true,
      admissionType: true,
      donation: true,
    },
  },
} as const;
portal.get(
  "/events",
  action(async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "SC";
    if (!states.includes(state)) throw new HttpError(400, "Estado inválido.");
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : "";
    const page = Number(req.query.page ?? 1);
    if(!Number.isSafeInteger(page)||page<1||page>100000)throw new HttpError(400,"Página inválida.");
    const pageSize=200;
    const events = await prisma.events.findMany({
      where: {
        status: true,
        moderationStatus: "approved",
        ...publicEventWhere(),
        state,
        country: "BR",
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      include: publicInclude,
      orderBy: [{ dateEvent: "asc" }, { hourEvent: "asc" }, {id:"asc"}],
      skip:(page-1)*pageSize,
      take:pageSize,
    });
    res.json({ events, page, hasMore:events.length===pageSize });
  }),
);
portal.get(
  "/events/featured",
  action(async (_req, res) => {
    const now = new Date();
    const events = await prisma.events.findMany({
      where: {
        status: true,
        moderationStatus: "approved",
        ...publicEventWhere(),
        state: "SC",
        country: "BR",
        featuredPriority: { not: null },
        AND: [
          activePublication(),
          {
            OR: [
              { featuredStartsAt: null },
              { featuredStartsAt: { lte: now } },
            ],
          },
          { OR: [{ featuredEndsAt: null }, { featuredEndsAt: { gt: now } }] },
        ],
      },
      include: publicInclude,
      orderBy: { featuredPriority: "asc" },
      take: 10,
    });
    res.json({ events });
  }),
);
portal.get(
  "/events/:id",
  action(async (req, res) => {
    const event = await prisma.events.findFirst({
      where: {
        id: req.params.id,
        status: true,
        moderationStatus: "approved",
        ...publicEventWhere(),
        AND: [activePublication()],
      },
      include: publicInclude,
    });
    if (!event) throw new HttpError(404, "Evento não encontrado.");
    res.json({ event });
  }),
);
function eventInput(body: Record<string, unknown>) {
  const name = text(body.name, 3, 160),
    description = text(body.description, 20, 10000);
  const category = text(body.category);
  const state = text(body.state),
    city = text(body.city, 2, 120),
    venue = text(body.venue, 3, 200);
  const date = text(body.date),
    time = text(body.time),
    phone = text(body.phone, 8, 25);
  if (
    !categories.includes(category) ||
    state !== "SC" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new HttpError(400, "Confira categoria, local, data e horário.");
  const priceCents = Number(body.priceCents ?? 0);
  if (
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0 ||
    priceCents > 10000000
  )
    throw new HttpError(400, "Valor de ingresso inválido.");
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (url) {
    try {
      if (!["http:", "https:"].includes(new URL(url).protocol))
        throw new Error("invalid");
    } catch {
      throw new HttpError(400, "Informe um link válido.");
    }
  }
  const ticketUrl =
    typeof body.ticketUrl === "string" ? body.ticketUrl.trim() : "";
  if (ticketUrl) {
    try {
      if (!["http:", "https:"].includes(new URL(ticketUrl).protocol))
        throw Error();
    } catch {
      throw new HttpError(400, "Informe um link válido.");
    }
  }
  const streetAddress =
    typeof body.streetAddress === "string"
      ? body.streetAddress.trim().slice(0, 300)
      : "";
  if (streetAddress.length < 5)
    throw new HttpError(400, "Informe o endereço completo.");
  const coordinate = (value: unknown, limit: number) => {
    if (value === "" || value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > limit)
      throw new HttpError(400, "Coordenadas inválidas.");
    return n;
  };
  const latitude = coordinate(body.latitude, 90),
    longitude = coordinate(body.longitude, 180);
  if ((latitude === null) !== (longitude === null))
    throw new HttpError(400, "Informe as duas coordenadas.");
  const artists =
    typeof body.artists === "string"
      ? body.artists
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  if (artists.length > 50 || artists.some((x) => x.length > 120))
    throw new HttpError(400, "Confira a lista de artistas.");
  if (category === "Shows" && !artists.length)
    throw new HttpError(400, "Informe pelo menos um artista.");
  return {
    admissionType: "",
    donation: "",
    category,
    name,
    description,
    city,
    state,
    country: "BR",
    localityEvent: venue,
    ticketUrl,
    streetAddress,
    latitude,
    longitude,
    artists,
    dateEvent: date,
    hourEvent: time,
    phoneForContact: phone,
    urlPostSocialNetwork: url,
    urlLocalityEvent: "",
    priceCents,
  };
}
portal.post(
  "/events",
  isLogged,
  action(async (req, res) => {
    const user = await prisma.users.findFirst({
      where: { id: req.user_id, status: true },
    });
    if (!user) throw new HttpError(401, "Entre novamente.");
    if (!validDocument(user.cpfCnpj))
      throw new HttpError(
        400,
        "Cadastre um CPF ou CNPJ válido em Minha conta antes de publicar.",
      );
    if (
      req.body.acceptResponsibility !== true &&
      req.body.acceptResponsibility !== "true"
    )
      throw new HttpError(
        400,
        "Confirme sua responsabilidade pelas informações do evento.",
      );
    const publicationKey =
      typeof req.body.publicationKey === "string" &&
      /^[0-9a-f-]{36}$/i.test(req.body.publicationKey)
        ? req.body.publicationKey
        : undefined;
    if (publicationKey) {
      const existing = await prisma.adOrder.findFirst({
        where: { publicationKey, userId: req.user_id },
        include: { event: { include: publicInclude } },
      });
      if (existing) return res.json({ event: existing.event, order: existing });
    }
    req.body = normaliseScheduleBody(req.body);
    const { category, ...data } = eventInput(req.body);
    const sport = category === "Esportes" ? sportInput(req.body) : undefined;
    const period =
      sport?.format === "championship"
        ? publicationPeriod(req.body, sport.endsOn)
        : undefined;
    let programme =
      sport && (period || req.body.scheduleVersion === "2")
        ? parseSportSchedule(
            req.body.programme,
            sport.sport,
            sport.format,
            sport.startsOn,
            sport.endsOn,
          )
        : undefined;
    const extras: { url: string; remove: () => Promise<unknown> }[] = [];
    if (req.files?.rulesFile) validateSportFile(req.files.rulesFile, "rules");
    const rawProgramme = programme
      ? decodeProgramme(req.body.programme)
      : undefined;
    if (rawProgramme && Array.isArray(rawProgramme.teams))
      for (const team of rawProgramme.teams) {
        const file = req.files?.[`crest-${team.key}`];
        if (file) validateSportFile(file, "crest");
      }
    if (sport) data.city = scCity(data.city);
    if (sport || req.body.admissionType) {
      const entrance = admission(
        req.body.admissionType,
        req.body.donation,
        req.body.priceCents,
      );
      data.priceCents = entrance.priceCents;
      data.admissionType = entrance.admissionType;
      data.donation = entrance.donation;
    }
    const file = req.files?.bannerEvento;
    if (
      !file ||
      Array.isArray(file) ||
      !["image/jpeg", "image/png"].includes(file.mimetype) ||
      file.size > 5 * 1024 * 1024
    )
      throw new HttpError(400, "Selecione uma imagem JPG ou PNG de até 5 MB.");
    const local =
      process.env.UPLOAD_STORAGE === "local" &&
      process.env.NODE_ENV !== "production";
    const validPng = file.data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const validJpeg =
      file.data[0] === 255 && file.data[1] === 216 && file.data[2] === 255;
    if (!(file.mimetype === "image/png" ? validPng : validJpeg))
      throw new HttpError(400, "Imagem inválida.");
    if (
      !local &&
      (!process.env.CLOUDINARY_NAME ||
        !process.env.CLOUDINARY_KEY ||
        !process.env.CLOUDINARY_SECRET)
    )
      throw new HttpError(
        503,
        "Upload indisponível. Configure o serviço de imagens.",
      );
    const localName = `${randomUUID()}.${file.mimetype === "image/png" ? "png" : "jpg"}`;
    const localPath = path.join(process.cwd(), "uploads", localName);
    const image = local
      ? await (async () => {
          await mkdir(path.dirname(localPath), { recursive: true });
          await writeFile(localPath, file.data);
          return {
            secure_url: uploadUrl(req, localName),
            public_id: localName,
          };
        })()
      : await new Promise<{ secure_url: string; public_id: string }>(
          (resolve, reject) => {
            cloudinary.uploader
              .upload_stream(
                { folder: "uppoint/events", resource_type: "image" },
                (error, result) => {
                  if (error || !result)
                    reject(error ?? new Error("Upload falhou."));
                  else resolve(result);
                },
              )
              .end(file.data);
          },
        );
    try {
      if (sport && req.files?.rulesFile) {
        const saved = await storeSportFile(req, req.files.rulesFile, "rules");
        extras.push(saved);
        sport.rulesUrl = saved.url;
      }
      if (rawProgramme && sport && Array.isArray(rawProgramme.teams)) {
        for (const team of rawProgramme.teams) {
          const file = req.files?.[`crest-${team.key}`];
          if (file) {
            const saved = await storeSportFile(req, file, "crest");
            extras.push(saved);
            team.crestUrl = saved.url;
          }
        }
        programme = parseSportSchedule(
          rawProgramme,
          sport.sport,
          sport.format,
          sport.startsOn,
          sport.endsOn,
        );
      }
      const saved = await prisma.categories.findFirst({
        where: { name: category },
      });
      const chosen =
        saved ??
        (await prisma.categories.create({
          data: { name: category, idUserOwner: req.user_id },
        }));
      const placement = req.body.placement ?? "cards";
      if (!["cards", "carousel"].includes(placement))
        throw new HttpError(400, "Posição inválida.");
      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user_id}))`;
          if (publicationKey) {
            const existing = await tx.adOrder.findFirst({
              where: { publicationKey, userId: req.user_id },
              include: { event: { include: publicInclude } },
            });
            if (existing) return { event: existing.event, order: existing };
          }
          const owner = await tx.users.findUniqueOrThrow({
            where: { id: req.user_id },
          });
          const free = !period && placement === "cards" && !owner.freeAdUsed;
          const event = await tx.events.create({
            data: {
              ...data,
              placement,
              moderationStatus: "pending",
              idUserOwner: req.user_id,
              idCategory: chosen.id,
              bannerImageUrl: image.secure_url,
            },
            include: publicInclude,
          });
          await tx.adminAudit.create({
            data: {
              actorId: req.user_id,
              targetId: event.id,
              action: "publication_responsibility",
              detail: JSON.stringify({
                version: "2026-10-15-responsibility-v1",
              }),
            },
          });
          if (sport) {
            const c = await tx.sportCompetition.create({
              data: { ...sport, ...period, eventId: event.id },
            });
            if (programme) await saveSportSchedule(tx, c.id, programme);
          }
          const order = await tx.adOrder.create({
            data: {
              publicationKey,
              userId: req.user_id,
              eventId: event.id,
              placement,
              ...period,
              amountCents: period
                ? period.billedMonths * period.monthlyRateCents
                : free
                  ? 0
                  : placement === "carousel"
                    ? 5000
                    : 1000,
              status: free
                ? "free"
                : paymentsReady()
                  ? "awaiting_payment"
                  : "awaiting_configuration",
            },
          });
          if (free)
            await tx.users.update({
              where: { id: req.user_id },
              data: { freeAdUsed: true },
            });
          return {
            event: await tx.events.findUniqueOrThrow({
              where: { id: event.id },
              include: publicInclude,
            }),
            order,
          };
        },
        { timeout: 20000 },
      );
      if (result.event.bannerImageUrl !== image.secure_url) {
        await Promise.all(extras.map((asset) => asset.remove()));
        if (local) await unlink(localPath).catch(() => {});
        else await cloudinary.uploader.destroy(image.public_id).catch(() => {});
      }
      res.status(201).json(result);
    } catch (error) {
      await Promise.all(extras.map((asset) => asset.remove()));
      if (local) await unlink(localPath).catch((): void => {});
      else
        await cloudinary.uploader
          .destroy(image.public_id)
          .catch((): void => {});
      throw error;
    }
  }),
);
portal.put(
  "/events/:id",
  isLogged,
  action(async (req, res) => {
    const owned = await prisma.events.findFirst({
      where: {
        id: req.params.id,
        status: true,
        idUserOwner: req.user_id,
        userOwner: { status: true },
      },
    });
    if (!owned)
      throw new HttpError(404, "Evento não encontrado ou sem permissão.");
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: req.user_id },
    });
    if (!validDocument(user.cpfCnpj))
      throw new HttpError(
        400,
        "Cadastre um CPF ou CNPJ válido em Minha conta antes de publicar.",
      );
    if (req.body.acceptResponsibility !== true)
      throw new HttpError(
        400,
        "Confirme sua responsabilidade pelas informações do evento.",
      );
    const { category, ...data } = eventInput(req.body);
    const competition = await prisma.sportCompetition.findUnique({
      where: { eventId: owned.id },
    });
    if (competition && category !== "Esportes")
      throw new HttpError(409, "Edite sua competição na área Esportes.");
    if (!competition && category === "Esportes")
      throw new HttpError(400, "Cadastre um novo evento esportivo.");
    if (
      competition &&
      (data.dateEvent < competition.startsOn ||
        data.dateEvent > competition.endsOn)
    )
      throw new HttpError(400, "Confira o período desta edição.");
    if (competition) {
      const a = admission(
        req.body.admissionType ?? competition.admissionType,
        req.body.donation ?? competition.donation,
        data.priceCents,
      );
      data.priceCents = a.priceCents;
      data.admissionType = a.admissionType;
      data.donation = a.donation;
    } else if (req.body.admissionType) {
      const a = admission(
        req.body.admissionType,
        req.body.donation,
        data.priceCents,
      );
      data.admissionType = a.admissionType;
      data.donation = a.donation;
      data.priceCents = a.priceCents;
    }
    const chosen = await prisma.categories.findFirst({
      where: { name: category },
    });
    if (!chosen) throw new HttpError(400, "Categoria inválida.");
    const event = await prisma.$transaction(async (tx) => {
      if (competition)
        await tx.sportCompetition.update({
          where: { id: competition.id },
          data: {
            admissionType: data.admissionType,
            donation: data.donation,
            rulesUrl:
              typeof req.body.rulesUrl === "string"
                ? link(req.body.rulesUrl)
                : competition.rulesUrl,
            winPoints:
              req.body.winPoints === undefined
                ? competition.winPoints
                : integer(req.body.winPoints, 0, 100),
            drawPoints:
              req.body.drawPoints === undefined
                ? competition.drawPoints
                : integer(req.body.drawPoints, 0, 100),
            lossPoints:
              req.body.lossPoints === undefined
                ? competition.lossPoints
                : integer(req.body.lossPoints, 0, 100),
          },
        });
      await tx.adminAudit.create({
        data: {
          actorId: req.user_id,
          targetId: owned.id,
          action: "publication_responsibility",
          detail: JSON.stringify({ version: "2026-10-15-responsibility-v1" }),
        },
      });
      return tx.events.update({
        where: { id: owned.id },
        data: {
          ...data,
          moderationStatus: "pending",
          moderationReason: null,
          featuredPriority: null,
          idCategory: chosen.id,
          updated_At: new Date(),
        },
        include: publicInclude,
      });
    });
    res.json({ event });
  }),
);
portal.delete(
  "/events/:id",
  isLogged,
  action(async (req, res) => {
    const result = await prisma.events.updateMany({
      where: {
        id: req.params.id,
        status: true,
        idUserOwner: req.user_id,
        userOwner: { status: true },
      },
      data: { status: false, updated_At: new Date() },
    });
    if (!result.count)
      throw new HttpError(404, "Evento não encontrado ou sem permissão.");
    res.status(204).end();
  }),
);
export function portalError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof SportError)
    return res.status(error.status).json({ message: error.message });
  if (error instanceof PaymentError)
    return res.status(error.status).json({ message: error.message });
  if (error instanceof HttpError)
    return res.status(error.status).json({ message: error.message });
  console.error(
    "Falha na API",
    error instanceof Error ? error.name : "Erro desconhecido",
  );
  return res
    .status(500)
    .json({ message: "Não foi possível concluir a solicitação." });
}
