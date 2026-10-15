import { support } from "./portal/support";
import prisma from "./prisma";
import { recovery } from "./portal/recovery";
import { sports } from "./portal/sports";
import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import { v2 as cloudinary } from "cloudinary";
import { router } from "./routes";
import { portal, portalError } from "./portal/routes";
import path from "node:path";
import { dashboard } from "./portal/dashboard";
import { payments, paymentWebhook } from "./portal/payments";

import { locationTools } from "./portal/location";
const app = express();
import { allowedOrigin, serverPorts } from "./portal/localConfig";
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production")
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use(
  cors({ origin: (origin, callback) => callback(null, allowedOrigin(origin)) }),
);
app.post(
  "/payments/pagbank/webhook",
  express.raw({ type: "application/json", limit: "100kb" }),
  paymentWebhook,
);
app.use(express.json({ limit: "100kb" }));
app.use(
  fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: true,
  }),
);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});
app.use(locationTools);
app.use(sports);
app.use(dashboard);
app.use(payments);
app.use(portal);
app.use(recovery);
app.use(support);
if (
  process.env.UPLOAD_STORAGE === "local" &&
  process.env.NODE_ENV !== "production"
) {
  app.use(
    "/uploads",
    express.static(path.join(process.cwd(), "uploads"), {
      dotfiles: "deny",
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
}
// Keep unrelated legacy management/payment endpoints private until reviewed.
if (process.env.ENABLE_LEGACY_ROUTES === "true") app.use(router);
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use(portalError);
for (const port of serverPorts()) {
  const server = app.listen(
    port,
    process.env.HOST ??
      (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
    () => console.log(`UP Point API: http://127.0.0.1:${port}`),
  );
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Porta ${port} ocupada. Use npm run dev -- --port ${port + 1} para trabalhar em outra instância.`
        : `Não foi possível iniciar a API: ${error.code}`,
    );
    process.exitCode = 1;
  });
}

import { deliverReceipts } from "./portal/receipts";
setInterval(() => void deliverReceipts().catch(() => {}), 60000).unref();
