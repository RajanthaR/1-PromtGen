import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type PromptGenDatabase = PostgresJsDatabase<typeof schema>;

export function createSqlClient(databaseUrl: string): postgres.Sql {
  return postgres(databaseUrl, {
    max: 5,
    onnotice: () => undefined,
    prepare: false,
  });
}

export function createDb(databaseUrlOrSql: string | postgres.Sql): PromptGenDatabase {
  const sql =
    typeof databaseUrlOrSql === "string" ? createSqlClient(databaseUrlOrSql) : databaseUrlOrSql;

  return drizzle(sql, { schema });
}
