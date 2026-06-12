import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { defaultLlmGatewayRegistry, type LlmModelConfig } from "@promptgen/config/llm";
import { buildPromptQualityJudgePrompt } from "@promptgen/prompt-engine";

import {
  createLlmResultCacheKey,
  defaultLlmResultCacheTtlSeconds,
  type LlmResultCache,
} from "./cache";
import { LlmGatewayError, toSafeErrorCode } from "./errors";
import { createGeminiAdapter } from "./gemini-adapter";
import { createOpenAIAdapter } from "./openai-adapter";
import { buildStaticFirstPromptParts } from "./prompt-layout";
import { createLlmAdapterRegistry, type LlmAdapterRegistry } from "./registry";
import {
  promptQualityJudgeJsonSchema,
  validatePromptEnhancementResult,
  validatePromptQualityJudgeResult,
} from "./schema";
import { detectSecrets } from "./secrets";
import { screenPromptEnhancementOutput } from "./output-screening";
import type {
  LlmProviderAdapter,
  LlmGatewayCacheMeta,
  LlmGatewayMeta,
  LlmTraceReporter,
  PromptEnhancementInput,
  PromptEnhancementOutput,
  PromptQualityJudgeInput,
  PromptQualityJudgeOutput,
  ProviderGenerateOutput,
  ProviderTokenUsage,
} from "./types";

export interface LlmGateway {
  enhance(input: PromptEnhancementInput): Promise<PromptEnhancementOutput>;
  judge(input: PromptQualityJudgeInput): Promise<PromptQualityJudgeOutput>;
}

export interface CreateLlmGatewayOptions {
  apiKey?: string;
  clock?: () => number;
  judgeApiKey?: string;
  registry: LlmAdapterRegistry;
  reporter?: LlmTraceReporter;
  resultCache?: LlmResultCache;
  resultCacheTtlSeconds?: number;
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
  const resultCache = options.resultCache;
  const resultCacheTtlSeconds = options.resultCacheTtlSeconds ?? defaultLlmResultCacheTtlSeconds;

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

      const primaryModel = options.registry.resolveGenerationModel(normalizedInput.target_model);
      const apiKey = resolveEnhancementApiKey(normalizedInput, primaryModel, options.apiKey);
      const fallbackModel = options.registry.resolveFallbackModel(primaryModel);
      const resultCacheKey = resultCache
        ? createLlmResultCacheKey({ input: normalizedInput, modelId: primaryModel.id })
        : null;
      const cachedOutput =
        resultCache && resultCacheKey ? await resultCache.get(resultCacheKey) : null;

      if (cachedOutput) {
        const meta = createResultCacheHitMeta(cachedOutput.meta);

        await reporter?.recordLlmCall({
          attempt: 0,
          cache: meta.cache,
          cost_usd: 0,
          fellback: meta.fellback,
          latency_ms: 0,
          mode: normalizedInput.mode,
          model: meta.model,
          prompt_type: normalizedInput.prompt_type,
          provider: meta.provider,
          success: true,
          target_model: normalizedInput.target_model,
          tokens: emptyUsage,
        });

        return {
          result: cachedOutput.result,
          meta,
        };
      }

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
          const cache = createProviderCacheMeta(providerOutput.usage);
          const meta: LlmGatewayMeta & { cache: LlmGatewayCacheMeta } = {
            cache,
            fellback: attempt.fellback,
            latency_ms: latencyMs,
            model: attempt.model.id,
            provider: attempt.model.provider,
            tokens: providerOutput.usage.totalTokens,
          };

          await reporter?.recordLlmCall({
            attempt: attempt.attempt,
            cache,
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

          if (resultCacheKey) {
            await writeResultCache(
              resultCache,
              resultCacheKey,
              { result, meta },
              resultCacheTtlSeconds,
            );
          }

          return {
            result,
            meta,
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
    async judge(input): Promise<PromptQualityJudgeOutput> {
      const normalizedInput = normalizeJudgeInput(input);
      const secretFindings = [
        ...detectSecrets(normalizedInput.raw_prompt),
        ...detectSecrets(normalizedInput.enhanced_prompt),
      ];

      if (secretFindings.length > 0) {
        throw new LlmGatewayError(
          "secret_detected",
          "Prompt appears to contain credentials. Remove secrets before quality judge review.",
        );
      }

      const apiKey = options.judgeApiKey?.trim();
      if (!apiKey) {
        throw new LlmGatewayError(
          "configuration_error",
          "LLM judge provider API key is not configured.",
        );
      }

      const judgeModel = options.registry.resolveJudgeModel(normalizedInput.generator_model);
      const adapter = options.registry.adapterFor(judgeModel.provider);
      const startedAt = clock();
      let providerOutput: ProviderGenerateOutput | null = null;

      try {
        providerOutput = await adapter.generate({
          apiKey,
          model: judgeModel,
          responseSchema: promptQualityJudgeJsonSchema,
          schemaName: "promptgen_quality_judge_suggestions",
          ...buildPromptQualityJudgePrompt({
            enhancedPrompt: normalizedInput.enhanced_prompt,
            generatorModel: normalizedInput.generator_model,
            rawPrompt: normalizedInput.raw_prompt,
            targetModel: normalizedInput.target_model,
          }),
        });
        const result = validatePromptQualityJudgeResult(providerOutput.result);
        const latencyMs = Math.max(0, Math.round(clock() - startedAt));
        const cache = createProviderCacheMeta(providerOutput.usage);
        const meta: LlmGatewayMeta & { cache: LlmGatewayCacheMeta } = {
          cache,
          fellback: false,
          latency_ms: latencyMs,
          model: judgeModel.id,
          provider: judgeModel.provider,
          tokens: providerOutput.usage.totalTokens,
        };

        await reporter?.recordLlmCall({
          attempt: 1,
          cache,
          cost_usd: estimateCost(judgeModel, providerOutput.usage),
          fellback: false,
          latency_ms: latencyMs,
          mode: "quality_judge",
          model: judgeModel.id,
          prompt_type: normalizedInput.prompt_type,
          provider: judgeModel.provider,
          success: true,
          target_model: normalizedInput.target_model,
          tokens: providerOutput.usage,
        });

        return {
          result,
          meta,
        };
      } catch (error) {
        const latencyMs = Math.max(0, Math.round(clock() - startedAt));

        await reporter?.recordLlmCall({
          attempt: 1,
          cost_usd: estimateCost(judgeModel, providerOutput?.usage ?? emptyUsage),
          error_code: toSafeErrorCode(error),
          fellback: false,
          latency_ms: latencyMs,
          mode: "quality_judge",
          model: judgeModel.id,
          prompt_type: normalizedInput.prompt_type,
          provider: judgeModel.provider,
          success: false,
          target_model: normalizedInput.target_model,
          tokens: providerOutput?.usage ?? emptyUsage,
        });

        throw new LlmGatewayError(
          error instanceof Error && error.message.includes("Structured judge output")
            ? "invalid_output"
            : "provider_unavailable",
          "Prompt quality judge failed. Keep the heuristic checklist visible.",
          true,
          { cause: error },
        );
      }
    },
  };
}

export function createDefaultLlmGateway(
  options: {
    env?: PromptGenEnv;
    reporter?: LlmTraceReporter;
    resultCache?: LlmResultCache;
    resultCacheTtlSeconds?: number;
    adapters?: Partial<Record<"gemini" | "openai", LlmProviderAdapter>>;
  } = {},
): LlmGateway {
  const env = options.env ?? loadPromptGenEnv();
  const registry = createLlmAdapterRegistry({
    adapters: {
      gemini: options.adapters?.gemini ?? createGeminiAdapter(),
      openai: options.adapters?.openai ?? createOpenAIAdapter(),
    },
    config: defaultLlmGatewayRegistry,
  });
  const gatewayOptions: CreateLlmGatewayOptions = {
    registry,
  };

  if (env.llmProviderApiKey) {
    gatewayOptions.apiKey = env.llmProviderApiKey;
  }

  if (env.llmJudgeProviderApiKey) {
    gatewayOptions.judgeApiKey = env.llmJudgeProviderApiKey;
  }

  if (options.reporter) {
    gatewayOptions.reporter = options.reporter;
  }

  if (options.resultCache) {
    gatewayOptions.resultCache = options.resultCache;
  }

  if (options.resultCacheTtlSeconds !== undefined) {
    gatewayOptions.resultCacheTtlSeconds = options.resultCacheTtlSeconds;
  }

  return createLlmGateway(gatewayOptions);
}

function normalizeEnhancementInput(input: PromptEnhancementInput): PromptEnhancementInput {
  const rawPrompt = input.raw_prompt.trim();

  if (!rawPrompt) {
    throw new LlmGatewayError("invalid_input", "raw_prompt is required.");
  }

  if (input.prompt_type !== "text") {
    throw new LlmGatewayError(
      "invalid_input",
      "Only text prompt enhancement is supported at launch.",
    );
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

function resolveEnhancementApiKey(
  input: PromptEnhancementInput,
  primaryModel: LlmModelConfig,
  platformApiKey: string | undefined,
): string {
  if (input.provider_credential) {
    if (input.provider_credential.provider !== primaryModel.provider) {
      throw new LlmGatewayError(
        "configuration_error",
        "BYO provider key does not match the selected model provider.",
      );
    }

    const apiKey = input.provider_credential.apiKey.trim();

    if (!apiKey) {
      throw new LlmGatewayError("configuration_error", "BYO provider API key is empty.");
    }

    return apiKey;
  }

  const apiKey = platformApiKey?.trim();

  if (!apiKey) {
    throw new LlmGatewayError("configuration_error", "LLM provider API key is not configured.");
  }

  return apiKey;
}

function normalizeJudgeInput(input: PromptQualityJudgeInput): PromptQualityJudgeInput {
  const rawPrompt = input.raw_prompt.trim();
  const enhancedPrompt = input.enhanced_prompt.trim();

  if (!rawPrompt) {
    throw new LlmGatewayError("invalid_input", "raw_prompt is required.");
  }

  if (!enhancedPrompt) {
    throw new LlmGatewayError("invalid_input", "enhanced_prompt is required.");
  }

  if (input.prompt_type !== "text") {
    throw new LlmGatewayError(
      "invalid_input",
      "Only text prompt quality judging is supported at launch.",
    );
  }

  return {
    ...input,
    enhanced_prompt: enhancedPrompt,
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

function createProviderCacheMeta(usage: ProviderTokenUsage): LlmGatewayCacheMeta {
  const cachedInputTokens = Math.max(0, usage.cachedInputTokens);

  return {
    cached_input_tokens: cachedInputTokens,
    input_tokens: usage.inputTokens,
    input_tokens_saved: cachedInputTokens,
    provider_cache_hit: cachedInputTokens > 0,
    result_cache_hit: false,
  };
}

function createResultCacheHitMeta(meta: LlmGatewayMeta): LlmGatewayMeta & {
  cache: LlmGatewayCacheMeta;
} {
  const originalCacheMeta = meta.cache;
  const inputTokensSaved = originalCacheMeta?.input_tokens ?? meta.tokens;

  return {
    ...meta,
    cache: {
      cached_input_tokens: 0,
      input_tokens: 0,
      input_tokens_saved: inputTokensSaved,
      provider_cache_hit: originalCacheMeta?.provider_cache_hit ?? false,
      result_cache_hit: true,
    },
    latency_ms: 0,
    tokens: 0,
  };
}

async function writeResultCache(
  resultCache: LlmResultCache | undefined,
  key: string,
  output: PromptEnhancementOutput,
  ttlSeconds: number,
): Promise<void> {
  try {
    await resultCache?.set(key, output, ttlSeconds);
  } catch {
    return undefined;
  }
}
