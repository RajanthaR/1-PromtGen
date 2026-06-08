import type {
  ContextSnippet,
  ContextSnippetDraft,
  LibraryFilters,
  LibraryPrompt,
  PromptHistoryEntry,
  PromptTemplate,
  TemplateFilters,
  TemplateGenerationResult,
} from "./reuse-models";

export interface ReuseApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export const reuseApiContracts = [
  "GET /library/prompts?query&folder&tag&includeDeleted",
  "POST /library/prompts",
  "PATCH /library/prompts/:promptId",
  "POST /library/prompts/:promptId/duplicate",
  "POST /library/prompts/:promptId/versions/:versionId/restore",
  "DELETE /library/prompts/:promptId",
  "POST /library/prompts/:promptId/restore",
  "GET /history/prompts",
  "DELETE /history/prompts/:entryId",
  "GET /context/snippets",
  "POST /context/snippets",
  "PATCH /context/snippets/:snippetId",
  "DELETE /context/snippets/:snippetId",
  "GET /templates?query&tag&tool&difficulty&recentOnly",
  "POST /templates/:templateId/fill",
];

export function createReuseApiClient(options: ReuseApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    deleteContextSnippet(snippetId: string): Promise<void> {
      return requestJson<void>(fetchImpl, `${baseUrl}/context/snippets/${snippetId}`, {
        method: "DELETE",
      });
    },
    deleteHistoryEntry(entryId: string): Promise<void> {
      return requestJson<void>(fetchImpl, `${baseUrl}/history/prompts/${entryId}`, {
        method: "DELETE",
      });
    },
    deleteLibraryPrompt(promptId: string): Promise<void> {
      return requestJson<void>(fetchImpl, `${baseUrl}/library/prompts/${promptId}`, {
        method: "DELETE",
      });
    },
    duplicateLibraryPrompt(promptId: string): Promise<LibraryPrompt> {
      return requestJson<LibraryPrompt>(
        fetchImpl,
        `${baseUrl}/library/prompts/${promptId}/duplicate`,
        {
          method: "POST",
        },
      );
    },
    fillTemplate(
      templateId: string,
      values: Record<string, string>,
    ): Promise<TemplateGenerationResult> {
      return requestJson<TemplateGenerationResult>(
        fetchImpl,
        `${baseUrl}/templates/${templateId}/fill`,
        {
          body: JSON.stringify({ values }),
          method: "POST",
        },
      );
    },
    listContextSnippets(): Promise<ContextSnippet[]> {
      return requestJson<ContextSnippet[]>(fetchImpl, `${baseUrl}/context/snippets`);
    },
    listHistory(): Promise<PromptHistoryEntry[]> {
      return requestJson<PromptHistoryEntry[]>(fetchImpl, `${baseUrl}/history/prompts`);
    },
    listLibraryPrompts(filters: LibraryFilters): Promise<LibraryPrompt[]> {
      return requestJson<LibraryPrompt[]>(
        fetchImpl,
        `${baseUrl}/library/prompts?${libraryQuery(filters).toString()}`,
      );
    },
    listTemplates(filters: TemplateFilters): Promise<PromptTemplate[]> {
      return requestJson<PromptTemplate[]>(
        fetchImpl,
        `${baseUrl}/templates?${templateQuery(filters).toString()}`,
      );
    },
    restoreLibraryPrompt(promptId: string): Promise<LibraryPrompt> {
      return requestJson<LibraryPrompt>(
        fetchImpl,
        `${baseUrl}/library/prompts/${promptId}/restore`,
        {
          method: "POST",
        },
      );
    },
    restoreLibraryPromptVersion(promptId: string, versionId: string): Promise<LibraryPrompt> {
      return requestJson<LibraryPrompt>(
        fetchImpl,
        `${baseUrl}/library/prompts/${promptId}/versions/${versionId}/restore`,
        {
          method: "POST",
        },
      );
    },
    saveContextSnippet(draft: ContextSnippetDraft): Promise<ContextSnippet> {
      return requestJson<ContextSnippet>(fetchImpl, `${baseUrl}/context/snippets`, {
        body: JSON.stringify(draft),
        method: "POST",
      });
    },
    saveLibraryPrompt(prompt: LibraryPrompt): Promise<LibraryPrompt> {
      return requestJson<LibraryPrompt>(fetchImpl, `${baseUrl}/library/prompts`, {
        body: JSON.stringify(prompt),
        method: "POST",
      });
    },
    updateContextSnippet(snippetId: string, draft: ContextSnippetDraft): Promise<ContextSnippet> {
      return requestJson<ContextSnippet>(fetchImpl, `${baseUrl}/context/snippets/${snippetId}`, {
        body: JSON.stringify(draft),
        method: "PATCH",
      });
    },
    updateLibraryPrompt(promptId: string, prompt: LibraryPrompt): Promise<LibraryPrompt> {
      return requestJson<LibraryPrompt>(fetchImpl, `${baseUrl}/library/prompts/${promptId}`, {
        body: JSON.stringify(prompt),
        method: "PATCH",
      });
    },
  };
}

function libraryQuery(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  setSearchParam(params, "query", filters.query);
  setSearchParam(params, "folder", filters.folder === "all" ? "" : filters.folder);
  setSearchParam(params, "tag", filters.tag === "all" ? "" : filters.tag);
  setSearchParam(params, "includeDeleted", filters.includeDeleted ? "true" : "");
  return params;
}

function templateQuery(filters: TemplateFilters): URLSearchParams {
  const params = new URLSearchParams();
  setSearchParam(params, "query", filters.query);
  setSearchParam(params, "tag", filters.tag === "all" ? "" : filters.tag);
  setSearchParam(params, "tool", filters.tool === "all" ? "" : filters.tool);
  setSearchParam(params, "difficulty", filters.difficulty === "all" ? "" : filters.difficulty);
  setSearchParam(params, "recentOnly", filters.recentOnly ? "true" : "");
  return params;
}

function setSearchParam(params: URLSearchParams, key: string, value: string) {
  if (value.trim()) {
    params.set(key, value);
  }
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchImpl(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Reuse API request failed with ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
