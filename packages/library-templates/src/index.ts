export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

export interface TemplateVariable {
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string;
}

export interface PublicTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  body: string;
  variables: TemplateVariable[];
  tags: string[];
  compatibleTools: string[];
  difficulty: TemplateDifficulty;
  isPublic: true;
}

export interface TemplateSearchQuery {
  keyword?: string;
  tag?: string;
  tool?: string;
  difficulty?: TemplateDifficulty;
}

export interface SavedPromptDraft {
  title: string;
  body: string;
  tags: string[];
  folderId?: string;
  pinned?: boolean;
}

export interface SavedPromptSummary {
  id: string;
  userId: string;
  title: string;
  tags: string[];
  folderId?: string;
  pinned: boolean;
  latestVersionId: string;
  deletedAt?: Date;
}

export interface PromptVersionSummary {
  id: string;
  promptId: string;
  versionNumber: number;
  body: string;
  changeNote?: string;
  createdAt: Date;
}

export interface LibraryTemplatesPort {
  listPublicTemplates(query?: TemplateSearchQuery): Promise<PublicTemplate[]>;
  savePrompt(userId: string, draft: SavedPromptDraft): Promise<SavedPromptSummary>;
  listSavedPrompts(userId: string): Promise<SavedPromptSummary[]>;
  listPromptVersions(userId: string, promptId: string): Promise<PromptVersionSummary[]>;
}
