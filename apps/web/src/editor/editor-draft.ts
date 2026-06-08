import {
  editorModeOptions,
  targetModelOptions,
  toneOptions,
  type EditorMode,
  type TargetModelOption,
  type ToneOption,
} from "./editor-options";

export interface EditorDraft {
  contextIds: string[];
  mode: EditorMode;
  prompt: string;
  source: "library" | "history" | "template" | "context" | "direct";
  targetModel: TargetModelOption;
  tone: ToneOption;
}

export type EditorDraftInput = Partial<Omit<EditorDraft, "prompt">> & {
  prompt: string;
};

export type EditorDraftSearchParams = Record<string, string | string[] | undefined>;

const editorModes = new Set(editorModeOptions.map((option) => option.value));
const targetModels = new Set(targetModelOptions.map((option) => option.value));
const tones = new Set(toneOptions.map((option) => option.value));
const sources = new Set(["library", "history", "template", "context", "direct"] as const);

export function createEditorDraftUrl(input: EditorDraftInput): string {
  const params = new URLSearchParams();
  const prompt = input.prompt.trim();

  if (prompt) {
    params.set("prompt", prompt);
  }

  params.set("mode", input.mode ?? "enhance");
  params.set("targetModel", input.targetModel ?? "auto");
  params.set("tone", input.tone ?? "neutral");
  params.set("source", input.source ?? "direct");

  if (input.contextIds && input.contextIds.length > 0) {
    params.set("contextIds", input.contextIds.join(","));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function parseEditorDraftSearchParams(
  searchParams: EditorDraftSearchParams | undefined,
): EditorDraft | null {
  const prompt = getFirstParam(searchParams, "prompt")?.trim();

  if (!prompt) {
    return null;
  }

  const mode = getFirstParam(searchParams, "mode");
  const targetModel = getFirstParam(searchParams, "targetModel");
  const tone = getFirstParam(searchParams, "tone");
  const source = getFirstParam(searchParams, "source");
  const contextIds = getFirstParam(searchParams, "contextIds")
    ?.split(",")
    .map((contextId) => contextId.trim())
    .filter(Boolean);

  return {
    contextIds: contextIds ?? [],
    mode: isEditorMode(mode) ? mode : "enhance",
    prompt,
    source: isEditorDraftSource(source) ? source : "direct",
    targetModel: isTargetModel(targetModel) ? targetModel : "auto",
    tone: isTone(tone) ? tone : "neutral",
  };
}

function getFirstParam(
  searchParams: EditorDraftSearchParams | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isEditorMode(value: string | undefined): value is EditorMode {
  return value !== undefined && editorModes.has(value as EditorMode);
}

function isTargetModel(value: string | undefined): value is TargetModelOption {
  return value !== undefined && targetModels.has(value as TargetModelOption);
}

function isTone(value: string | undefined): value is ToneOption {
  return value !== undefined && tones.has(value as ToneOption);
}

function isEditorDraftSource(value: string | undefined): value is EditorDraft["source"] {
  return value !== undefined && sources.has(value as EditorDraft["source"]);
}
