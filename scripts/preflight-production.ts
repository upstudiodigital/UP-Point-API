import "dotenv/config";
const failures: string[] = [];
function required(name: string) {
  if (!process.env[name]?.trim())
    failures.push(`${name}: configuração ausente`);
}
for (const key of [
  "DATABASE_URL",
  "JWT_SECRET",
  "FRONTEND_ORIGINS",
  "FRONTEND_URL",
  "CLOUDINARY_NAME",
  "CLOUDINARY_KEY",
  "CLOUDINARY_SECRET",
  "SMTP_HOST",
  "SMTP_FROM",
  "FINANCE_EMAIL",
  "LEGAL_ENTITY_NAME",
  "LEGAL_ENTITY_DOCUMENT",
])
  required(key);
for (const name of ["FRONTEND_URL", "PUBLIC_API_URL"]) {
  try {
    if (new URL(process.env[name] || "").protocol !== "https:")
      failures.push(`${name}: exige HTTPS`);
  } catch {
    failures.push(`${name}: URL pública inválida`);
  }
}
if ((process.env.JWT_SECRET?.length ?? 0) < 32)
  failures.push("JWT_SECRET: mínimo 32 caracteres");
if (process.env.ENABLE_LEGACY_ROUTES === "true")
  failures.push("Rotas legadas devem continuar desativadas");
if (process.env.UPLOAD_STORAGE === "local")
  failures.push("Armazenamento local não é permitido em produção");
if (process.env.NODE_ENV !== "production")
  failures.push("NODE_ENV deve ser production");
for (const origin of (process.env.FRONTEND_ORIGINS ?? "")
  .split(",")
  .filter(Boolean)) {
  try {
    const url = new URL(origin.trim());
    if (
      url.protocol !== "https:" ||
      url.origin !== origin.trim() ||
      /localhost|127\.0\.0\.1/.test(url.hostname)
    )
      throw Error();
  } catch {
    failures.push(
      "FRONTEND_ORIGINS: origens HTTPS públicas exatas obrigatórias",
    );
  }
}
console.log("Pré-lançamento (pagamentos excluídos):");
if (failures.length) {
  for (const failure of failures) console.log(`PENDENTE: ${failure}`);
  process.exitCode = 1;
} else
  console.log(
    "Configuração básica presente. Ainda exige validação de serviços, backup e QA.",
  );


