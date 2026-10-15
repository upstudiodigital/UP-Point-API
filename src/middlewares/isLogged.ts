import prisma from "../prisma";
import type { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
type SessionLookup = (id: string) => Promise<{ sessionVersion: number } | null>;
export function createAuthMiddleware(
  lookup: SessionLookup = (id) =>
    prisma.users.findFirst({
      where: { id, status: true },
      select: { sessionVersion: true },
    }),
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? "");
    if (!match)
      return res.status(401).json({ message: "Faça login para continuar." });
    const secret = process.env.JWT_SECRET;
    if (!secret)
      return res.status(503).json({ message: "Autenticação indisponível." });
    let payload;
    try {
      payload = verify(match[1], secret, { algorithms: ["HS256"] });
    } catch {
      return res
        .status(401)
        .json({ message: "Sua sessão expirou. Entre novamente." });
    }
    if (typeof payload === "string" || typeof payload.sub !== "string")
      return res.status(401).json({ message: "Sessão inválida." });
    try {
      const user = await lookup(payload.sub);
      if (!user || (payload.sv ?? 0) !== user.sessionVersion)
        return res
          .status(401)
          .json({ message: "Sua sessão expirou. Entre novamente." });
      req.user_id = payload.sub;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
export const isLogged = createAuthMiddleware();
