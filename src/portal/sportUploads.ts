import type { Request } from "express";
import type { UploadedFile } from "express-fileupload";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { SportError } from "./sportRules";
import { uploadUrl } from "./localConfig";
export function validateSportFile(
  file: UploadedFile | UploadedFile[],
  kind: "rules" | "crest",
) {
  if (
    Array.isArray(file) ||
    file.truncated ||
    file.size > (kind === "rules" ? 5 : 2) * 1024 * 1024
  )
    throw new SportError(
      400,
      kind === "rules"
        ? "Selecione um PDF de até 5 MB."
        : "Selecione uma imagem JPG ou PNG de até 2 MB.",
    );
  const pdf =
    file.mimetype === "application/pdf" &&
    file.data.subarray(0, 5).toString() === "%PDF-";
  const png =
    file.mimetype === "image/png" &&
    file.data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    file.mimetype === "image/jpeg" &&
    file.data[0] === 255 &&
    file.data[1] === 216 &&
    file.data[2] === 255;
  if (kind === "rules" ? !pdf : !png && !jpeg)
    throw new SportError(
      400,
      "O conteúdo do arquivo não corresponde ao formato permitido.",
    );
  return file;
}
export async function storeSportFile(
  req: Request,
  input: UploadedFile | UploadedFile[],
  kind: "rules" | "crest",
) {
  const file = validateSportFile(input, kind),
    extension =
      kind === "rules" ? "pdf" : file.mimetype === "image/png" ? "png" : "jpg";
  const name = `${kind}-${randomUUID()}.${extension}`;
  if (
    process.env.UPLOAD_STORAGE === "local" &&
    process.env.NODE_ENV !== "production"
  ) {
    const directory = path.join(process.cwd(), "uploads");
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, name);
    await writeFile(target, file.data);
    return {
      url: uploadUrl(req, name),
      remove: () => unlink(target).catch(() => {}),
    };
  }
  if (
    !process.env.CLOUDINARY_NAME ||
    !process.env.CLOUDINARY_KEY ||
    !process.env.CLOUDINARY_SECRET
  )
    throw new SportError(
      503,
      "Upload indisponível. Configure o serviço de imagens.",
    );
  const resource_type = kind === "rules" ? "raw" : "image";
  const saved = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) =>
      cloudinary.uploader
        .upload_stream(
          { folder: "uppoint/sports", resource_type, public_id: name },
          (error, result) =>
            error || !result
              ? reject(error ?? Error("Upload"))
              : resolve(result),
        )
        .end(file.data),
  );
  return {
    url: saved.secure_url,
    remove: async () => {
      await cloudinary.uploader
        .destroy(saved.public_id, { resource_type })
        .catch(() => {});
    },
  };
}
