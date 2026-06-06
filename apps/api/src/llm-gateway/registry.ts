import {
  defaultLlmGatewayRegistry,
  type LlmGatewayRegistryConfig,
  type LlmModelConfig,
  type LlmProviderId,
} from "@promptgen/config/llm";

import { LlmGatewayError } from "./errors";
import type { LlmProviderAdapter } from "./types";

export interface LlmAdapterRegistry {
  resolveGenerationModel(targetModel: string): LlmModelConfig;
  resolveFallbackModel(primaryModel: LlmModelConfig): LlmModelConfig | null;
  resolveJudgeModel(generatorModelId: string): LlmModelConfig;
  adapterFor(provider: LlmProviderId): LlmProviderAdapter;
}

export function createLlmAdapterRegistry(options: {
  adapters: Partial<Record<LlmProviderId, LlmProviderAdapter>>;
  config?: LlmGatewayRegistryConfig;
}): LlmAdapterRegistry {
  const config = options.config ?? defaultLlmGatewayRegistry;
  const models = new Map(
    config.models.filter((model) => model.enabled).map((model) => [model.id, model]),
  );

  return {
    resolveGenerationModel(targetModel) {
      const normalizedTarget = targetModel.trim();
      const configuredModel =
        normalizedTarget && normalizedTarget !== "auto" && normalizedTarget !== "gemini"
          ? models.get(normalizedTarget)
          : undefined;
      const model = configuredModel ?? models.get(config.defaultModelId);

      if (!model) {
        throw new LlmGatewayError(
          "configuration_error",
          "No enabled launch LLM model is configured.",
        );
      }

      if (!model.supportsStructuredOutput) {
        throw new LlmGatewayError(
          "configuration_error",
          `Configured model ${model.id} does not support structured output.`,
        );
      }

      return model;
    },
    resolveFallbackModel(primaryModel) {
      if (!config.fallbackModelId || config.fallbackModelId === primaryModel.id) {
        return null;
      }

      const fallbackModel = models.get(config.fallbackModelId);

      if (!fallbackModel || fallbackModel.provider !== primaryModel.provider) {
        return null;
      }

      return fallbackModel.supportsStructuredOutput ? fallbackModel : null;
    },
    resolveJudgeModel(generatorModelId) {
      if (!config.judgeModelId) {
        throw new LlmGatewayError(
          "configuration_error",
          "No quality judge LLM model is configured.",
        );
      }

      const judgeModel = models.get(config.judgeModelId);

      if (!judgeModel) {
        throw new LlmGatewayError(
          "configuration_error",
          "Configured quality judge model is not enabled.",
        );
      }

      if (!judgeModel.supportsStructuredOutput) {
        throw new LlmGatewayError(
          "configuration_error",
          `Configured judge model ${judgeModel.id} does not support structured output.`,
        );
      }

      const generatorModel = models.get(generatorModelId);

      if (generatorModel && generatorModel.family === judgeModel.family) {
        throw new LlmGatewayError(
          "configuration_error",
          "Quality judge model family must differ from the generator model family.",
        );
      }

      if (!generatorModel && inferModelFamily(generatorModelId) === judgeModel.family) {
        throw new LlmGatewayError(
          "configuration_error",
          "Quality judge model family must differ from the generator model family.",
        );
      }

      return judgeModel;
    },
    adapterFor(provider) {
      const adapter = options.adapters[provider];

      if (!adapter) {
        throw new LlmGatewayError(
          "configuration_error",
          `No LLM adapter is registered for provider ${provider}.`,
        );
      }

      return adapter;
    },
  };
}

function inferModelFamily(modelId: string): LlmModelConfig["family"] | null {
  const normalized = modelId.toLowerCase();

  if (normalized.startsWith("gemini")) {
    return "gemini";
  }

  if (normalized.startsWith("gpt") || normalized.startsWith("o")) {
    return "openai";
  }

  return null;
}
