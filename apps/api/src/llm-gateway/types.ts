import type { LlmModelConfig, LlmProviderId } from "@promptgen/config/llm";

export type PromptEnhancementMode = "improve" | "enhance" | "shorten" | "refine";

export interface PromptEnhancementOptions {
  audience?: string;
  constraints?: string[];
  context_snippets?: string[];
  creativity?: number;
  few_shots?: string[];
  language?: string;
  meta_prompt?: string;
  output_format?: string;
  tone?: string;
}

export interface PromptEnhancementInput {
  raw_prompt: string;
  mode: PromptEnhancementMode;
  target_model: string;
  prompt_type: "text";
  cache_scope?: string;
  options?: PromptEnhancementOptions;
  provider_credential?: {
    apiKey: string;
    provider: LlmProviderId;
  };
}

export interface PromptEnhancementResult {
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

export interface PromptQualityJudgeSuggestion {
  dimension:
    | "clarity"
    | "context"
    | "specificity"
    | "output_format"
    | "model_tool_fit"
    | "safety_privacy"
    | "concision";
  weakness: string;
  improvement: string;
}

export interface PromptQualityJudgeResult {
  summary: string;
  suggestions: PromptQualityJudgeSuggestion[];
}

export interface PromptQualityJudgeInput {
  raw_prompt: string;
  enhanced_prompt: string;
  target_model: string;
  generator_provider: LlmProviderId;
  generator_model: string;
  prompt_type: "text";
}

export interface LlmGatewayMeta {
  provider: LlmProviderId;
  model: string;
  tokens: number;
  latency_ms: number;
  fellback: boolean;
  cache?: LlmGatewayCacheMeta;
}

export interface LlmGatewayCacheMeta {
  result_cache_hit: boolean;
  provider_cache_hit: boolean;
  input_tokens: number;
  cached_input_tokens: number;
  input_tokens_saved: number;
}

export interface PromptEnhancementOutput {
  result: PromptEnhancementResult;
  meta: LlmGatewayMeta;
}

export interface PromptQualityJudgeOutput {
  result: PromptQualityJudgeResult;
  meta: LlmGatewayMeta;
}

export interface ProviderTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
}

export interface ProviderGenerateInput {
  apiKey: string;
  model: LlmModelConfig;
  responseSchema?: Record<string, unknown>;
  schemaName?: string;
  staticParts: string[];
  variablePart: string;
}

export interface ProviderGenerateOutput {
  result: unknown;
  text: string;
  usage: ProviderTokenUsage;
}

export interface LlmProviderAdapter {
  readonly provider: LlmProviderId;
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput>;
}

export interface LlmTraceEvent {
  provider: LlmProviderId;
  model: string;
  mode: PromptEnhancementMode | "quality_judge";
  prompt_type: "text";
  target_model: string;
  latency_ms: number;
  tokens: ProviderTokenUsage;
  cost_usd: number;
  success: boolean;
  fellback: boolean;
  attempt: number;
  cache?: LlmGatewayCacheMeta;
  error_code?: string;
}

export interface LlmTraceReporter {
  recordLlmCall(event: LlmTraceEvent): Promise<void> | void;
}
