import { promptEnhancementJsonSchema } from "./schema";
import { LlmProviderError } from "./errors";
import type { LlmProviderAdapter, ProviderGenerateInput, ProviderGenerateOutput } from "./types";

type FetchLike = typeof fetch;

interface OpenAIResponse {
  error?: {
    message?: string;
    type?: string;
  };
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
      refusal?: string;
    }>;
    type?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

export function createOpenAIAdapter(
  options: { fetch?: FetchLike; timeoutMs?: number } = {},
): LlmProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    provider: "openai",
    async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
      if (!input.apiKey.trim()) {
        throw new LlmProviderError("missing_api_key", "OpenAI API key is not configured.", false);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          body: JSON.stringify(buildOpenAIResponsesRequestBody(input)),
          headers: {
            authorization: `Bearer ${input.apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new LlmProviderError(
            `openai_http_${response.status}`,
            "OpenAI structured-output request failed.",
            response.status >= 500 || response.status === 429,
          );
        }

        const payload = (await response.json()) as unknown;

        if (!isOpenAIResponse(payload)) {
          throw new LlmProviderError(
            "invalid_response",
            "OpenAI returned an invalid response payload.",
          );
        }

        if (payload.error) {
          throw new LlmProviderError(
            payload.error.type ?? "openai_error",
            payload.error.message ?? "OpenAI returned an error response.",
            true,
          );
        }

        const text = extractOpenAIText(payload);

        if (!text.trim()) {
          throw new LlmProviderError("empty_response", "OpenAI returned an empty response.");
        }

        return {
          result: JSON.parse(text) as unknown,
          text,
          usage: {
            cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
            inputTokens: payload.usage?.input_tokens ?? 0,
            outputTokens: payload.usage?.output_tokens ?? 0,
            totalTokens: payload.usage?.total_tokens ?? 0,
          },
        };
      } catch (error) {
        if (error instanceof LlmProviderError) {
          throw error;
        }

        if (error instanceof SyntaxError) {
          throw new LlmProviderError(
            "invalid_json",
            "OpenAI returned invalid structured JSON.",
            true,
            {
              cause: error,
            },
          );
        }

        throw new LlmProviderError("openai_request_failed", "OpenAI request failed.", true, {
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function buildOpenAIResponsesRequestBody(
  input: ProviderGenerateInput,
): Record<string, unknown> {
  return {
    input: input.variablePart,
    instructions: input.staticParts.join("\n\n"),
    model: input.model.id,
    store: false,
    text: {
      format: {
        name: input.schemaName ?? "promptgen_structured_output",
        schema: input.responseSchema ?? promptEnhancementJsonSchema,
        strict: true,
        type: "json_schema",
      },
    },
  };
}

function extractOpenAIText(payload: OpenAIResponse): string {
  const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  const refusal = content.find((item) => item.type === "refusal" && item.refusal)?.refusal;

  if (refusal) {
    throw new LlmProviderError(
      "openai_refusal",
      "OpenAI refused the structured-output request.",
      false,
    );
  }

  return content
    .filter((item) => item.type === "output_text" || item.text)
    .map((item) => item.text ?? "")
    .join("");
}

function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
