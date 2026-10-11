import type { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';

export const isLogged = (req: Request, res: Response, next: NextFunction) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
  if (!match) return res.status(401).json({ message: 'Faça login para continuar.' });
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(503).json({ message: 'Autenticação indisponível.' });
  try {
    const payload = verify(match[1], secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return res.status(401).json({ message: 'Sessão inválida.' });
    }
    req.user_id = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ message: 'Sua sessão expirou. Entre novamente.' });
  }
};
