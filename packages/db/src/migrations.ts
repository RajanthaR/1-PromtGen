import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type postgres from "postgres";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(packageRoot, "migrations");
const migrationsAdvisoryLockId = 7_230_519;

export async function applyMigrations(sql: postgres.Sql): Promise<string[]> {
  await sql`SELECT pg_advisory_lock(${migrationsAdvisoryLockId})`;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle_migrations (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const appliedRows = await sql<{ name: string }[]>`SELECT name FROM drizzle_migrations`;
    const applied = new Set(appliedRows.map((row) => row.name));
    const appliedNow: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const migration = await fs.readFile(path.join(migrationsDirectory, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(migration);
        await tx`INSERT INTO drizzle_migrations (name) VALUES (${file})`;
      });
      appliedNow.push(file);
    }

    return appliedNow;
  } finally {
    await sql`SELECT pg_advisory_unlock(${migrationsAdvisoryLockId})`;
  }
}

export async function resetPublicSchema(sql: postgres.Sql): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
}
