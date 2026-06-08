import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import type { PromptGenDatabase } from "@promptgen/db";
import { folders, promptTags, promptVersions, prompts, tags } from "@promptgen/db/schema";

import type {
  ExportFormat,
  PromptExport,
  PromptFolder,
  PromptLibraryPort,
  PromptSearchQuery,
  PromptVersionSummary,
  SavedPromptDraft,
  SavedPromptEdit,
  SavedPromptSummary,
} from "./index";

const defaultRecoveryGraceDays = 30;

export type PromptLibraryErrorCode = "invalid_input" | "not_found" | "recovery_window_expired";

export class PromptLibraryError extends Error {
  constructor(
    public readonly code: PromptLibraryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PromptLibraryError";
  }
}

export class PostgresPromptLibraryStore implements PromptLibraryPort {
  constructor(
    private readonly db: PromptGenDatabase,
    private readonly options: { clock?: () => Date; recoveryGraceDays?: number } = {},
  ) {}

  async createFolder(userId: string, name: string): Promise<PromptFolder> {
    const normalizedName = normalizeRequiredText(name, "Folder name");
    const [folder] = await this.db
      .insert(folders)
      .values({ name: normalizedName, userId })
      .onConflictDoUpdate({
        set: { name: normalizedName },
        target: [folders.userId, folders.name],
      })
      .returning({
        createdAt: folders.createdAt,
        id: folders.id,
        name: folders.name,
        userId: folders.userId,
      });

    if (!folder) {
      throw new Error("Failed to create prompt folder.");
    }

    return folder;
  }

  async savePrompt(userId: string, draft: SavedPromptDraft): Promise<SavedPromptSummary> {
    const title = normalizeRequiredText(draft.title, "Prompt title");
    const body = normalizeRequiredText(draft.body, "Prompt body");
    const folderId = await this.resolveFolderId(userId, draft);

    const [prompt] = await this.db
      .insert(prompts)
      .values({
        ...(folderId ? { folderId } : {}),
        pinned: draft.pinned ?? false,
        title,
        userId,
      })
      .returning({ id: prompts.id });

    if (!prompt) {
      throw new Error("Failed to save prompt.");
    }

    const [version] = await this.db
      .insert(promptVersions)
      .values({
        body,
        changeNote: normalizeOptionalText(draft.changeNote),
        promptId: prompt.id,
        sections: draft.sections ?? {},
      })
      .returning({ id: promptVersions.id });

    if (!version) {
      throw new Error("Failed to save prompt version.");
    }

    await this.db
      .update(prompts)
      .set({ currentVersionId: version.id })
      .where(eq(prompts.id, prompt.id));
    await this.replacePromptTags(userId, prompt.id, draft.tags);

    return this.requirePromptSummary(userId, prompt.id);
  }

  async editPrompt(
    userId: string,
    promptId: string,
    edit: SavedPromptEdit,
  ): Promise<SavedPromptSummary> {
    const existing = await this.requireActivePrompt(userId, promptId);
    const title =
      edit.title === undefined ? existing.title : normalizeRequiredText(edit.title, "Prompt title");
    const body = normalizeRequiredText(edit.body, "Prompt body");
    const folderId = await this.resolveFolderId(userId, edit);
    const nextFolderId =
      edit.folderId === undefined && edit.folderName === undefined ? existing.folderId : folderId;

    const [version] = await this.db
      .insert(promptVersions)
      .values({
        body,
        changeNote: normalizeOptionalText(edit.changeNote),
        promptId,
        sections: edit.sections ?? {},
      })
      .returning({ id: promptVersions.id });

    if (!version) {
      throw new Error("Failed to save prompt edit.");
    }

    await this.db
      .update(prompts)
      .set({
        currentVersionId: version.id,
        folderId: nextFolderId,
        pinned: edit.pinned ?? existing.pinned,
        title,
      })
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)));

    if (edit.tags) {
      await this.replacePromptTags(userId, promptId, edit.tags);
    }

    return this.requirePromptSummary(userId, promptId);
  }

  async updatePromptOrganization(
    userId: string,
    promptId: string,
    input: { folderId?: string | null; folderName?: string; pinned?: boolean; tags?: string[] },
  ): Promise<SavedPromptSummary> {
    const existing = await this.requireActivePrompt(userId, promptId);
    const folderId = await this.resolveFolderId(userId, input);
    const nextFolderId =
      input.folderId === undefined && input.folderName === undefined ? existing.folderId : folderId;

    await this.db
      .update(prompts)
      .set({
        folderId: nextFolderId,
        pinned: input.pinned ?? existing.pinned,
      })
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)));

    if (input.tags) {
      await this.replacePromptTags(userId, promptId, input.tags);
    }

    return this.requirePromptSummary(userId, promptId);
  }

  async duplicatePrompt(
    userId: string,
    promptId: string,
    input: { title?: string; changeNote?: string } = {},
  ): Promise<SavedPromptSummary> {
    const source = await this.requirePromptSummary(userId, promptId);
    const current = await this.requireCurrentVersion(userId, promptId);

    return this.savePrompt(userId, {
      body: current.body,
      changeNote: normalizeOptionalText(input.changeNote) ?? `Duplicated from ${source.title}`,
      pinned: false,
      sections: current.sections,
      tags: source.tags,
      title: input.title ?? `${source.title} copy`,
      ...(source.folderId ? { folderId: source.folderId } : {}),
    });
  }

  async listSavedPrompts(userId: string): Promise<SavedPromptSummary[]> {
    const rows = await this.db
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.userId, userId), isNull(prompts.deletedAt)))
      .orderBy(desc(prompts.pinned), desc(prompts.createdAt));

    return Promise.all(rows.map((row) => this.requirePromptSummary(userId, row.id)));
  }

  async listPromptVersions(userId: string, promptId: string): Promise<PromptVersionSummary[]> {
    await this.requirePromptOwnedByUser(userId, promptId);

    const versions = await this.db
      .select({
        body: promptVersions.body,
        changeNote: promptVersions.changeNote,
        createdAt: promptVersions.createdAt,
        id: promptVersions.id,
        promptId: promptVersions.promptId,
        sections: promptVersions.sections,
      })
      .from(promptVersions)
      .where(eq(promptVersions.promptId, promptId))
      .orderBy(asc(promptVersions.createdAt), asc(promptVersions.id));

    return versions.map((version, index) => ({
      body: version.body,
      createdAt: version.createdAt,
      id: version.id,
      promptId: version.promptId,
      sections: toSections(version.sections),
      versionNumber: index + 1,
      ...(version.changeNote ? { changeNote: version.changeNote } : {}),
    }));
  }

  async restorePromptVersion(
    userId: string,
    promptId: string,
    versionId: string,
    changeNote?: string,
  ): Promise<SavedPromptSummary> {
    await this.requireActivePrompt(userId, promptId);
    const version = await this.requirePromptVersion(promptId, versionId);

    const [restored] = await this.db
      .insert(promptVersions)
      .values({
        body: version.body,
        changeNote: normalizeOptionalText(changeNote) ?? `Restored from version ${versionId}`,
        promptId,
        sections: version.sections,
      })
      .returning({ id: promptVersions.id });

    if (!restored) {
      throw new Error("Failed to restore prompt version.");
    }

    await this.db
      .update(prompts)
      .set({ currentVersionId: restored.id })
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)));

    return this.requirePromptSummary(userId, promptId);
  }

  async softDeletePrompt(userId: string, promptId: string): Promise<SavedPromptSummary> {
    await this.requireActivePrompt(userId, promptId);

    await this.db
      .update(prompts)
      .set({ deletedAt: this.now() })
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)));

    return this.requirePromptSummary(userId, promptId, { includeDeleted: true });
  }

  async recoverPrompt(userId: string, promptId: string): Promise<SavedPromptSummary> {
    const prompt = await this.requirePromptOwnedByUser(userId, promptId);

    if (!prompt.deletedAt) {
      return this.requirePromptSummary(userId, promptId);
    }

    if (prompt.deletedAt.getTime() < this.recoveryCutoff().getTime()) {
      throw new PromptLibraryError(
        "recovery_window_expired",
        "Prompt recovery grace period expired.",
      );
    }

    await this.db
      .update(prompts)
      .set({ deletedAt: null })
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId)));

    return this.requirePromptSummary(userId, promptId);
  }

  async searchSavedPrompts(
    userId: string,
    query: PromptSearchQuery,
  ): Promise<SavedPromptSummary[]> {
    const limit = query.limit ?? 20;
    const tagFilter = query.tag ? normalizeRequiredText(query.tag, "Tag") : undefined;
    const keyword = normalizeOptionalText(query.keyword);

    const rows = await this.db.execute<{ id: string }>(sql`
      SELECT p.id
      FROM prompts p
      JOIN prompt_versions pv ON pv.id = p.current_version_id
      LEFT JOIN prompt_tags pt ON pt.prompt_id = p.id
      LEFT JOIN tags t ON t.id = pt.tag_id
      WHERE p.user_id = ${userId}
        AND p.deleted_at IS NULL
        AND (${tagFilter ?? null}::text IS NULL OR t.name = ${tagFilter ?? null})
      GROUP BY p.id, p.title, pv.body, p.pinned, p.created_at
      HAVING (
        ${keyword ?? null}::text IS NULL
        OR to_tsvector(
          'english',
          p.title || ' ' || pv.body || ' ' || COALESCE(string_agg(t.name, ' '), '')
        ) @@ websearch_to_tsquery('english', ${keyword ?? ""})
      )
      ORDER BY p.pinned DESC,
        CASE
          WHEN ${keyword ?? null}::text IS NULL THEN 0
          ELSE ts_rank(
            to_tsvector(
              'english',
              p.title || ' ' || pv.body || ' ' || COALESCE(string_agg(t.name, ' '), '')
            ),
            websearch_to_tsquery('english', ${keyword ?? ""})
          )
        END DESC,
        p.created_at DESC
      LIMIT ${limit}
    `);

    return Promise.all(rows.map((row) => this.requirePromptSummary(userId, row.id)));
  }

  async exportPrompt(
    userId: string,
    promptId: string,
    format: ExportFormat,
  ): Promise<PromptExport> {
    const prompt = await this.requirePromptSummary(userId, promptId);
    const current = await this.requireCurrentVersion(userId, promptId);

    if (format === "json") {
      return {
        content: JSON.stringify(
          {
            body: current.body,
            changeNote: current.changeNote,
            folderId: prompt.folderId,
            id: prompt.id,
            pinned: prompt.pinned,
            sections: current.sections,
            tags: prompt.tags,
            title: prompt.title,
            versionId: current.id,
          },
          null,
          2,
        ),
        contentType: "application/json",
        filename: `${slugify(prompt.title)}.json`,
        format,
      };
    }

    return {
      content: renderMarkdownExport(prompt, current),
      contentType: "text/markdown",
      filename: `${slugify(prompt.title)}.md`,
      format,
    };
  }

  private async requirePromptSummary(
    userId: string,
    promptId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<SavedPromptSummary> {
    const where = options.includeDeleted
      ? and(eq(prompts.id, promptId), eq(prompts.userId, userId))
      : and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt));
    const [prompt] = await this.db
      .select({
        createdAt: prompts.createdAt,
        currentVersionId: prompts.currentVersionId,
        deletedAt: prompts.deletedAt,
        folderId: prompts.folderId,
        id: prompts.id,
        pinned: prompts.pinned,
        title: prompts.title,
        userId: prompts.userId,
      })
      .from(prompts)
      .where(where);

    if (!prompt?.currentVersionId) {
      throw new PromptLibraryError("not_found", `Prompt ${promptId} was not found.`);
    }

    const promptTagRows = await this.db
      .select({ name: tags.name })
      .from(promptTags)
      .innerJoin(tags, eq(promptTags.tagId, tags.id))
      .where(eq(promptTags.promptId, promptId))
      .orderBy(asc(tags.name));

    return {
      createdAt: prompt.createdAt,
      id: prompt.id,
      latestVersionId: prompt.currentVersionId,
      pinned: prompt.pinned,
      tags: promptTagRows.map((row) => row.name),
      title: prompt.title,
      userId: prompt.userId,
      ...(prompt.folderId ? { folderId: prompt.folderId } : {}),
      ...(prompt.deletedAt ? { deletedAt: prompt.deletedAt } : {}),
    };
  }

  private async requireActivePrompt(
    userId: string,
    promptId: string,
  ): Promise<{
    folderId: string | null;
    id: string;
    pinned: boolean;
    title: string;
  }> {
    const [prompt] = await this.db
      .select({
        folderId: prompts.folderId,
        id: prompts.id,
        pinned: prompts.pinned,
        title: prompts.title,
      })
      .from(prompts)
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)));

    if (!prompt) {
      throw new PromptLibraryError("not_found", `Prompt ${promptId} was not found.`);
    }

    return prompt;
  }

  private async requirePromptOwnedByUser(
    userId: string,
    promptId: string,
  ): Promise<{
    deletedAt: Date | null;
    id: string;
  }> {
    const [prompt] = await this.db
      .select({ deletedAt: prompts.deletedAt, id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId)));

    if (!prompt) {
      throw new PromptLibraryError("not_found", `Prompt ${promptId} was not found.`);
    }

    return prompt;
  }

  private async requireCurrentVersion(
    userId: string,
    promptId: string,
  ): Promise<{
    body: string;
    changeNote?: string;
    id: string;
    sections: Record<string, unknown>;
  }> {
    const prompt = await this.requirePromptSummary(userId, promptId);
    return this.requirePromptVersion(promptId, prompt.latestVersionId);
  }

  private async requirePromptVersion(
    promptId: string,
    versionId: string,
  ): Promise<{
    body: string;
    changeNote?: string;
    id: string;
    sections: Record<string, unknown>;
  }> {
    const [version] = await this.db
      .select({
        body: promptVersions.body,
        changeNote: promptVersions.changeNote,
        id: promptVersions.id,
        sections: promptVersions.sections,
      })
      .from(promptVersions)
      .where(and(eq(promptVersions.id, versionId), eq(promptVersions.promptId, promptId)));

    if (!version) {
      throw new PromptLibraryError("not_found", `Prompt version ${versionId} was not found.`);
    }

    return {
      body: version.body,
      id: version.id,
      sections: toSections(version.sections),
      ...(version.changeNote ? { changeNote: version.changeNote } : {}),
    };
  }

  private async replacePromptTags(
    userId: string,
    promptId: string,
    rawTags: string[],
  ): Promise<void> {
    const names = normalizeTags(rawTags);
    await this.db.delete(promptTags).where(eq(promptTags.promptId, promptId));

    if (names.length === 0) {
      return;
    }

    const tagRows = await Promise.all(names.map((name) => this.upsertTag(userId, name)));
    await this.db
      .insert(promptTags)
      .values(tagRows.map((tag) => ({ promptId, tagId: tag.id })))
      .onConflictDoNothing();
  }

  private async upsertTag(userId: string, name: string): Promise<{ id: string; name: string }> {
    const [tag] = await this.db
      .insert(tags)
      .values({ name, userId })
      .onConflictDoUpdate({
        set: { name },
        target: [tags.userId, tags.name],
      })
      .returning({ id: tags.id, name: tags.name });

    if (!tag) {
      throw new Error("Failed to create prompt tag.");
    }

    return tag;
  }

  private async resolveFolderId(
    userId: string,
    input: { folderId?: string | null; folderName?: string },
  ): Promise<string | null> {
    if (input.folderName !== undefined) {
      const folder = await this.createFolder(userId, input.folderName);
      return folder.id;
    }

    if (input.folderId === undefined || input.folderId === null) {
      return null;
    }

    const [folder] = await this.db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, input.folderId), eq(folders.userId, userId)));

    if (!folder) {
      throw new PromptLibraryError("not_found", `Folder ${input.folderId} was not found.`);
    }

    return folder.id;
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }

  private recoveryCutoff(): Date {
    const graceDays = this.options.recoveryGraceDays ?? defaultRecoveryGraceDays;
    return new Date(this.now().getTime() - graceDays * 24 * 60 * 60 * 1000);
  }
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new PromptLibraryError("invalid_input", `${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeTags(rawTags: string[]): string[] {
  return [...new Set(rawTags.map((tag) => tag.trim()).filter(Boolean))].sort();
}

function toSections(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "prompt";
}

function renderMarkdownExport(
  prompt: SavedPromptSummary,
  version: { body: string; changeNote?: string },
): string {
  const lines = [
    `# ${prompt.title}`,
    "",
    `Prompt ID: ${prompt.id}`,
    `Version ID: ${prompt.latestVersionId}`,
    `Tags: ${prompt.tags.length > 0 ? prompt.tags.join(", ") : "none"}`,
    `Pinned: ${prompt.pinned ? "yes" : "no"}`,
  ];

  if (prompt.folderId) {
    lines.push(`Folder ID: ${prompt.folderId}`);
  }

  if (version.changeNote) {
    lines.push(`Change note: ${version.changeNote}`);
  }

  lines.push("", "## Prompt", "", version.body, "");

  return lines.join("\n");
}
