import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import prisma from "../prisma";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let busy = false;
export async function deliverReceipts() {
  if (busy || !process.env.SMTP_HOST || !process.env.SMTP_FROM) return;
  busy = true;
  try {
    const messages = await prisma.paymentEmail.findMany({
      where: { sentAt: null, nextAttemptAt: { lte: new Date() } },
      take: 10,
    });
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 60000,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    for (const message of messages) {
      const recipient =
        message.recipient ??
        (message.recipientType === "finance"
          ? process.env.FINANCE_EMAIL
          : undefined);
      if (!recipient) continue;
      const order = await prisma.adOrder.findUnique({
        where: { id: message.orderId },
        include: { event: true, user: true },
      });
      if (
        !order ||
        order.status !== "paid" ||
        !order.providerPaymentId ||
        !order.paidAt
      )
        continue;
      const claimed = await prisma.paymentEmail.updateMany({
        where: {
          id: message.id,
          sentAt: null,
          nextAttemptAt: { lte: new Date() },
        },
        data: { nextAttemptAt: new Date(Date.now() + 300000) },
      });
      if (!claimed.count) continue;
      try {
        const money = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(order.amountCents / 100);
        const lines = [
          "UP Point - Comprovante de pagamento",
          `Cliente: ${order.user.name}`,
          `Evento: ${order.event.name}`,
          `Valor: ${money}`,
          ...(order.monthlyRateCents
            ? [
                `Divulgacao: ${order.advertisingFrom} ate ${order.advertisingUntil}`,
                `Meses: ${order.billedMonths} x R$ 50`,
              ]
            : []),
          `Metodo: ${order.paymentMethod}`,
          `Pagamento: ${order.paidAt.toISOString()}`,
          `Pedido: ${order.id}`,
          `Transacao PagBank: ${order.providerPaymentId}`,
          "Processado pelo PagBank. Este comprovante nao e nota fiscal.",
          ...(order.paymentEnvironment === "sandbox"
            ? ["AMBIENTE DE TESTES - SEM VALOR FINANCEIRO"]
            : []),
        ];
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([595, 842]);
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        lines.forEach((line, index) =>
          page.drawText(line.replace(/[^\x20-\xFF]/g, "?").slice(0, 100), {
            x: 40,
            y: 790 - index * 35,
            size: index === 0 ? 19 : 11,
            font,
            color: rgb(0.25, 0.08, 0.5),
          }),
        );
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: recipient,
          messageId: `<uppoint-${message.id}@upstudiodigital.com.br>`,
          subject: `UP Point - pagamento confirmado${order.paymentEnvironment === "sandbox" ? " [TESTE]" : ""}`,
          html: `<h1>Pagamento confirmado</h1><p>${escape(order.event.name)} — ${money}</p><p>Seu comprovante está em anexo. Consulte a divulgação e o período contratado no seu painel.</p>`,
          attachments: [
            {
              filename: `comprovante-${order.id}.pdf`,
              content: Buffer.from(await pdf.save()),
            },
          ],
        });
        await prisma.paymentEmail.update({
          where: { id: message.id },
          data: { sentAt: new Date(), recipient, attempts: { increment: 1 } },
        });
      } catch {
        await prisma.paymentEmail.update({
          where: { id: message.id },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(3600000, 60000 * 2 ** Math.min(message.attempts, 6)),
            ),
          },
        });
      }
    }
  } finally {
    busy = false;
  }
}
