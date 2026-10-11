import type { Request, Response, NextFunction } from "express";
const attempts = new Map<string, { count: number; until: number }>();
export function authGuard(req: Request, res: Response, next: NextFunction) {
  const now = Date.now(), key = req.ip ?? "unknown";
  for (const [ip, value] of attempts) if (value.until <= now) attempts.delete(ip);
  const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
  entry.count += 1; attempts.set(key, entry);
  if (entry.count > 30) {
    res.setHeader("Retry-After", Math.ceil((entry.until - now) / 1000));
    return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos." });
  }
  return next();
}
