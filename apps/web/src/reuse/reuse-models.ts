import { createEditorDraftUrl } from "../editor/editor-draft";
import type { EditorMode, TargetModelOption } from "../editor/editor-options";

export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";
export type ContextSnippetKind = "brand_voice" | "product" | "audience" | "coding_stack" | "other";
export type PromptOperationMode = EditorMode;

export interface TemplateVariable {
  defaultValue: string;
  label: string;
  name: string;
  required: boolean;
}

export interface PromptTemplate {
  body: string;
  category: string;
  compatibleTools: string[];
  description: string;
  difficulty: TemplateDifficulty;
  id: string;
  isPublic: true;
  tags: string[];
  title: string;
  variables: TemplateVariable[];
}

export interface TemplateFilters {
  difficulty: "all" | TemplateDifficulty;
  query: string;
  recentOnly: boolean;
  tag: "all" | string;
  tool: "all" | string;
}

export interface LibraryPromptVersion {
  body: string;
  changeNote: string;
  createdAt: string;
  id: string;
  versionNumber: number;
}

export interface LibraryPrompt {
  createdAt: string;
  deletedAt: string | null;
  folder: string;
  id: string;
  pinned: boolean;
  tags: string[];
  title: string;
  updatedAt: string;
  versions: LibraryPromptVersion[];
}

export interface LibraryFilters {
  folder: "all" | string;
  includeDeleted: boolean;
  query: string;
  tag: "all" | string;
}

export interface PromptHistoryEntry {
  createdAt: string;
  enhanced: string;
  id: string;
  latencyMs: number;
  mode: PromptOperationMode;
  model: string;
  original: string;
  promptType: "text";
  provider: string;
  saved: boolean;
  structureScoreAfter: number;
  structureScoreBefore: number;
  targetModel: TargetModelOption;
  thumbsFeedback: "up" | "down" | null;
  tokens: number;
}

export interface ContextSnippet {
  body: string;
  createdAt: string;
  id: string;
  kind: ContextSnippetKind;
  tags: string[];
  title: string;
  updatedAt: string;
}

export interface ContextSnippetDraft {
  body: string;
  kind: ContextSnippetKind;
  tags: string[];
  title: string;
}

export interface TemplateGenerationResult {
  errors: Record<string, string>;
  prompt: string;
  status: "generated" | "invalid";
}

export const libraryFolders = ["Growth", "Product", "Research", "Support"];
export const contextKindOptions: Array<{ label: string; value: ContextSnippetKind }> = [
  { label: "Brand voice", value: "brand_voice" },
  { label: "Product", value: "product" },
  { label: "Audience", value: "audience" },
  { label: "Coding stack", value: "coding_stack" },
  { label: "Other", value: "other" },
];

export const seedLibraryPrompts: LibraryPrompt[] = [
  {
    createdAt: "2026-06-01T09:15:00.000Z",
    deletedAt: null,
    folder: "Growth",
    id: "prompt_launch_email",
    pinned: true,
    tags: ["email", "launch"],
    title: "Launch email sequence",
    updatedAt: "2026-06-05T11:20:00.000Z",
    versions: [
      {
        body: "Write a launch email for a new analytics dashboard aimed at revenue leaders.",
        changeNote: "Initial save from enhancement.",
        createdAt: "2026-06-01T09:15:00.000Z",
        id: "prompt_launch_email_v1",
        versionNumber: 1,
      },
      {
        body: "Act as a B2B lifecycle marketer. Draft a concise three-email launch sequence for a revenue analytics dashboard. Include a subject line, audience-specific value point, proof point placeholder, and a clear CTA for each email.",
        changeNote: "Added sequence structure and CTA requirements.",
        createdAt: "2026-06-05T11:20:00.000Z",
        id: "prompt_launch_email_v2",
        versionNumber: 2,
      },
    ],
  },
  {
    createdAt: "2026-06-02T14:40:00.000Z",
    deletedAt: null,
    folder: "Research",
    id: "prompt_interview_synthesis",
    pinned: false,
    tags: ["research", "synthesis"],
    title: "Interview synthesis",
    updatedAt: "2026-06-04T08:30:00.000Z",
    versions: [
      {
        body: "Summarize customer interview notes into themes, evidence, contradictions, and product opportunities. Keep quotes short and separate facts from interpretation.",
        changeNote: "Structured research output.",
        createdAt: "2026-06-04T08:30:00.000Z",
        id: "prompt_interview_synthesis_v1",
        versionNumber: 1,
      },
    ],
  },
  {
    createdAt: "2026-05-28T10:00:00.000Z",
    deletedAt: "2026-06-06T09:00:00.000Z",
    folder: "Support",
    id: "prompt_support_macro",
    pinned: false,
    tags: ["support", "macro"],
    title: "Refund policy macro",
    updatedAt: "2026-06-06T09:00:00.000Z",
    versions: [
      {
        body: "Draft a support response explaining the refund policy with a respectful tone, one next step, and no promises beyond the documented policy.",
        changeNote: "Saved support macro.",
        createdAt: "2026-05-28T10:00:00.000Z",
        id: "prompt_support_macro_v1",
        versionNumber: 1,
      },
    ],
  },
];

export const seedHistoryEntries: PromptHistoryEntry[] = [
  {
    createdAt: "2026-06-07T07:45:00.000Z",
    enhanced:
      "Act as a product marketing lead. Rewrite the onboarding email for trial users who connected their first data source. Use a friendly professional tone, three short benefit bullets, and one CTA to invite a teammate.",
    id: "hist_onboarding_email",
    latencyMs: 1840,
    mode: "enhance",
    model: "gemini-3.5-flash",
    original: "make this onboarding email better for trial users",
    promptType: "text",
    provider: "gemini",
    saved: true,
    structureScoreAfter: 86,
    structureScoreBefore: 38,
    targetModel: "auto",
    thumbsFeedback: "up",
    tokens: 724,
  },
  {
    createdAt: "2026-06-06T16:10:00.000Z",
    enhanced:
      "Condense the release note into five bullets. Preserve feature names, customer impact, rollout timing, and any known limitation. Do not add claims that are not present in the source text.",
    id: "hist_release_note",
    latencyMs: 1325,
    mode: "shorten",
    model: "gemini-3.5-flash",
    original: "shorten this release note but keep the caveats",
    promptType: "text",
    provider: "gemini",
    saved: false,
    structureScoreAfter: 78,
    structureScoreBefore: 52,
    targetModel: "gemini",
    thumbsFeedback: null,
    tokens: 416,
  },
  {
    createdAt: "2026-06-05T12:05:00.000Z",
    enhanced: "What audience, source material, and decision should the summary support?",
    id: "hist_refine_questions",
    latencyMs: 810,
    mode: "refine",
    model: "gemini-3.5-flash",
    original: "summarize this",
    promptType: "text",
    provider: "gemini",
    saved: false,
    structureScoreAfter: 24,
    structureScoreBefore: 14,
    targetModel: "auto",
    thumbsFeedback: null,
    tokens: 188,
  },
];

export const seedContextSnippets: ContextSnippet[] = [
  {
    body: "Brand voice: clear, practical, evidence-led, and direct.",
    createdAt: "2026-06-01T08:00:00.000Z",
    id: "ctx_brand_voice",
    kind: "brand_voice",
    tags: ["voice"],
    title: "Practical brand voice",
    updatedAt: "2026-06-01T08:00:00.000Z",
  },
  {
    body: "Audience: revenue team leaders who need reliable reporting without a long setup.",
    createdAt: "2026-06-02T08:00:00.000Z",
    id: "ctx_revenue_audience",
    kind: "audience",
    tags: ["audience", "revenue"],
    title: "Revenue leadership audience",
    updatedAt: "2026-06-02T08:00:00.000Z",
  },
  {
    body: "Product details: the dashboard highlights pipeline movement, forecast risk, and account-level signals.",
    createdAt: "2026-06-03T08:00:00.000Z",
    id: "ctx_dashboard_product",
    kind: "product",
    tags: ["product"],
    title: "Analytics dashboard details",
    updatedAt: "2026-06-03T08:00:00.000Z",
  },
];

export const seedTemplates: PromptTemplate[] = [
  {
    body: "Act as a lifecycle marketer. Draft a {{channel}} launch message for {{audience}} about {{feature}}. Include the customer problem, the main benefit, one proof point placeholder, and a {{cta}} call to action.",
    category: "email",
    compatibleTools: ["chatgpt", "claude", "gemini"],
    description: "Create a launch message with audience, feature, proof, and CTA.",
    difficulty: "beginner",
    id: "tmpl_launch_message",
    isPublic: true,
    tags: ["launch", "email", "copy"],
    title: "Launch message",
    variables: [
      { defaultValue: "email", label: "Channel", name: "channel", required: true },
      { defaultValue: "", label: "Audience", name: "audience", required: true },
      { defaultValue: "", label: "Feature", name: "feature", required: true },
      { defaultValue: "book a demo", label: "CTA", name: "cta", required: false },
    ],
  },
  {
    body: "Act as a product researcher. Synthesize {{source_material}} for {{stakeholder}}. Return themes, supporting evidence, contradictions, open questions, and recommended next research steps. Keep interpretation separate from direct evidence.",
    category: "research",
    compatibleTools: ["chatgpt", "claude", "gemini"],
    description: "Turn notes into evidence-backed themes and follow-up questions.",
    difficulty: "intermediate",
    id: "tmpl_research_synthesis",
    isPublic: true,
    tags: ["research", "synthesis"],
    title: "Research synthesis",
    variables: [
      { defaultValue: "", label: "Source material", name: "source_material", required: true },
      { defaultValue: "product team", label: "Stakeholder", name: "stakeholder", required: true },
    ],
  },
  {
    body: "Act as a support lead. Write a customer reply about {{issue}}. Use a {{tone}} tone, acknowledge the impact, state what is known, list the next step, and avoid promises beyond the confirmed policy.",
    category: "support",
    compatibleTools: ["chatgpt", "claude"],
    description: "Draft a support response that separates facts from promises.",
    difficulty: "beginner",
    id: "tmpl_support_reply",
    isPublic: true,
    tags: ["support", "customer"],
    title: "Support reply",
    variables: [
      { defaultValue: "", label: "Issue", name: "issue", required: true },
      { defaultValue: "calm and helpful", label: "Tone", name: "tone", required: false },
    ],
  },
  {
    body: "Act as an engineering reviewer. Review the proposed change for {{system_area}}. Identify correctness risks, missing tests, accessibility or security concerns, and the smallest follow-up needed before release. Do not rewrite unrelated code.",
    category: "coding",
    compatibleTools: ["chatgpt", "claude", "gemini"],
    description: "Review a focused code change without broadening scope.",
    difficulty: "advanced",
    id: "tmpl_code_review",
    isPublic: true,
    tags: ["coding", "review"],
    title: "Focused code review",
    variables: [{ defaultValue: "", label: "System area", name: "system_area", required: true }],
  },
  {
    body: "Act as a PM. Convert {{input}} into a decision memo for {{audience}}. Include context, options considered, recommendation, risks, non-goals, and the date-sensitive assumptions to verify.",
    category: "pm",
    compatibleTools: ["chatgpt", "claude", "gemini"],
    description: "Create a decision memo with options, risks, and assumptions.",
    difficulty: "intermediate",
    id: "tmpl_decision_memo",
    isPublic: true,
    tags: ["pm", "decision"],
    title: "Decision memo",
    variables: [
      { defaultValue: "", label: "Input", name: "input", required: true },
      { defaultValue: "leadership", label: "Audience", name: "audience", required: true },
    ],
  },
];

export function getLatestLibraryVersion(prompt: LibraryPrompt): LibraryPromptVersion {
  const versions = [...prompt.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const latestVersion = versions[0];

  if (!latestVersion) {
    throw new Error(`Prompt ${prompt.id} has no versions.`);
  }

  return latestVersion;
}

export function getLibraryTags(prompts: LibraryPrompt[]): string[] {
  return uniqueSorted(prompts.flatMap((prompt) => prompt.tags));
}

export function getTemplateTags(templates: PromptTemplate[]): string[] {
  return uniqueSorted(templates.flatMap((template) => template.tags));
}

export function getTemplateTools(templates: PromptTemplate[]): string[] {
  return uniqueSorted(templates.flatMap((template) => template.compatibleTools));
}

export function filterLibraryPrompts(
  prompts: LibraryPrompt[],
  filters: LibraryFilters,
): LibraryPrompt[] {
  const query = normalize(filters.query);

  return [...prompts]
    .filter((prompt) => filters.includeDeleted || prompt.deletedAt === null)
    .filter((prompt) => filters.folder === "all" || prompt.folder === filters.folder)
    .filter((prompt) => filters.tag === "all" || prompt.tags.includes(filters.tag))
    .filter((prompt) => {
      if (!query) {
        return true;
      }

      const latest = getLatestLibraryVersion(prompt);
      return [prompt.title, prompt.folder, prompt.tags.join(" "), latest.body]
        .map(normalize)
        .some((value) => value.includes(query));
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export function filterHistoryEntries(entries: PromptHistoryEntry[]): PromptHistoryEntry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function filterTemplates(
  templates: PromptTemplate[],
  filters: TemplateFilters,
  recentTemplateIds: string[],
): PromptTemplate[] {
  const query = normalize(filters.query);
  const recentSet = new Set(recentTemplateIds);

  return templates.filter((template) => {
    const matchesQuery =
      !query ||
      [
        template.title,
        template.category,
        template.description,
        template.tags.join(" "),
        template.body,
      ]
        .map(normalize)
        .some((value) => value.includes(query));
    const matchesTag = filters.tag === "all" || template.tags.includes(filters.tag);
    const matchesTool = filters.tool === "all" || template.compatibleTools.includes(filters.tool);
    const matchesDifficulty =
      filters.difficulty === "all" || template.difficulty === filters.difficulty;
    const matchesRecent = !filters.recentOnly || recentSet.has(template.id);

    return matchesQuery && matchesTag && matchesTool && matchesDifficulty && matchesRecent;
  });
}

export function editLibraryPrompt(
  prompts: LibraryPrompt[],
  promptId: string,
  input: { body: string; changeNote: string; title: string },
  now = new Date().toISOString(),
): LibraryPrompt[] {
  return prompts.map((prompt) => {
    if (prompt.id !== promptId) {
      return prompt;
    }

    const latest = getLatestLibraryVersion(prompt);
    const nextVersionNumber = latest.versionNumber + 1;

    return {
      ...prompt,
      title: input.title.trim() || prompt.title,
      updatedAt: now,
      versions: [
        ...prompt.versions,
        {
          body: input.body,
          changeNote: input.changeNote.trim() || "Edited prompt.",
          createdAt: now,
          id: `${prompt.id}_v${nextVersionNumber}`,
          versionNumber: nextVersionNumber,
        },
      ],
    };
  });
}

export function duplicateLibraryPrompt(
  prompts: LibraryPrompt[],
  promptId: string,
  now = new Date().toISOString(),
): LibraryPrompt[] {
  const prompt = prompts.find((item) => item.id === promptId);

  if (!prompt) {
    return prompts;
  }

  const latest = getLatestLibraryVersion(prompt);
  const copyId = `${prompt.id}_copy_${timestampSuffix(now)}`;
  const copy: LibraryPrompt = {
    ...prompt,
    createdAt: now,
    deletedAt: null,
    id: copyId,
    pinned: false,
    title: `${prompt.title} copy`,
    updatedAt: now,
    versions: [
      {
        body: latest.body,
        changeNote: `Duplicated from ${prompt.title}.`,
        createdAt: now,
        id: `${copyId}_v1`,
        versionNumber: 1,
      },
    ],
  };

  return [copy, ...prompts];
}

export function tagLibraryPrompt(
  prompts: LibraryPrompt[],
  promptId: string,
  tag: string,
): LibraryPrompt[] {
  const nextTag = normalizeTag(tag);

  if (!nextTag) {
    return prompts;
  }

  return prompts.map((prompt) =>
    prompt.id === promptId
      ? {
          ...prompt,
          tags: uniqueSorted([...prompt.tags, nextTag]),
        }
      : prompt,
  );
}

export function toggleLibraryPromptPin(
  prompts: LibraryPrompt[],
  promptId: string,
): LibraryPrompt[] {
  return prompts.map((prompt) =>
    prompt.id === promptId ? { ...prompt, pinned: !prompt.pinned } : prompt,
  );
}

export function softDeleteLibraryPrompt(
  prompts: LibraryPrompt[],
  promptId: string,
  now = new Date().toISOString(),
): LibraryPrompt[] {
  return prompts.map((prompt) =>
    prompt.id === promptId ? { ...prompt, deletedAt: now, updatedAt: now, pinned: false } : prompt,
  );
}

export function restoreDeletedLibraryPrompt(
  prompts: LibraryPrompt[],
  promptId: string,
  now = new Date().toISOString(),
): LibraryPrompt[] {
  return prompts.map((prompt) =>
    prompt.id === promptId ? { ...prompt, deletedAt: null, updatedAt: now } : prompt,
  );
}

export function restoreLibraryPromptVersion(
  prompts: LibraryPrompt[],
  promptId: string,
  versionId: string,
  now = new Date().toISOString(),
): LibraryPrompt[] {
  return prompts.map((prompt) => {
    if (prompt.id !== promptId) {
      return prompt;
    }

    const version = prompt.versions.find((item) => item.id === versionId);

    if (!version) {
      return prompt;
    }

    const nextVersionNumber = getLatestLibraryVersion(prompt).versionNumber + 1;

    return {
      ...prompt,
      updatedAt: now,
      versions: [
        ...prompt.versions,
        {
          body: version.body,
          changeNote: `Restored version ${version.versionNumber}.`,
          createdAt: now,
          id: `${prompt.id}_v${nextVersionNumber}`,
          versionNumber: nextVersionNumber,
        },
      ],
    };
  });
}

export function formatPromptAsMarkdown(prompt: LibraryPrompt): string {
  const latest = getLatestLibraryVersion(prompt);
  return [
    `# ${prompt.title}`,
    "",
    `Folder: ${prompt.folder}`,
    `Tags: ${prompt.tags.join(", ") || "none"}`,
    `Version: ${latest.versionNumber}`,
    `Updated: ${formatDateTime(prompt.updatedAt)}`,
    "",
    latest.body,
  ].join("\n");
}

export function formatPromptAsJson(prompt: LibraryPrompt): string {
  const latest = getLatestLibraryVersion(prompt);
  return JSON.stringify(
    {
      folder: prompt.folder,
      id: prompt.id,
      pinned: prompt.pinned,
      tags: prompt.tags,
      title: prompt.title,
      version: latest,
    },
    null,
    2,
  );
}

export function deleteHistoryEntry(
  entries: PromptHistoryEntry[],
  entryId: string,
): PromptHistoryEntry[] {
  return entries.filter((entry) => entry.id !== entryId);
}

export function createHistoryEditorUrl(entry: PromptHistoryEntry): string {
  return createEditorDraftUrl({
    mode: entry.mode,
    prompt: entry.enhanced,
    source: "history",
    targetModel: entry.targetModel,
  });
}

export function createLibraryEditorUrl(prompt: LibraryPrompt): string {
  return createEditorDraftUrl({
    mode: "enhance",
    prompt: getLatestLibraryVersion(prompt).body,
    source: "library",
    targetModel: "auto",
  });
}

export function createTemplateEditorUrl(prompt: string): string {
  return createEditorDraftUrl({
    mode: "enhance",
    prompt,
    source: "template",
    targetModel: "auto",
  });
}

export function createContextSnippet(
  snippets: ContextSnippet[],
  draft: ContextSnippetDraft,
  now = new Date().toISOString(),
): ContextSnippet[] {
  if (!draft.title.trim() || !draft.body.trim()) {
    return snippets;
  }

  const id = `ctx_${slugify(draft.title)}_${timestampSuffix(now)}`;
  return [
    {
      body: draft.body,
      createdAt: now,
      id,
      kind: draft.kind,
      tags: normalizeTags(draft.tags),
      title: draft.title.trim(),
      updatedAt: now,
    },
    ...snippets,
  ];
}

export function updateContextSnippet(
  snippets: ContextSnippet[],
  snippetId: string,
  draft: ContextSnippetDraft,
  now = new Date().toISOString(),
): ContextSnippet[] {
  return snippets.map((snippet) =>
    snippet.id === snippetId
      ? {
          ...snippet,
          body: draft.body,
          kind: draft.kind,
          tags: normalizeTags(draft.tags),
          title: draft.title.trim() || snippet.title,
          updatedAt: now,
        }
      : snippet,
  );
}

export function deleteContextSnippet(
  snippets: ContextSnippet[],
  snippetId: string,
): ContextSnippet[] {
  return snippets.filter((snippet) => snippet.id !== snippetId);
}

export function toggleContextSelection(
  selectedIds: string[],
  snippetId: string,
  selected: boolean,
): string[] {
  if (selected) {
    return [...new Set([...selectedIds, snippetId])];
  }

  return selectedIds.filter((selectedId) => selectedId !== snippetId);
}

export function getExplicitlySelectedContextSnippets(
  snippets: ContextSnippet[],
  selectedIds: string[],
): ContextSnippet[] {
  const selectedSet = new Set(selectedIds);
  return snippets.filter((snippet) => selectedSet.has(snippet.id));
}

export function validateTemplateVariables(
  template: PromptTemplate,
  values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    template.variables
      .filter((variable) => variable.required && !getTemplateVariableValue(variable, values).trim())
      .map((variable) => [variable.name, `${variable.label} is required.`]),
  );
}

export function generateTemplatePrompt(
  template: PromptTemplate,
  values: Record<string, string>,
): TemplateGenerationResult {
  const errors = validateTemplateVariables(template, values);

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      prompt: "",
      status: "invalid",
    };
  }

  return {
    errors: {},
    prompt: fillTemplateBody(template, values),
    status: "generated",
  };
}

export function fillTemplateBody(template: PromptTemplate, values: Record<string, string>): string {
  const variablesByName = new Map(template.variables.map((variable) => [variable.name, variable]));

  return template.body.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (match, variableName: string) => {
    const variable = variablesByName.get(variableName);

    if (!variable) {
      return match;
    }

    const value = getTemplateVariableValue(variable, values).trim();
    return value || `[${variable.label}]`;
  });
}

export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

export function splitTags(value: string): string[] {
  return value.split(",").map(normalizeTag).filter(Boolean);
}

function getTemplateVariableValue(
  variable: TemplateVariable,
  values: Record<string, string>,
): string {
  return values[variable.name] ?? variable.defaultValue;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTag(value: string): string {
  return normalize(value).replace(/\s+/g, "-");
}

function normalizeTags(tags: string[]): string[] {
  return uniqueSorted(tags.map(normalizeTag).filter(Boolean));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function timestampSuffix(isoDate: string): string {
  return isoDate.replace(/\D/g, "").slice(0, 14);
}

function slugify(value: string): string {
  return (
    normalizeTag(value)
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-") || "snippet"
  );
}
