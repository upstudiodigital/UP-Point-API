import { uploadUrl } from "./localConfig";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import prisma from "../prisma";
import { isLogged } from "../middlewares/isLogged";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { validDocument } from "./document";
import { paymentsReady } from "./pagbank";

export const dashboard = Router();
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
const account = async (req: Request) => {
  const user = await prisma.users.findFirst({
    where: { id: req.user_id, status: true },
  });
  if (!user) throw new Failure(401, "Entre novamente.");
  return user;
};
const admin = async (req: Request) => {
  const user = await account(req);
  if (user.typeAccess !== "admin")
    throw new Failure(403, "Acesso restrito ao administrador.");
  return user;
};
const profileSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  cpfCnpj: true,
  profileAvatar: true,
  typeAccess: true,
  status: true,
  created_At: true,
} as const;
dashboard.get(
  "/account/dashboard",
  isLogged,
  run(async (req, res) => {
    const user = await account(req);
    const [events, orders] = await Promise.all([
      prisma.events.findMany({
        where: { idUserOwner: user.id },
        include: {
          categories: { select: { name: true } },
          sportCompetition: { select: { id: true } },
        },
        orderBy: { created_At: "desc" },
      }),
      prisma.adOrder.findMany({
        where: { userId: user.id },
        include: { event: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      events,
      orders,
      freeAvailable: !user.freeAdUsed,
      paymentConfigured: paymentsReady(),
      paymentEnvironment: process.env.PAGBANK_ENVIRONMENT ?? "sandbox",
      debitEnabled: process.env.PAGBANK_DEBIT_ENABLED === "true",
    });
  }),
);
dashboard.get(
  "/account/profile",
  isLogged,
  run(async (req, res) => {
    await account(req);
    res.json({
      user: await prisma.users.findUnique({
        where: { id: req.user_id },
        select: profileSelect,
      }),
    });
  }),
);
dashboard.get(
  "/account/events/:id",
  isLogged,
  run(async (req, res) => {
    await account(req);
    const event = await prisma.events.findFirst({
      where: { id: req.params.id, idUserOwner: req.user_id, status: true },
      include: {
        categories: { select: { name: true } },
        sportCompetition: { select: { id: true } },
      },
    });
    if (!event) throw new Failure(404, "Evento não encontrado.");
    res.json({ event });
  }),
);
dashboard.patch(
  "/account/profile",
  isLogged,
  run(async (req, res) => {
    await account(req);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    if (name.length < 2 || name.length > 120 || phone.length > 25)
      throw new Failure(400, "Confira os campos obrigatórios.");
    const cpfCnpj =
      req.body.cpfCnpj === undefined
        ? undefined
        : String(req.body.cpfCnpj).replace(/\D/g, "");
    if (cpfCnpj && !validDocument(cpfCnpj))
      throw new Failure(400, "Informe um CPF ou CNPJ válido.");
    const file = req.files?.avatar;
    let profileAvatar: string | undefined;
    if (file) {
      if (
        Array.isArray(file) ||
        file.size > 5 * 1024 * 1024 ||
        !["image/png", "image/jpeg"].includes(file.mimetype)
      )
        throw new Failure(400, "Selecione uma imagem JPG ou PNG de até 5 MB.");
      const png = file.data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg =
        file.data[0] === 255 && file.data[1] === 216 && file.data[2] === 255;
      if (!(file.mimetype === "image/png" ? png : jpg))
        throw new Failure(400, "Imagem inválida.");
      if (
        process.env.UPLOAD_STORAGE === "local" &&
        process.env.NODE_ENV !== "production"
      ) {
        const filename = `${randomUUID()}.${png ? "png" : "jpg"}`;
        await mkdir(path.join(process.cwd(), "uploads"), { recursive: true });
        await writeFile(
          path.join(process.cwd(), "uploads", filename),
          file.data,
        );
        profileAvatar = uploadUrl(req, filename);
      } else {
        if (
          !process.env.CLOUDINARY_NAME ||
          !process.env.CLOUDINARY_KEY ||
          !process.env.CLOUDINARY_SECRET
        )
          throw new Failure(
            503,
            "Upload indisponível. Configure o serviço de imagens.",
          );
        profileAvatar = await new Promise<string>((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              { folder: "uppoint/avatars", resource_type: "image" },
              (err, result) => {
                if (err || !result) reject(err ?? Error("Upload"));
                else resolve(result.secure_url);
              },
            )
            .end(file.data);
        });
      }
    }
    const user = await prisma.users.update({
      where: { id: req.user_id },
      data: { name, phone, cpfCnpj, profileAvatar, updated_At: new Date() },
      select: profileSelect,
    });
    res.json({ user });
  }),
);
dashboard.get(
  "/admin/dashboard",
  isLogged,
  run(async (req, res) => {
    await admin(req);
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new Failure(400, "Página inválida.");
    const pageSize = 100,
      skip = (page - 1) * pageSize;
    const [events, orders, users, audit, traffic] = await Promise.all([
      prisma.events.findMany({
        include: {
          userOwner: { select: profileSelect },
          categories: { select: { name: true } },
          orders: true,
        },
        orderBy: [{ created_At: "desc" }, { id: "desc" }],
        take: pageSize,
        skip,
      }),
      prisma.adOrder.findMany({
        include: {
          user: { select: profileSelect },
          event: { select: { name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize,
        skip,
      }),
      prisma.users.findMany({
        select: profileSelect,
        orderBy: [{ created_At: "desc" }, { id: "desc" }],
        take: pageSize,
        skip,
      }),
      prisma.adminAudit.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize,
        skip,
      }),
      prisma.dailyTraffic.findMany({ orderBy: { day: "desc" }, take: 30 }),
    ]);
    const totals = await prisma.adOrder.aggregate({
      where: {
        status: "paid",
        OR: [
          { paymentEnvironment: process.env.PAGBANK_ENVIRONMENT ?? "sandbox" },
          { paymentEnvironment: null },
        ],
      },
      _sum: { amountCents: true },
      _count: true,
    });
    res.json({
      events,
      orders,
      users,
      audit,
      traffic,
      page,
      hasMore: [events, orders, users, audit].some(
        (rows) => rows.length === pageSize,
      ),
      revenueCents: totals._sum.amountCents ?? 0,
      paidOrders: totals._count,
      paymentConfigured: paymentsReady(),
      paymentEnvironment: process.env.PAGBANK_ENVIRONMENT ?? "sandbox",
      debitEnabled: process.env.PAGBANK_DEBIT_ENABLED === "true",
    });
  }),
);
dashboard.patch(
  "/admin/events/:id",
  isLogged,
  run(async (req, res) => {
    await admin(req);
    const operation = req.body.operation;
    if (!["approve", "reject", "delete"].includes(operation))
      throw new Failure(400, "Ação inválida.");
    const reason =
      typeof req.body.reason === "string"
        ? req.body.reason.trim().slice(0, 500)
        : "";
    if (operation === "reject" && reason.length < 3)
      throw new Failure(400, "Informe o motivo da recusa.");
    const event = await prisma.$transaction(async (tx) => {
      const current = await tx.events.findUnique({
        where: { id: req.params.id },
        include: { orders: true },
      });
      if (!current || !current.status)
        throw new Failure(404, "Evento não encontrado.");
      if (
        operation === "approve" &&
        !current.orders.some((o) => ["free", "paid"].includes(o.status))
      )
        throw new Failure(409, "Aguarde a confirmação do pagamento.");
      const saved = await tx.events.update({
        where: { id: current.id },
        data:
          operation === "delete"
            ? { status: false, featuredPriority: null }
            : operation === "approve"
              ? {
                  moderationStatus: "approved",
                  moderationReason: null,
                  featuredPriority: current.placement === "carousel" ? 1 : null,
                }
              : {
                  moderationStatus: "rejected",
                  moderationReason: reason,
                  featuredPriority: null,
                },
      });
      await tx.adminAudit.create({
        data: {
          actorId: req.user_id,
          targetId: current.id,
          action: operation,
          detail: reason,
        },
      });
      return saved;
    });
    res.json({ event });
  }),
);
dashboard.patch(
  "/admin/users/:id",
  isLogged,
  run(async (req, res) => {
    await admin(req);
    if (req.params.id === req.user_id || typeof req.body.status !== "boolean")
      throw new Failure(400, "Não é possível bloquear sua própria conta.");
    await prisma.$transaction(async (tx) => {
      const target = await tx.users.findUnique({
        where: { id: req.params.id },
      });
      if (!target) throw new Failure(404, "Conta não encontrada.");
      if (target.typeAccess === "admin")
        throw new Failure(
          403,
          "Contas administrativas não podem ser bloqueadas por este painel.",
        );
      await tx.users.update({
        where: { id: target.id },
        data: { status: req.body.status },
      });
      await tx.adminAudit.create({
        data: {
          actorId: req.user_id,
          targetId: target.id,
          action: req.body.status ? "unblock" : "block",
          detail: "",
        },
      });
    });
    res.status(204).end();
  }),
);
// Aggregate page views only; no IP, cookies, visitor identity, or fingerprint are persisted.
const trafficRate = new Map<string, { count: number; until: number }>();
dashboard.post(
  "/analytics/page-view",
  run(async (req, res) => {
    const now = Date.now();
    const key = req.ip ?? "local";
    for (const [ip, value] of trafficRate)
      if (value.until < now) trafficRate.delete(ip);
    const counter = trafficRate.get(key) ?? { count: 0, until: now + 60000 };
    if (counter.count >= 30) return res.status(429).end();
    counter.count++;
    trafficRate.set(key, counter);
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await prisma.dailyTraffic.upsert({
      where: { day },
      create: { day, pageViews: 1 },
      update: { pageViews: { increment: 1 } },
    });
    res.status(204).end();
  }),
);
dashboard.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof Failure)
      return res.status(error.status).json({ message: error.message });
    next(error);
  },
);
