import { Router, type Request } from "express";
import prisma from "../prisma";
import { authGuard } from "./authGuard";
import { isLogged } from "../middlewares/isLogged";
export const support = Router();
async function admin(req: Request) {
  return Boolean(
    await prisma.users.findFirst({
      where: { id: req.user_id, status: true, typeAccess: "admin" },
      select: { id: true },
    }),
  );
}
support.post("/support/requests", authGuard, async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : "";
    const category = String(req.body.category ?? "general"),
      eventId =
        typeof req.body.eventId === "string" ? req.body.eventId.trim() : "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      description.length < 20 ||
      description.length > 2000 ||
      !["general", "report", "privacy"].includes(category) ||
      eventId.length > 100
    )
      return res
        .status(400)
        .json({
          message:
            "Confira o email e descreva a solicitação com 20 a 2000 caracteres.",
        });
    const request = await prisma.supportRequest.create({
      data: { email, description, category, eventId: eventId || null },
    });
    res.status(201).json({ id: request.id, status: request.status });
  } catch (error) {
    next(error);
  }
});
support.get("/admin/support", isLogged, async (req, res, next) => {
  try {
    if (!(await admin(req)))
      return res
        .status(403)
        .json({ message: "Acesso restrito ao administrador." });
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1)
      return res.status(400).json({ message: "Página inválida." });
    const requests = await prisma.supportRequest.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      skip: (page - 1) * 50,
    });
    res.json({ requests, hasMore: requests.length === 50 });
  } catch (error) {
    next(error);
  }
});
support.patch("/admin/support/:id", isLogged, async (req, res, next) => {
  try {
    if (!(await admin(req)))
      return res
        .status(403)
        .json({ message: "Acesso restrito ao administrador." });
    if (!["open", "resolved"].includes(req.body.status))
      return res.status(400).json({ message: "Ação inválida." });
    const exists = await prisma.supportRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!exists)
      return res.status(404).json({ message: "Solicitação não encontrada." });
    await prisma.$transaction(async (tx) => {
      await tx.supportRequest.update({
        where: { id: exists.id },
        data: { status: req.body.status },
      });
      await tx.adminAudit.create({
        data: {
          actorId: req.user_id,
          targetId: exists.id,
          action: "support_update",
          detail: req.body.status,
        },
      });
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
