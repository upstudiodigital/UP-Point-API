import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
async function main() {
  const output = process.argv[2];
  if (!output || !process.env.DATABASE_URL)
    throw Error("Informe o destino do backup e DATABASE_URL.");
  const db = new URL(process.env.DATABASE_URL);
  const env = {
    ...process.env,
    PGHOST: db.hostname,
    PGPORT: db.port || "5432",
    PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password),
    PGDATABASE: db.pathname.slice(1),
  };
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const executable = process.env.PG_DUMP_PATH || "pg_dump";
  const result = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        path.resolve(output),
      ],
      { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    child.on("error", reject);
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (result)
    throw Error(
      "Backup falhou. Verifique conectividade, permissões e ferramenta pg_dump.",
    );
  console.log(
    "Backup concluído. Guarde-o em armazenamento privado e teste a restauração.",
  );
}
void main().catch(() => {
  console.error("Backup não concluído.");
  process.exitCode = 1;
});
