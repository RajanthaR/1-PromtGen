export type ContextSnippetKind = "brand_voice" | "product" | "audience" | "coding_stack" | "other";

export interface ContextSnippetDraft {
  title: string;
  body: string;
  kind: ContextSnippetKind;
  tags: string[];
}

export interface ContextSnippet {
  id: string;
  userId: string;
  title: string;
  body: string;
  kind: ContextSnippetKind;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SelectedContextSnippet {
  id: string;
  title: string;
  body: string;
}

export interface ContextPort {
  createSnippet(userId: string, draft: ContextSnippetDraft): Promise<ContextSnippet>;
  updateSnippet(
    userId: string,
    snippetId: string,
    draft: ContextSnippetDraft,
  ): Promise<ContextSnippet>;
  deleteSnippet(userId: string, snippetId: string): Promise<void>;
  listSnippets(userId: string): Promise<ContextSnippet[]>;
  listSelectedSnippets(userId: string, snippetIds: string[]): Promise<SelectedContextSnippet[]>;
}

export { InMemoryContextStore } from "./in-memory-store";
export { ContextLibraryError, createContextService, type ContextStore } from "./service";
