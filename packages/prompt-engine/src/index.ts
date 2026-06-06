export {
  buildPromptEnginePrompt,
  PROMPT_ENGINE_META_PROMPT_V2,
  PROMPT_ENGINE_STATIC_PREFIX,
  type BuildPromptEnginePromptInput,
  type SelectedContextSnippet,
} from "./prompts/meta-prompt-v2";
export {
  formatGoldenFewShotsForPrompt,
  PROMPT_ENGINE_GOLDEN_FEW_SHOTS,
  type PromptEngineGoldenFewShot,
} from "./prompts/few-shots";
export {
  buildPromptQualityJudgePrompt,
  PROMPT_QUALITY_JUDGE_STATIC_PREFIX,
  type BuildPromptQualityJudgePromptInput,
} from "./prompts/quality-judge";
export {
  PROMPT_QUALITY_JUDGE_DIMENSIONS,
  PROMPT_QUALITY_JUDGE_OUTPUT_FIELDS,
  PROMPT_QUALITY_JUDGE_OUTPUT_SCHEMA,
  PROMPT_QUALITY_JUDGE_SUGGESTION_FIELDS,
  PROMPT_ENGINE_OUTPUT_FIELDS,
  PROMPT_ENGINE_OUTPUT_SCHEMA,
  validatePromptQualityJudgeOutput,
  validatePromptEngineOutput,
  type PromptQualityJudgeDimension,
  type PromptQualityJudgeJsonSchema,
  type PromptQualityJudgeOutputField,
  type PromptQualityJudgeStructuredOutput,
  type PromptQualityJudgeSuggestion,
  type PromptQualityJudgeSuggestionField,
  type PromptEngineJsonSchema,
  type PromptEngineOutputField,
  type PromptEngineSchemaValidationResult,
  type PromptEngineStructuredOutput,
  type PromptEnhancementMode,
  type PromptTargetModel,
  type PromptTone,
} from "./schema";

import type { PromptEnhancementMode, PromptEngineStructuredOutput } from "./schema";

export interface PromptEngineRequest {
  userId: string;
  rawPrompt: string;
  mode: PromptEnhancementMode;
  promptType: string;
  targetModel?: string;
  selectedContextSnippetIds: string[];
}

export interface PromptEngineResult {
  output: PromptEngineStructuredOutput;
  contextSnippetIdsUsed: string[];
}

export interface PromptEnginePort {
  enhancePrompt(request: PromptEngineRequest): Promise<PromptEngineResult>;
}

export function createPhaseOnePromptEngineStub(): PromptEnginePort {
  return {
    async enhancePrompt(_request) {
      throw new Error("Prompt engine enhancement is deferred until Phase 2.");
    },
  };
}
