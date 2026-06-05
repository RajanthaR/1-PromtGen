export type LlmProviderId = "gemini";

export type LlmModelRole = "primary" | "secondary";

export interface LlmModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
}

export interface LlmModelConfig {
  id: string;
  provider: LlmProviderId;
  role: LlmModelRole;
  enabled: boolean;
  supportsStructuredOutput: boolean;
  pricing: LlmModelPricing;
}

export interface LlmGatewayRegistryConfig {
  defaultModelId: string;
  fallbackModelId?: string;
  models: LlmModelConfig[];
}

export const defaultLlmGatewayRegistry = {
  defaultModelId: "gemini-3.5-flash",
  fallbackModelId: "gemini-2.5-flash-lite",
  models: [
    {
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
  ],
} satisfies LlmGatewayRegistryConfig;

