import type { ChecklistStatus } from "./checklist-status";

export interface EnhancementResultViewModel {
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

export interface PromptChecklistItemViewModel {
  dimension: string;
  status: ChecklistStatus;
  reason: string;
  fix_suggestion: string;
}

export interface PromptStructureChecklistViewModel {
  structure_score: number;
  items: PromptChecklistItemViewModel[];
}

export interface EnhancementQualityChecklistViewModel {
  before: PromptStructureChecklistViewModel;
  after: PromptStructureChecklistViewModel;
}

export interface EnhancementMetaViewModel {
  provider: string | null;
  model: string | null;
  tokens: number;
  latency_ms: number;
  fellback: boolean;
}

export interface ContextUsedSnippetViewModel {
  id: string;
  text: string;
}

export interface ResultsCopySavePayload {
  title: string;
  originalPrompt: string;
  enhancedPrompt: string;
  structureScoreBefore: number;
  structureScoreAfter: number;
  contextUsedSnippets: ContextUsedSnippetViewModel[];
}

export function buildResultsCopySavePayload(input: {
  originalPrompt: string;
  enhancedPrompt: string;
  result: EnhancementResultViewModel;
  qualityChecklist: EnhancementQualityChecklistViewModel;
  contextUsedSnippets: ContextUsedSnippetViewModel[];
}): ResultsCopySavePayload {
  return {
    contextUsedSnippets: input.contextUsedSnippets,
    enhancedPrompt: input.enhancedPrompt,
    originalPrompt: input.originalPrompt,
    structureScoreAfter: input.qualityChecklist.after.structure_score,
    structureScoreBefore: input.qualityChecklist.before.structure_score,
    title: input.result.title,
  };
}
