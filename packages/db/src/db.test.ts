import { describe, expect, it } from "vitest";

import { createDb, createSqlClient } from "./client";
import { applyMigrations, resetPublicSchema } from "./migrations";
import { searchContextSnippets, searchPrompts, searchTemplates } from "./search";
import {
  createContextSnippetFixture,
  createPromptFixture,
  createTemplateFixture,
  createTestUser,
} from "./test-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("db migrations and full-text search", () => {
  it("applies migrations on a fresh database", async () => {
    const sql = createSqlClient(requireDatabaseUrl());

    try {
      await resetPublicSchema(sql);
      const applied = await applyMigrations(sql);
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;

      expect(applied).toEqual(["0000_phase_1_data_layer.sql", "0001_phase_6_billing_privacy.sql"]);
      expect(tables.map((table) => table.table_name)).toEqual(
        expect.arrayContaining([
          "context_snippets",
          "folders",
          "operations",
          "prompt_tags",
          "prompt_versions",
          "prompts",
          "sessions",
          "tags",
          "templates",
          "user_billing_settings",
          "usage_events",
          "users",
        ]),
      );
    } finally {
      await sql.end();
    }
  });

  it("returns expected rows from Postgres full-text search", async () => {
    const sql = createSqlClient(requireDatabaseUrl());
    const db = createDb(sql);

    try {
      await resetPublicSchema(sql);
      await applyMigrations(sql);

      const user = await createTestUser(db, { email: "fts-user@example.test" });
      const otherUser = await createTestUser(db, { email: "other-fts-user@example.test" });

      await createPromptFixture(db, {
        body: "Write an onboarding email sequence for new product users.",
        title: "SaaS onboarding email",
        userId: user.id,
      });
      await createPromptFixture(db, {
        body: "Unrelated prompt for another user.",
        title: "SaaS onboarding email",
        userId: otherUser.id,
      });
      await createContextSnippetFixture(db, {
        body: "Use a calm, practical voice for security incident updates.",
        title: "Security incident voice",
        userId: user.id,
      });
      await createTemplateFixture(db, {
        body: "Create a launch plan with positioning, channels, and success metrics.",
        tags: ["launch", "marketing"],
        title: "Launch plan",
      });

      await expect(
        searchPrompts(db, { query: "onboarding email", userId: user.id }),
      ).resolves.toEqual([expect.objectContaining({ title: "SaaS onboarding email" })]);
      await expect(
        searchPrompts(db, { query: "onboarding email", userId: otherUser.id }),
      ).resolves.toHaveLength(1);
      await expect(
        searchContextSnippets(db, { query: "security incident", userId: user.id }),
      ).resolves.toEqual([expect.objectContaining({ title: "Security incident voice" })]);
      await expect(searchTemplates(db, { query: "launch metrics" })).resolves.toEqual([
        expect.objectContaining({ title: "Launch plan" }),
      ]);
    } finally {
      await sql.end();
    }
  });
});

function requireDatabaseUrl(): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database tests.");
  }

  return databaseUrl;
}
