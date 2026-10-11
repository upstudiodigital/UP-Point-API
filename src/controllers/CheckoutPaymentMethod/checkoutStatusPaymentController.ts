import type { Request, Response } from 'express';
// Legacy payment handler references absent passport/voucher modules.
// Payments are outside Sprint 2 and must not acknowledge unverified webhooks.
export class CheckoutStatusPaymentController {
  handle(_req: Request, res: Response) {
    return res.status(501).json({ message: 'Integração de pagamentos ainda não disponível.' });
  }
}
