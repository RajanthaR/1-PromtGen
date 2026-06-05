import { loadPromptGenEnv } from "@promptgen/config/env";

import { createSqlClient } from "../src/client";
import { applyMigrations, resetPublicSchema } from "../src/migrations";

const env = loadPromptGenEnv();

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required to reset the database.");
}

if (env.nodeEnv === "production") {
  throw new Error("Refusing to reset the database while NODE_ENV=production.");
}

const sql = createSqlClient(env.databaseUrl);

try {
  await resetPublicSchema(sql);
  const applied = await applyMigrations(sql);
  console.log(`Reset database and applied migrations: ${applied.join(", ")}`);
} finally {
  await sql.end();
}
