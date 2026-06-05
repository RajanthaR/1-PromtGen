import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { defaultLlmGatewayRegistry, type LlmModelConfig } from "@promptgen/config/llm";

import { LlmGatewayError, toSafeErrorCode } from "./errors";
import { createGeminiAdapter } from "./gemini-adapter";
import { buildStaticFirstPromptParts } from "./prompt-layout";
import { createLlmAdapterRegistry, type LlmAdapterRegistry } from "./registry";
import { validatePromptEnhancementResult } from "./schema";
import { detectSecrets } from "./secrets";
import { screenPromptEnhancementOutput } from "./output-screening";
import type {
  LlmProviderAdapter,
  LlmTraceReporter,
  PromptEnhancementInput,
  PromptEnhancementOutput,
  ProviderGenerateOutput,
  ProviderTokenUsage,
} from "./types";

export interface LlmGateway {
  enhance(input: PromptEnhancementInput): Promise<PromptEnhancementOutput>;
}

export interface CreateLlmGatewayOptions {
  apiKey?: string;
  clock?: () => number;
  registry: LlmAdapterRegistry;
  reporter?: LlmTraceReporter;
}

const emptyUsage: ProviderTokenUsage = {
  cachedInputTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function createLlmGateway(options: CreateLlmGatewayOptions): LlmGateway {
  const clock = options.clock ?? Date.now;
  const reporter = options.reporter;

  return {
    async enhance(input): Promise<PromptEnhancementOutput> {
      const normalizedInput = normalizeEnhancementInput(input);
      const secretFindings = detectSecrets(normalizedInput.raw_prompt);

      if (secretFindings.length > 0) {
        throw new LlmGatewayError(
          "secret_detected",
          "Prompt appears to contain credentials. Remove secrets before enhancement.",
        );
      }

      const apiKey = options.apiKey?.trim();
      if (!apiKey) {
        throw new LlmGatewayError("configuration_error", "LLM provider API key is not configured.");
      }

      const primaryModel = options.registry.resolveGenerationModel(normalizedInput.target_model);
      const fallbackModel = options.registry.resolveFallbackModel(primaryModel);
      const attempts = [
        { attempt: 1, fellback: false, model: primaryModel },
        { attempt: 2, fellback: false, model: primaryModel },
        ...(fallbackModel ? [{ attempt: 3, fellback: true, model: fallbackModel }] : []),
      ];
      let lastError: unknown;

      for (const attempt of attempts) {
        const adapter = options.registry.adapterFor(attempt.model.provider);
        const startedAt = clock();
        let providerOutput: ProviderGenerateOutput | null = null;

        try {
          providerOutput = await adapter.generate({
            apiKey,
            model: attempt.model,
            ...buildStaticFirstPromptParts(normalizedInput),
          });
          const result = validatePromptEnhancementResult(providerOutput.result);
          screenPromptEnhancementOutput(result);
          const latencyMs = Math.max(0, Math.round(clock() - startedAt));

          await reporter?.recordLlmCall({
            attempt: attempt.attempt,
            cost_usd: estimateCost(attempt.model, providerOutput.usage),
            fellback: attempt.fellback,
            latency_ms: latencyMs,
            mode: normalizedInput.mode,
            model: attempt.model.id,
            prompt_type: normalizedInput.prompt_type,
            provider: attempt.model.provider,
            success: true,
            target_model: normalizedInput.target_model,
            tokens: providerOutput.usage,
          });

          return {
            result,
            meta: {
              fellback: attempt.fellback,
              latency_ms: latencyMs,
              model: attempt.model.id,
              provider: attempt.model.provider,
              tokens: providerOutput.usage.totalTokens,
            },
          };
        } catch (error) {
          lastError = error;
          const latencyMs = Math.max(0, Math.round(clock() - startedAt));

          await reporter?.recordLlmCall({
            attempt: attempt.attempt,
            cost_usd: estimateCost(attempt.model, providerOutput?.usage ?? emptyUsage),
            error_code: toSafeErrorCode(error),
            fellback: attempt.fellback,
            latency_ms: latencyMs,
            mode: normalizedInput.mode,
            model: attempt.model.id,
            prompt_type: normalizedInput.prompt_type,
            provider: attempt.model.provider,
            success: false,
            target_model: normalizedInput.target_model,
            tokens: providerOutput?.usage ?? emptyUsage,
          });
        }
      }

      throw new LlmGatewayError(
        lastError instanceof Error && lastError.message.includes("Structured output")
          ? "invalid_output"
          : "provider_unavailable",
        "Prompt enhancement failed. Preserve the original input and offer Retry.",
        true,
        { cause: lastError },
      );
    },
  };
}

export function createDefaultLlmGateway(options: {
  env?: PromptGenEnv;
  reporter?: LlmTraceReporter;
  adapters?: Partial<Record<"gemini", LlmProviderAdapter>>;
} = {}): LlmGateway {
  const env = options.env ?? loadPromptGenEnv();
  const registry = createLlmAdapterRegistry({
    adapters: {
      gemini: options.adapters?.gemini ?? createGeminiAdapter(),
    },
    config: defaultLlmGatewayRegistry,
  });
  const gatewayOptions: CreateLlmGatewayOptions = {
    registry,
  };

  if (env.llmProviderApiKey) {
    gatewayOptions.apiKey = env.llmProviderApiKey;
  }

  if (options.reporter) {
    gatewayOptions.reporter = options.reporter;
  }

  return createLlmGateway(gatewayOptions);
}

function normalizeEnhancementInput(input: PromptEnhancementInput): PromptEnhancementInput {
  const rawPrompt = input.raw_prompt.trim();

  if (!rawPrompt) {
    throw new LlmGatewayError("invalid_input", "raw_prompt is required.");
  }

  if (input.prompt_type !== "text") {
    throw new LlmGatewayError("invalid_input", "Only text prompt enhancement is supported at launch.");
  }

  if (
    input.mode !== "improve" &&
    input.mode !== "enhance" &&
    input.mode !== "shorten" &&
    input.mode !== "refine"
  ) {
    throw new LlmGatewayError("invalid_input", "Unsupported prompt enhancement mode.");
  }

  return {
    ...input,
    raw_prompt: rawPrompt,
    target_model: input.target_model.trim() || "auto",
  };
}

function estimateCost(model: LlmModelConfig, usage: ProviderTokenUsage): number {
  const uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);

  return (
    (uncachedInputTokens * model.pricing.inputPerMillionUsd +
      usage.cachedInputTokens * model.pricing.cachedInputPerMillionUsd +
      usage.outputTokens * model.pricing.outputPerMillionUsd) /
    1_000_000
  );
}
