import { Router, type Request, type Response, type NextFunction } from "express";
import { hash, compare } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import prisma from "../prisma";
import { isLogged } from "../middlewares/isLogged";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authGuard } from "./authGuard";

export const portal = Router();
const categories = ["Shows", "Festas", "Baladas", "Gastronomia", "Cultura", "Gospel"];
const states = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const action = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
function text(value: unknown, min = 1, max = 500): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max)
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
function session(user: { id: string; name: string; email: string | null }) {
  return { user: { id: user.id, name: user.name, email: user.email },
    token: sign({}, secret(), { subject: user.id, expiresIn: "8h", algorithm: "HS256" }) };
}
portal.post("/auth/register", authGuard, action(async (req, res) => {
  const name = text(req.body.name, 2, 120);
  const email = text(req.body.email, 3, 254).toLowerCase();
  const password = passwordValue(req.body.password, 8);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || req.body.acceptTerms !== true)
    throw new HttpError(400, "Informe um email válido e aceite os termos e a privacidade.");
  secret();
  // Serialize equal-email registrations even while the legacy schema allows repeated emails.
  const user = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
    if (await tx.users.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }))
      throw new HttpError(409, "Este email já possui uma conta.");
    return tx.users.create({ data: { name, email, password: await hash(password, 12),
      termsUsePlatform: true, termsPrivacyPolicy: true, termsUseLGPD: true },
      select: { id: true, name: true, email: true } });
  });
  res.status(201).json(session(user));
}));
portal.post("/auth/login", authGuard, action(async (req, res) => {
  const account = text(req.body.account, 1, 254);
  const password = passwordValue(req.body.password, 1);
  const user = await prisma.users.findFirst({ where: { status: true, OR: [
    { email: { equals: account, mode: "insensitive" } }, { cpfCnpj: account }
  ] } });
  if (!user || !(await compare(password, user.password)))
    throw new HttpError(401, "Email ou senha inválidos.");
  res.json(session(user));
}));
portal.get("/auth/me", isLogged, action(async (req, res) => {
  const user = await prisma.users.findFirst({ where: { id: req.user_id, status: true },
    select: { id: true, name: true, email: true } });
  if (!user) throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
  res.json({ user });
}));
const publicInclude = { categories: { select: { name: true } } } as const;
portal.get("/events", action(async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "SC";
  if (!states.includes(state)) throw new HttpError(400, "Estado inválido.");
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : "";
  const events = await prisma.events.findMany({ where: { status: true, state, country: "BR",
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    include: publicInclude, orderBy: [{ dateEvent: "asc" }, { hourEvent: "asc" }], take: 500 });
  res.json({ events });
}));
portal.get("/events/featured", action(async (_req, res) => {
  const now = new Date();
  const events = await prisma.events.findMany({ where: { status: true, state: "SC", country: "BR",
    featuredPriority: { not: null }, AND: [
      { OR: [{ featuredStartsAt: null }, { featuredStartsAt: { lte: now } }] },
      { OR: [{ featuredEndsAt: null }, { featuredEndsAt: { gt: now } }] }
    ] }, include: publicInclude, orderBy: { featuredPriority: "asc" }, take: 10 });
  res.json({ events });
}));
portal.get("/events/:id", action(async (req, res) => {
  const event = await prisma.events.findFirst({ where: { id: req.params.id, status: true }, include: publicInclude });
  if (!event) throw new HttpError(404, "Evento não encontrado.");
  res.json({ event });
}));
function eventInput(body: Record<string, unknown>) {
  const name = text(body.name, 3, 160), description = text(body.description, 20, 10000);
  const category = text(body.category);
  const state = text(body.state), city = text(body.city, 2, 120), venue = text(body.venue, 3, 200);
  const date = text(body.date), time = text(body.time), phone = text(body.phone, 8, 25);
  if (!categories.includes(category) || !states.includes(state) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0,10) !== date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, "Confira categoria, local, data e horário.");
  const priceCents = Number(body.priceCents ?? 0);
  if (!Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 10000000)
    throw new HttpError(400, "Valor de ingresso inválido.");
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (url) {
    try { if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error("invalid"); }
    catch { throw new HttpError(400, "Informe um link válido."); }
  }
  return { category, name, description, city, state, country: "BR", localityEvent: venue,
    dateEvent: date, hourEvent: time, phoneForContact: phone, urlPostSocialNetwork: url,
    urlLocalityEvent: "", priceCents };
}
portal.post("/events", isLogged, action(async (req, res) => {
  const user = await prisma.users.findFirst({ where: { id: req.user_id, status: true } });
  if (!user) throw new HttpError(401, "Entre novamente.");
  const { category, ...data } = eventInput(req.body);
  const file = req.files?.bannerEvento;
  if (!file || Array.isArray(file) || !["image/jpeg", "image/png"].includes(file.mimetype) ||
      file.size > 5 * 1024 * 1024) throw new HttpError(400, "Selecione uma imagem JPG ou PNG de até 5 MB.");
  const local = process.env.UPLOAD_STORAGE === "local" && process.env.NODE_ENV !== "production";
  const validPng = file.data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const validJpeg = file.data[0] === 255 && file.data[1] === 216 && file.data[2] === 255;
  if (!(file.mimetype === "image/png" ? validPng : validJpeg)) throw new HttpError(400, "Imagem inválida.");
  if (!local && (!process.env.CLOUDINARY_NAME || !process.env.CLOUDINARY_KEY || !process.env.CLOUDINARY_SECRET))
    throw new HttpError(503, "Upload indisponível. Configure o serviço de imagens.");
  const localName = `${randomUUID()}.${file.mimetype === "image/png" ? "png" : "jpg"}`;
  const localPath = path.join(process.cwd(), "uploads", localName);
  const image = local ? await (async () => {
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, file.data);
    return { secure_url: `http://127.0.0.1:${process.env.PORT ?? 3333}/uploads/${localName}`, public_id: localName };
  })() : await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: "uppoint/events", resource_type: "image" }, (error, result) => {
      if (error || !result) reject(error ?? new Error("Upload falhou."));
      else resolve(result);
    }).end(file.data);
  });
  try {
    const saved = await prisma.categories.findFirst({ where: { name: category } });
    const chosen = saved ?? await prisma.categories.create({ data: { name: category, idUserOwner: req.user_id } });
    const event = await prisma.events.create({ data: { ...data, idUserOwner: req.user_id,
      idCategory: chosen.id, bannerImageUrl: image.secure_url }, include: publicInclude });
    res.status(201).json({ event });
  } catch (error) {
    if (local) await unlink(localPath).catch((): void => {});
    else await cloudinary.uploader.destroy(image.public_id).catch((): void => {});
    throw error;
  }
}));
portal.put("/events/:id", isLogged, action(async (req, res) => {
  const owned = await prisma.events.findFirst({ where: { id: req.params.id, idUserOwner: req.user_id, userOwner: { status: true } } });
  if (!owned) throw new HttpError(404, "Evento não encontrado ou sem permissão.");
  const { category, ...data } = eventInput(req.body);
  const chosen = await prisma.categories.findFirst({ where: { name: category } });
  if (!chosen) throw new HttpError(400, "Categoria inválida.");
  const event = await prisma.events.update({ where: { id: owned.id },
    data: { ...data, idCategory: chosen.id, updated_At: new Date() }, include: publicInclude });
  res.json({ event });
}));
portal.delete("/events/:id", isLogged, action(async (req, res) => {
  const result = await prisma.events.updateMany({ where: { id: req.params.id, idUserOwner: req.user_id, userOwner: { status: true } },
    data: { status: false, updated_At: new Date() } });
  if (!result.count) throw new HttpError(404, "Evento não encontrado ou sem permissão.");
  res.status(204).end();
}));
export function portalError(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  console.error("Falha na API", error instanceof Error ? error.name : "Erro desconhecido");
  return res.status(500).json({ message: "Não foi possível concluir a solicitação." });
}
