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
  adapterFor(provider: LlmProviderId): LlmProviderAdapter;
}

export function createLlmAdapterRegistry(options: {
  adapters: Partial<Record<LlmProviderId, LlmProviderAdapter>>;
  config?: LlmGatewayRegistryConfig;
}): LlmAdapterRegistry {
  const config = options.config ?? defaultLlmGatewayRegistry;
  const models = new Map(config.models.filter((model) => model.enabled).map((model) => [model.id, model]));

  return {
    resolveGenerationModel(targetModel) {
      const normalizedTarget = targetModel.trim();
      const configuredModel =
        normalizedTarget && normalizedTarget !== "auto" && normalizedTarget !== "gemini"
          ? models.get(normalizedTarget)
          : undefined;
      const model = configuredModel ?? models.get(config.defaultModelId);

      if (!model) {
        throw new LlmGatewayError("configuration_error", "No enabled launch LLM model is configured.");
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

