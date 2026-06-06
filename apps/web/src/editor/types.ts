export const enhancementModes = ["improve", "enhance", "refine", "shorten"] as const;

export type EnhancementMode = (typeof enhancementModes)[number];

export type PromptType = "text";

export type PromptTone =
  | "neutral"
  | "professional"
  | "friendly"
  | "concise"
  | "persuasive"
  | "technical";

export interface SelectedContextSnippet {
  id: string;
  title: string;
  body: string;
}

export interface EnhancementRequestOptions {
  audience?: string;
  clarification_answers?: Record<string, string>;
  clarification_skipped?: boolean;
  constraints?: string[];
  context_ids?: string[];
  context_snippets?: string[];
  creativity?: number;
  enable_llm_judge?: boolean;
  language?: string;
  output_format?: string;
  placeholders?: string[];
  skip_clarification?: boolean;
  skipped_clarification?: boolean;
  tone?: string;
}

export interface EnhancementRequestPayload {
  mode: EnhancementMode;
  rawPrompt: string;
  targetModel: string;
  options?: EnhancementRequestOptions;
  selectedContextSnippets?: SelectedContextSnippet[];
  tone?: PromptTone | string;
  userId?: string;
}

export interface EnhancementHttpRequest {
  raw_prompt: string;
  target_model: string;
  prompt_type: PromptType;
  options: EnhancementRequestOptions;
  user_id?: string;
}

export interface EnhancementResult {
  title: string;
  needs_clarification: boolean;
  questions: string[];
  enhanced_prompt: string;
  role: string;
  task: string;
  context: string;
  constraints: string[];
  format: string;
  tone: string;
  success_criteria: string[];
  explanation: string[];
  added: string[];
  removed: string[];
  changed: string[];
}

export type ChecklistStatus = "pass" | "partial" | "missing";

export type ChecklistDimension =
  | "Clarity"
  | "Context"
  | "Specificity"
  | "Output format"
  | "Model/tool fit"
  | "Safety/privacy"
  | "Concision";

export interface ChecklistItem {
  dimension: ChecklistDimension;
  status: ChecklistStatus;
  reason: string;
  fix_suggestion: string;
}

export interface PromptStructureChecklist {
  items: ChecklistItem[];
  structure_score: number;
}

export interface EnhancementQualityChecklist {
  before: PromptStructureChecklist;
  after: PromptStructureChecklist;
}

export interface EnhancementMeta {
  provider: string | null;
  model: string | null;
  tokens: number;
  latency_ms: number;
  fellback: boolean;
}

export interface EnhancementJudgeSuggestion {
  dimension: string;
  weakness: string;
  improvement: string;
}

export type EnhancementQualityJudge =
  | {
      enabled: false;
      status: "disabled";
      suggestions: [];
    }
  | {
      enabled: true;
      status: "completed";
      summary: string;
      suggestions: EnhancementJudgeSuggestion[];
      meta: EnhancementMeta;
    }
  | {
      enabled: true;
      status: "failed" | "unavailable";
      suggestions: [];
      error: "judge_failed" | "judge_not_configured";
    };

export interface EnhancementResponse {
  result: EnhancementResult;
  quality_checklist: EnhancementQualityChecklist;
  meta: EnhancementMeta;
  quality_judge?: EnhancementQualityJudge;
}

export interface EnhancementErrorBody {
  error: string;
  message: string;
  raw_prompt?: string;
}
