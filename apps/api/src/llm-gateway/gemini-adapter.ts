import { promptEnhancementJsonSchema } from "./schema";
import { LlmProviderError } from "./errors";
import type { LlmProviderAdapter, ProviderGenerateInput, ProviderGenerateOutput } from "./types";

type FetchLike = typeof fetch;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export function createGeminiAdapter(options: { fetch?: FetchLike; timeoutMs?: number } = {}): LlmProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    provider: "gemini",
    async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
      if (!input.apiKey.trim()) {
        throw new LlmProviderError("missing_api_key", "Gemini API key is not configured.", false);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(buildGeminiGenerateUrl(input.model.id), {
          body: JSON.stringify(buildGeminiRequestBody(input)),
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": input.apiKey,
          },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new LlmProviderError(
            `gemini_http_${response.status}`,
            "Gemini structured-output request failed.",
            response.status >= 500 || response.status === 429,
          );
        }

        const payload = (await response.json()) as unknown;

        if (!isGeminiResponse(payload)) {
          throw new LlmProviderError("invalid_response", "Gemini returned an invalid response payload.");
        }

        const text = extractGeminiText(payload);

        if (!text.trim()) {
          throw new LlmProviderError("empty_response", "Gemini returned an empty response.");
        }

        return {
          result: JSON.parse(text) as unknown,
          text,
          usage: {
            cachedInputTokens: payload.usageMetadata?.cachedContentTokenCount ?? 0,
            inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: payload.usageMetadata?.totalTokenCount ?? 0,
          },
        };
      } catch (error) {
        if (error instanceof LlmProviderError) {
          throw error;
        }

        if (error instanceof SyntaxError) {
          throw new LlmProviderError("invalid_json", "Gemini returned invalid structured JSON.", true, {
            cause: error,
          });
        }

        throw new LlmProviderError("gemini_request_failed", "Gemini request failed.", true, {
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function buildGeminiRequestBody(input: ProviderGenerateInput): Record<string, unknown> {
  return {
    contents: [
      {
        role: "user",
        parts: input.staticParts.map((text) => ({ text })),
      },
      {
        role: "user",
        parts: [{ text: input.variablePart }],
      },
    ],
    generationConfig: {
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: promptEnhancementJsonSchema,
        },
      },
    },
  };
}

function buildGeminiGenerateUrl(modelId: string): string {
  const normalizedModelId = modelId.replace(/^models\//, "");
  return `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModelId}:generateContent`;
}

function extractGeminiText(payload: GeminiResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("");
}

function isGeminiResponse(value: unknown): value is GeminiResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
