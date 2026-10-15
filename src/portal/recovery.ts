import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { hash } from "bcryptjs";
import nodemailer from "nodemailer";
import prisma from "../prisma";
import { authGuard } from "./authGuard";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function createRecoveryRouter(
  send?: (email: string, url: string) => Promise<void>,
) {
  const router = Router();
  router.post("/auth/forgot-password", authGuard, async (req, res, next) => {
    try {
      const email = String(req.body.email ?? "")
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        return res.status(400).json({ message: "Informe um email válido." });
      if (
        !send &&
        (!process.env.SMTP_HOST ||
          !process.env.SMTP_FROM ||
          !process.env.FRONTEND_URL)
      )
        return res.status(503).json({
          message: "Recuperação indisponível. Entre em contato com o suporte.",
        });
      const user = await prisma.users.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, status: true },
      });
      if (
        user &&
        !(await prisma.passwordReset.findFirst({
          where: {
            userId: user.id,
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
        }))
      ) {
        const token = randomBytes(32).toString("hex");
        const saved = await prisma.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: digest(token),
            expiresAt: new Date(Date.now() + 1800000),
          },
        });
        const url = new URL(
          "/redefinir-senha",
          process.env.FRONTEND_URL || "http://127.0.0.1:5174",
        );
        url.hash = new URLSearchParams({ token }).toString();
        try {
          if (send) await send(email, url.href);
          else
            await nodemailer
              .createTransport({
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 60000,
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT ?? 587),
                secure: process.env.SMTP_PORT === "465",
                ...(process.env.SMTP_USER
                  ? {
                      auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASSWORD,
                      },
                    }
                  : {}),
              })
              .sendMail({
                from: process.env.SMTP_FROM,
                to: email,
                subject: "UP Point — recuperação de acesso",
                text: `Use este link em até 30 minutos para redefinir sua senha: ${url.href}\nSe não foi você, ignore esta mensagem.`,
              });
        } catch {
          await prisma.passwordReset.update({
            where: { id: saved.id },
            data: { usedAt: new Date() },
          });
          console.error("Falha no envio da recuperação de conta");
        }
      }
      res.json({
        message:
          "Se houver uma conta com esse email, enviaremos as instruções de recuperação.",
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/auth/reset-password", authGuard, async (req, res, next) => {
    try {
      const token = String(req.body.token ?? ""),
        password = req.body.password;
      if (
        !/^[a-f0-9]{64}$/.test(token) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      )
        return res.status(400).json({
          message: "Confira o link e use uma senha de 8 a 128 caracteres.",
        });
      const passwordHash = await hash(password, 12);
      const reset = await prisma.$transaction(async (tx) => {
        const record = await tx.passwordReset.findUnique({
          where: { tokenHash: digest(token) },
        });
        if (
          !record ||
          record.usedAt ||
          record.expiresAt <= new Date() ||
          !(await tx.users.findFirst({
            where: { id: record.userId, status: true },
          }))
        )
          return false;
        const claimed = await tx.passwordReset.updateMany({
          where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (!claimed.count) return false;
        await tx.users.update({
          where: { id: record.userId },
          data: {
            password: passwordHash,
            sessionVersion: { increment: 1 },
            updated_At: new Date(),
          },
        });
        await tx.passwordReset.updateMany({
          where: { userId: record.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        return true;
      });
      if (!reset)
        return res.status(400).json({
          message: "Este link expirou ou já foi usado. Solicite um novo.",
        });
      res.json({
        message: "Senha atualizada. Entre novamente com sua nova senha.",
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
export const recovery = createRecoveryRouter();
