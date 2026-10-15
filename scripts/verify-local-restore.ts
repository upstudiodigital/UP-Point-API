import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
async function main() {
  const source = new URL(process.env.DATABASE_URL || "");
  if (
    source.hostname !== "127.0.0.1" ||
    source.port !== "5434" ||
    source.pathname !== "/uppoint_dev"
  )
    throw Error("Teste restrito ao banco local uppoint_dev:5434.");
  const bin = process.argv[2];
  if (!bin) throw Error("Informe a pasta dos binários PostgreSQL.");
  const name = `uppoint_restore_${randomUUID().replaceAll("-", "")}`;
  const folder = path.resolve("../.local/backups");
  await mkdir(folder, { recursive: true });
  const backup = path.join(folder, `${name}.dump`);
  const env = {
    ...process.env,
    PGHOST: source.hostname,
    PGPORT: source.port,
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
    PGDATABASE: "uppoint_dev",
  };
  async function run(
    command: string,
    args: string[],
    database = "uppoint_dev",
  ) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        path.join(bin, command + (process.platform === "win32" ? ".exe" : "")),
        args,
        {
          env: { ...env, PGDATABASE: database },
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      child.stderr.on("data", () => {});
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(Error(`${command} falhou`)),
      );
    });
  }
  const original = new PrismaClient();
  let clone: PrismaClient | undefined,
    created = false;
  try {
    const users = await original.users.count(),
      events = await original.events.count();
    await run("pg_dump", ["-Fc", "--no-owner", "--no-acl", "-f", backup]);
    await original.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", name, backup],
      name,
    );
    const restored = new URL(source);
    restored.pathname = `/${name}`;
    clone = new PrismaClient({ datasources: { db: { url: restored.href } } });
    if (
      (await clone.users.count()) !== users ||
      (await clone.events.count()) !== events
    )
      throw Error("Contagens restauradas divergentes.");
    console.log(
      JSON.stringify({
        backupCreated: true,
        restored: true,
        users,
        events,
        sourcePreserved: true,
        testDatabaseRemoved: true,
      }),
    );
  } finally {
    await clone?.$disconnect();
    if (created && /^uppoint_restore_[a-f0-9]{32}$/.test(name))
      await original.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await original.$disconnect();
  }
}
void main().catch(() => {
  console.error("Restauração de teste não concluída.");
  process.exitCode = 1;
});
