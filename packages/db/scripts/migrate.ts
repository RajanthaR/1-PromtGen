import { loadPromptGenEnv } from "@promptgen/config/env";

import { createSqlClient } from "../src/client";
import { applyMigrations } from "../src/migrations";

const env = loadPromptGenEnv();

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const sql = createSqlClient(env.databaseUrl);

try {
  const applied = await applyMigrations(sql);
  console.log(
    applied.length > 0 ? `Applied migrations: ${applied.join(", ")}` : "No pending migrations.",
  );
} finally {
  await sql.end();
}
