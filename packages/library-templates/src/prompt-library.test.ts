import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, createDb, createSqlClient, resetPublicSchema } from "@promptgen/db";
import { createTestUser } from "@promptgen/db/test-helpers";

import { PostgresPromptLibraryStore, type PromptLibraryError } from "./prompt-library";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const databaseTestTimeoutMs = 15_000;
const openSqlClients: Array<ReturnType<typeof createSqlClient>> = [];

afterEach(async () => {
  await Promise.all(openSqlClients.splice(0).map((sql) => sql.end()));
});

describeWithDatabase("PostgresPromptLibraryStore", () => {
  it(
    "restores an old version by copying it forward without destroying newer versions",
    async () => {
      const { db, store } = await createPromptLibraryHarness();
      const user = await createTestUser(db);

      const saved = await store.savePrompt(user.id, {
        body: "Draft a compact onboarding prompt.",
        changeNote: "Initial save",
        tags: ["onboarding"],
        title: "Onboarding prompt",
      });
      const edited = await store.editPrompt(user.id, saved.id, {
        body: "Draft a detailed onboarding prompt with success criteria.",
        changeNote: "Expanded guidance",
        title: "Onboarding prompt",
      });

      const beforeRestore = await store.listPromptVersions(user.id, saved.id);
      await store.restorePromptVersion(
        user.id,
        saved.id,
        beforeRestore[0]?.id ?? "",
        "Restore compact version",
      );
      const afterRestore = await store.listPromptVersions(user.id, saved.id);

      expect(beforeRestore.map((version) => version.body)).toEqual([
        "Draft a compact onboarding prompt.",
        "Draft a detailed onboarding prompt with success criteria.",
      ]);
      expect(afterRestore.map((version) => version.body)).toEqual([
        "Draft a compact onboarding prompt.",
        "Draft a detailed onboarding prompt with success criteria.",
        "Draft a compact onboarding prompt.",
      ]);
      expect(afterRestore.map((version) => version.id)).toContain(edited.latestVersionId);
      expect(afterRestore.at(-1)?.id).not.toBe(beforeRestore[0]?.id);
    },
    databaseTestTimeoutMs,
  );

  it(
    "recovers soft-deleted prompts during the grace period",
    async () => {
      const { db, store } = await createPromptLibraryHarness();
      const user = await createTestUser(db);
      const saved = await store.savePrompt(user.id, {
        body: "Prepare a renewal reminder.",
        tags: ["lifecycle"],
        title: "Renewal reminder",
      });

      const deleted = await store.softDeletePrompt(user.id, saved.id);
      await expect(store.listSavedPrompts(user.id)).resolves.toEqual([]);
      const recovered = await store.recoverPrompt(user.id, saved.id);

      expect(deleted.deletedAt).toBeInstanceOf(Date);
      expect(recovered.deletedAt).toBeUndefined();
      await expect(store.listSavedPrompts(user.id)).resolves.toEqual([
        expect.objectContaining({ id: saved.id, title: "Renewal reminder" }),
      ]);
    },
    databaseTestTimeoutMs,
  );

  it(
    "rejects recovery after the grace period without hard-deleting prompt data",
    async () => {
      const { db, sql } = await createPromptLibraryHarness();
      const now = new Date("2026-06-07T00:00:00.000Z");
      const store = new PostgresPromptLibraryStore(db, { clock: () => now, recoveryGraceDays: 30 });
      const user = await createTestUser(db);
      const saved = await store.savePrompt(user.id, {
        body: "Prepare a recovery-window test.",
        tags: ["retention"],
        title: "Recovery window",
      });

      await store.softDeletePrompt(user.id, saved.id);
      const laterStore = new PostgresPromptLibraryStore(db, {
        clock: () => new Date("2026-07-08T00:00:00.000Z"),
        recoveryGraceDays: 30,
      });

      await expect(laterStore.recoverPrompt(user.id, saved.id)).rejects.toMatchObject({
        code: "recovery_window_expired",
      } satisfies Partial<PromptLibraryError>);
      await expect(
        sql<
          { count: string }[]
        >`SELECT count(*) FROM prompt_versions WHERE prompt_id = ${saved.id}`,
      ).resolves.toEqual([{ count: "1" }]);
    },
    databaseTestTimeoutMs,
  );

  it(
    "uses Postgres full-text search over prompt title, current body, and tags",
    async () => {
      const { db, store } = await createPromptLibraryHarness();
      const user = await createTestUser(db);
      const otherUser = await createTestUser(db);

      const match = await store.savePrompt(user.id, {
        body: "Create a staged migration rollout plan with owner checkpoints.",
        tags: ["delivery", "postgres"],
        title: "Database release plan",
      });
      await store.savePrompt(user.id, {
        body: "Write three social posts about a product launch.",
        tags: ["social"],
        title: "Launch posts",
      });
      await store.savePrompt(otherUser.id, {
        body: "Create a staged migration rollout plan for another account.",
        tags: ["delivery"],
        title: "Private migration plan",
      });

      await expect(
        store.searchSavedPrompts(user.id, { keyword: "migration rollout" }),
      ).resolves.toEqual([
        expect.objectContaining({ id: match.id, title: "Database release plan" }),
      ]);
      await expect(store.searchSavedPrompts(user.id, { keyword: "postgres" })).resolves.toEqual([
        expect.objectContaining({ id: match.id }),
      ]);
      await expect(store.searchSavedPrompts(user.id, { tag: "social" })).resolves.toEqual([
        expect.objectContaining({ title: "Launch posts" }),
      ]);
    },
    databaseTestTimeoutMs,
  );

  it(
    "duplicates, organizes, and exports saved prompts as Markdown and JSON",
    async () => {
      const { db, store } = await createPromptLibraryHarness();
      const user = await createTestUser(db);
      const saved = await store.savePrompt(user.id, {
        body: "Summarize meeting notes in bullets.",
        folderName: "Operations",
        pinned: true,
        sections: { format: "bullets" },
        tags: ["meetings"],
        title: "Meeting summary",
      });

      const organized = await store.updatePromptOrganization(user.id, saved.id, {
        folderId: null,
        pinned: false,
        tags: ["meetings", "summary"],
      });
      const duplicate = await store.duplicatePrompt(user.id, saved.id, {
        title: "Meeting summary copy",
      });
      const markdown = await store.exportPrompt(user.id, saved.id, "markdown");
      const json = await store.exportPrompt(user.id, saved.id, "json");

      expect(organized.folderId).toBeUndefined();
      expect(organized).toMatchObject({ pinned: false, tags: ["meetings", "summary"] });
      expect(duplicate).toMatchObject({
        pinned: false,
        tags: ["meetings", "summary"],
        title: "Meeting summary copy",
      });
      expect(markdown).toMatchObject({
        contentType: "text/markdown",
        filename: "meeting-summary.md",
        format: "markdown",
      });
      expect(markdown.content).toContain("## Prompt\n\nSummarize meeting notes in bullets.");
      expect(JSON.parse(json.content)).toMatchObject({
        body: "Summarize meeting notes in bullets.",
        pinned: false,
        sections: { format: "bullets" },
        tags: ["meetings", "summary"],
        title: "Meeting summary",
      });
    },
    databaseTestTimeoutMs,
  );
});

async function createPromptLibraryHarness(): Promise<{
  db: ReturnType<typeof createDb>;
  sql: ReturnType<typeof createSqlClient>;
  store: PostgresPromptLibraryStore;
}> {
  const sql = createSqlClient(requireDatabaseUrl());
  openSqlClients.push(sql);
  const db = createDb(sql);
  await resetPublicSchema(sql);
  await applyMigrations(sql);

  return {
    db,
    sql,
    store: new PostgresPromptLibraryStore(db),
  };
}

function requireDatabaseUrl(): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for prompt library database tests.");
  }

  return databaseUrl;
}
