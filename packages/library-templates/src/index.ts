import type { PublicTemplate, TemplateSearchQuery } from "./templates/schema";

export { InMemoryTemplateCatalog, type TemplateCatalogPort } from "./templates/in-memory-store";
export {
  TemplateLoaderError,
  loadTemplatesFromContent,
  seedTemplateCatalog,
  type TemplateSeedStore,
} from "./templates/loader";
export {
  extractTemplateVariableNames,
  isTemplateDifficulty,
  templateDifficulties,
  validateTemplateContent,
  type PublicTemplate,
  type TemplateContentValidationResult,
  type TemplateDifficulty,
  type TemplateSearchQuery,
  type TemplateUsageRecord,
  type TemplateVariable,
} from "./templates/schema";
export { searchTemplateCatalog } from "./templates/search";
export {
  fillTemplateVariables,
  type TemplateFillError,
  type TemplateFillResult,
} from "./templates/fill";

export interface SavedPromptDraft {
  title: string;
  body: string;
  tags: string[];
  folderId?: string;
  folderName?: string;
  pinned?: boolean;
  sections?: Record<string, unknown>;
  changeNote?: string;
}

export interface SavedPromptEdit {
  title?: string;
  body: string;
  tags?: string[];
  folderId?: string | null;
  folderName?: string;
  pinned?: boolean;
  sections?: Record<string, unknown>;
  changeNote?: string;
}

export interface SavedPromptSummary {
  id: string;
  userId: string;
  title: string;
  tags: string[];
  folderId?: string;
  pinned: boolean;
  latestVersionId: string;
  createdAt: Date;
  deletedAt?: Date;
}

export interface PromptVersionSummary {
  id: string;
  promptId: string;
  versionNumber: number;
  body: string;
  sections: Record<string, unknown>;
  changeNote?: string;
  createdAt: Date;
}

export interface PromptFolder {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface PromptSearchQuery {
  keyword?: string;
  tag?: string;
  limit?: number;
}

export type ExportFormat = "markdown" | "json";

export interface PromptExport {
  format: ExportFormat;
  filename: string;
  contentType: "text/markdown" | "application/json";
  content: string;
}

export interface LibraryTemplatesPort {
  listPublicTemplates(query?: TemplateSearchQuery): Promise<PublicTemplate[]>;
  savePrompt(userId: string, draft: SavedPromptDraft): Promise<SavedPromptSummary>;
  listSavedPrompts(userId: string): Promise<SavedPromptSummary[]>;
  listPromptVersions(userId: string, promptId: string): Promise<PromptVersionSummary[]>;
}

export interface PromptLibraryPort extends Pick<
  LibraryTemplatesPort,
  "listPromptVersions" | "listSavedPrompts" | "savePrompt"
> {
  createFolder(userId: string, name: string): Promise<PromptFolder>;
  editPrompt(userId: string, promptId: string, edit: SavedPromptEdit): Promise<SavedPromptSummary>;
  updatePromptOrganization(
    userId: string,
    promptId: string,
    input: { folderId?: string | null; folderName?: string; pinned?: boolean; tags?: string[] },
  ): Promise<SavedPromptSummary>;
  duplicatePrompt(
    userId: string,
    promptId: string,
    input?: { title?: string; changeNote?: string },
  ): Promise<SavedPromptSummary>;
  restorePromptVersion(
    userId: string,
    promptId: string,
    versionId: string,
    changeNote?: string,
  ): Promise<SavedPromptSummary>;
  softDeletePrompt(userId: string, promptId: string): Promise<SavedPromptSummary>;
  recoverPrompt(userId: string, promptId: string): Promise<SavedPromptSummary>;
  searchSavedPrompts(userId: string, query: PromptSearchQuery): Promise<SavedPromptSummary[]>;
  exportPrompt(userId: string, promptId: string, format: ExportFormat): Promise<PromptExport>;
}

export { PostgresPromptLibraryStore, PromptLibraryError } from "./prompt-library";
export type { PromptLibraryErrorCode } from "./prompt-library";
