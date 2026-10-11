import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import { v2 as cloudinary } from 'cloudinary';
import { router } from './routes';
import { portal, portalError } from './portal/routes';
import path from 'node:path';

const app = express();
const origins = (process.env.FRONTEND_ORIGINS ?? 'http://127.0.0.1:5174,http://localhost:5174').split(',');
app.disable('x-powered-by');
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '100kb' }));
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 }, abortOnLimit: true, safeFileNames: true }));
cloudinary.config({ cloud_name: process.env.CLOUDINARY_NAME, api_key: process.env.CLOUDINARY_KEY, api_secret: process.env.CLOUDINARY_SECRET });
app.use(portal);
if (process.env.UPLOAD_STORAGE === 'local' && process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { dotfiles: 'deny', setHeaders: res => { res.setHeader('X-Content-Type-Options', 'nosniff'); } }));
}
// Keep unrelated legacy management/payment endpoints private until reviewed.
if (process.env.ENABLE_LEGACY_ROUTES === 'true') app.use(router);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use(portalError);
const port = Number(process.env.PORT ?? 3333);
app.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`UP Point API: http://127.0.0.1:${port}`));
