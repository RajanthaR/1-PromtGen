import type { ContextSnippet } from "./index";
import type { ContextStore } from "./service";

export class InMemoryContextStore implements ContextStore {
  private readonly snippets = new Map<string, ContextSnippet>();

  async createSnippet(snippet: ContextSnippet): Promise<ContextSnippet> {
    const stored = cloneSnippet(snippet);

    this.snippets.set(stored.id, stored);
    return cloneSnippet(stored);
  }

  async deleteSnippet(userId: string, snippetId: string): Promise<boolean> {
    const existing = this.snippets.get(snippetId);

    if (!existing || existing.userId !== userId) {
      return false;
    }

    return this.snippets.delete(snippetId);
  }

  async findSnippet(userId: string, snippetId: string): Promise<ContextSnippet | null> {
    const snippet = this.snippets.get(snippetId);

    return snippet && snippet.userId === userId ? cloneSnippet(snippet) : null;
  }

  async listSnippets(userId: string): Promise<ContextSnippet[]> {
    return Array.from(this.snippets.values())
      .filter((snippet) => snippet.userId === userId)
      .sort((left, right) => left.title.localeCompare(right.title))
      .map(cloneSnippet);
  }

  async updateSnippet(
    userId: string,
    snippetId: string,
    draft: Pick<ContextSnippet, "body" | "kind" | "tags" | "title">,
    updatedAt: Date,
  ): Promise<ContextSnippet | null> {
    const existing = this.snippets.get(snippetId);

    if (!existing || existing.userId !== userId) {
      return null;
    }

    const updated: ContextSnippet = {
      ...existing,
      ...draft,
      updatedAt,
    };

    this.snippets.set(snippetId, cloneSnippet(updated));
    return cloneSnippet(updated);
  }

  seed(snippet: ContextSnippet): void {
    this.snippets.set(snippet.id, cloneSnippet(snippet));
  }
}

function cloneSnippet(snippet: ContextSnippet): ContextSnippet {
  return {
    ...snippet,
    createdAt: new Date(snippet.createdAt),
    tags: [...snippet.tags],
    updatedAt: new Date(snippet.updatedAt),
  };
}
