import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { defaultLlmGatewayRegistry, type LlmModelConfig } from "@promptgen/config/llm";
import { buildPromptQualityJudgePrompt } from "@promptgen/prompt-engine";

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

        await reporter?.recordLlmCall({
          attempt: 1,
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
          meta: {
            fellback: false,
            latency_ms: latencyMs,
            model: judgeModel.id,
            provider: judgeModel.provider,
            tokens: providerOutput.usage.totalTokens,
          },
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
