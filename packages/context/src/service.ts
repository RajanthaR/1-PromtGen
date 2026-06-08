import { randomUUID } from "node:crypto";

import type {
  ContextPort,
  ContextSnippet,
  ContextSnippetDraft,
  ContextSnippetKind,
  SelectedContextSnippet,
} from "./index";

export type ContextLibraryErrorCode = "invalid_input" | "not_found";

export class ContextLibraryError extends Error {
  constructor(
    public readonly code: ContextLibraryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContextLibraryError";
  }
}

export interface ContextStore {
  createSnippet(snippet: ContextSnippet): Promise<ContextSnippet>;
  deleteSnippet(userId: string, snippetId: string): Promise<boolean>;
  findSnippet(userId: string, snippetId: string): Promise<ContextSnippet | null>;
  listSnippets(userId: string): Promise<ContextSnippet[]>;
  updateSnippet(
    userId: string,
    snippetId: string,
    draft: NormalizedContextSnippetDraft,
    updatedAt: Date,
  ): Promise<ContextSnippet | null>;
}

export interface ContextServiceOptions {
  clock?: () => Date;
  idGenerator?: () => string;
}

interface NormalizedContextSnippetDraft {
  title: string;
  body: string;
  kind: ContextSnippetKind;
  tags: string[];
}

const contextSnippetKinds = new Set<ContextSnippetKind>([
  "brand_voice",
  "product",
  "audience",
  "coding_stack",
  "other",
]);

export function createContextService(
  store: ContextStore,
  options: ContextServiceOptions = {},
): ContextPort {
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? randomUUID;

  return {
    async createSnippet(userId, draft) {
      const normalizedUserId = normalizeUserId(userId);
      const normalizedDraft = normalizeDraft(draft);
      const now = clock();

      return store.createSnippet({
        ...normalizedDraft,
        createdAt: now,
        id: idGenerator(),
        updatedAt: now,
        userId: normalizedUserId,
      });
    },

    async updateSnippet(userId, snippetId, draft) {
      const normalizedUserId = normalizeUserId(userId);
      const normalizedSnippetId = normalizeSnippetId(snippetId);
      const updated = await store.updateSnippet(
        normalizedUserId,
        normalizedSnippetId,
        normalizeDraft(draft),
        clock(),
      );

      if (!updated) {
        throw new ContextLibraryError("not_found", "Context snippet was not found.");
      }

      return updated;
    },

    async deleteSnippet(userId, snippetId) {
      const deleted = await store.deleteSnippet(
        normalizeUserId(userId),
        normalizeSnippetId(snippetId),
      );

      if (!deleted) {
        throw new ContextLibraryError("not_found", "Context snippet was not found.");
      }
    },

    async listSnippets(userId) {
      return store.listSnippets(normalizeUserId(userId));
    },

    async listSelectedSnippets(userId, snippetIds) {
      const normalizedUserId = normalizeUserId(userId);
      const selectedIds = normalizeSelectedIds(snippetIds);
      const selected: SelectedContextSnippet[] = [];

      for (const snippetId of selectedIds) {
        const snippet = await store.findSnippet(normalizedUserId, snippetId);

        if (!snippet) {
          throw new ContextLibraryError("not_found", "Selected context snippet was not found.");
        }

        selected.push({
          body: snippet.body,
          id: snippet.id,
          title: snippet.title,
        });
      }

      return selected;
    },
  };
}

function normalizeDraft(draft: ContextSnippetDraft): NormalizedContextSnippetDraft {
  const title = draft.title.trim();
  const body = draft.body.trim();

  if (!title) {
    throw new ContextLibraryError("invalid_input", "Context snippet title is required.");
  }

  if (!body) {
    throw new ContextLibraryError("invalid_input", "Context snippet body is required.");
  }

  if (!contextSnippetKinds.has(draft.kind)) {
    throw new ContextLibraryError("invalid_input", "Context snippet kind is invalid.");
  }

  return {
    body,
    kind: draft.kind,
    tags: normalizeTags(draft.tags),
    title,
  };
}

function normalizeTags(tags: string[]): string[] {
  const normalized = tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);

  return Array.from(new Set(normalized));
}

function normalizeUserId(userId: string): string {
  const normalized = userId.trim();

  if (!normalized) {
    throw new ContextLibraryError("invalid_input", "userId is required.");
  }

  return normalized;
}

function normalizeSnippetId(snippetId: string): string {
  const normalized = snippetId.trim();

  if (!normalized) {
    throw new ContextLibraryError("invalid_input", "snippetId is required.");
  }

  return normalized;
}

function normalizeSelectedIds(snippetIds: string[]): string[] {
  const normalizedIds = snippetIds.map(normalizeSnippetId);

  return Array.from(new Set(normalizedIds));
}
