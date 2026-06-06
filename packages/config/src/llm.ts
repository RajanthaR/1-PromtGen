export type LlmProviderId = "gemini" | "openai";

export type LlmModelFamily = "gemini" | "openai";

export type LlmModelRole = "primary" | "secondary" | "judge";

export interface LlmModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
}

export interface LlmModelConfig {
  id: string;
  family: LlmModelFamily;
  provider: LlmProviderId;
  role: LlmModelRole;
  enabled: boolean;
  supportsStructuredOutput: boolean;
  pricing: LlmModelPricing;
}

export interface LlmGatewayRegistryConfig {
  defaultModelId: string;
  fallbackModelId?: string;
  judgeModelId?: string;
  models: LlmModelConfig[];
}

export const defaultLlmGatewayRegistry = {
  defaultModelId: "gemini-3.5-flash",
  fallbackModelId: "gemini-2.5-flash-lite",
  judgeModelId: "gpt-5.4",
  models: [
    {
      family: "gemini",
      id: "gemini-3.5-flash",
      provider: "gemini",
      role: "primary",
      enabled: true,
      supportsStructuredOutput: true,
      pricing: {
        inputPerMillionUsd: 1.5,
        outputPerMillionUsd: 9,
        cachedInputPerMillionUsd: 0.15,
      },
    },
    {
      family: "gemini",
      id: "gemini-2.5-flash-lite",
      provider: "gemini",
      role: "secondary",
      enabled: true,
      supportsStructuredOutput: true,
      pricing: {
        inputPerMillionUsd: 0.1,
        outputPerMillionUsd: 0.4,
        cachedInputPerMillionUsd: 0.01,
      },
    },
    {
      family: "openai",
      id: "gpt-5.4",
      provider: "openai",
      role: "judge",
      enabled: true,
      supportsStructuredOutput: true,
      pricing: {
        inputPerMillionUsd: 0,
        outputPerMillionUsd: 0,
        cachedInputPerMillionUsd: 0,
      },
    },
  ],
} satisfies LlmGatewayRegistryConfig;
