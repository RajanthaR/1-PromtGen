import type {
  EnhancementErrorBody,
  EnhancementHttpRequest,
  EnhancementMeta,
  EnhancementQualityJudge,
  EnhancementRequestOptions,
  EnhancementRequestPayload,
  EnhancementResponse,
  EnhancementResult,
} from "./types";

export const enhancementProgressText = "Structuring your prompt…";

export type EnhancementProgressEvent = {
  type: "progress";
  statusText: typeof enhancementProgressText;
};

export type EnhancementSuccessEvent = {
  type: "success";
  response: EnhancementResponse;
};

export type EnhancementErrorEvent = {
  type: "error";
  error: EnhancementClientError;
};

export type EnhancementStreamEvent =
  | EnhancementProgressEvent
  | EnhancementSuccessEvent
  | EnhancementErrorEvent;

export interface EnhancementClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface EnhancementRequestOptionsInit {
  signal?: AbortSignal;
  onProgress?: (event: EnhancementProgressEvent) => void;
}

export class EnhancementClientError extends Error {
  readonly code: string;
  readonly rawPrompt?: string;
  readonly status?: number;

  constructor(input: { code: string; message: string; rawPrompt?: string; status?: number }) {
    super(input.message);
    this.name = "EnhancementClientError";
    this.code = input.code;

    if (input.rawPrompt !== undefined) {
      this.rawPrompt = input.rawPrompt;
    }

    if (input.status !== undefined) {
      this.status = input.status;
    }
  }
}

export interface EnhancementClient {
  enhance(
    payload: EnhancementRequestPayload,
    options?: EnhancementRequestOptionsInit,
  ): Promise<EnhancementResponse>;
  stream(
    payload: EnhancementRequestPayload,
    options?: Omit<EnhancementRequestOptionsInit, "onProgress">,
  ): AsyncGenerator<EnhancementStreamEvent, EnhancementResponse | undefined, void>;
}

export function createEnhancementClient(options: EnhancementClientOptions = {}): EnhancementClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "";

  return {
    async enhance(payload, requestOptions = {}) {
      requestOptions.onProgress?.({ type: "progress", statusText: enhancementProgressText });

      const requestInit: RequestInit = {
        body: JSON.stringify(buildEnhancementHttpRequest(payload)),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
      };
      const response = await fetchImpl(buildEnhancementUrl(baseUrl, payload.mode), requestInit);

      const body = await readJsonResponse(response);

      if (!response.ok) {
        throw buildHttpError(body, response.status, payload.rawPrompt);
      }

      return parseEnhancementResponse(body, payload.rawPrompt);
    },

    async *stream(payload, requestOptions = {}) {
      yield { type: "progress", statusText: enhancementProgressText };

      try {
        const response = await this.enhance(
          payload,
          requestOptions.signal ? { signal: requestOptions.signal } : {},
        );
        yield { type: "success", response };
        return response;
      } catch (error) {
        const clientError = toEnhancementClientError(error, payload.rawPrompt);
        yield { type: "error", error: clientError };
        return undefined;
      }
    },
  };
}

export function buildEnhancementHttpRequest(
  payload: EnhancementRequestPayload,
): EnhancementHttpRequest {
  const options = buildEnhancementOptions(payload);

  return {
    raw_prompt: payload.rawPrompt,
    target_model: payload.targetModel,
    prompt_type: "text",
    options,
    ...(payload.userId ? { user_id: payload.userId } : {}),
  };
}

export function getFallbackModelLabel(response: EnhancementResponse): string | null {
  return response.meta.fellback ? response.meta.model : null;
}

function buildEnhancementUrl(baseUrl: string, mode: EnhancementRequestPayload["mode"]): string {
  const trimmedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${trimmedBaseUrl}/enhance/${mode}`;
}

function buildEnhancementOptions(payload: EnhancementRequestPayload): EnhancementRequestOptions {
  const options: EnhancementRequestOptions = { ...(payload.options ?? {}) };

  if (payload.tone && options.tone === undefined) {
    options.tone = payload.tone;
  }

  if (payload.selectedContextSnippets !== undefined) {
    options.context_ids = payload.selectedContextSnippets.map((snippet) => snippet.id);
    options.context_snippets = payload.selectedContextSnippets.map((snippet) => snippet.body);
  }

  return options;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EnhancementClientError({
      code: "invalid_response",
      message: "Enhancement API returned invalid JSON.",
      status: response.status,
    });
  }
}

function buildHttpError(
  body: unknown,
  status: number,
  fallbackRawPrompt: string,
): EnhancementClientError {
  if (isEnhancementErrorBody(body)) {
    return new EnhancementClientError({
      code: body.error,
      message: body.message,
      rawPrompt: body.raw_prompt ?? fallbackRawPrompt,
      status,
    });
  }

  return new EnhancementClientError({
    code: "http_error",
    message: `Enhancement API request failed with status ${status}.`,
    rawPrompt: fallbackRawPrompt,
    status,
  });
}

function toEnhancementClientError(error: unknown, rawPrompt: string): EnhancementClientError {
  if (error instanceof EnhancementClientError) {
    return error.rawPrompt === undefined
      ? new EnhancementClientError({
          code: error.code,
          message: error.message,
          rawPrompt,
          ...(error.status !== undefined ? { status: error.status } : {}),
        })
      : error;
  }

  return new EnhancementClientError({
    code: "network_error",
    message: error instanceof Error ? error.message : "Enhancement request failed.",
    rawPrompt,
  });
}

function parseEnhancementResponse(body: unknown, rawPrompt: string): EnhancementResponse {
  if (!isRecord(body)) {
    throw invalidResponse("Enhancement API response must be an object.", rawPrompt);
  }

  const result = parseEnhancementResult(body.result, rawPrompt);
  const meta = parseEnhancementMeta(body.meta, rawPrompt);

  if (!isRecord(body.quality_checklist)) {
    throw invalidResponse("Enhancement API response must include quality_checklist.", rawPrompt);
  }

  const response: EnhancementResponse = {
    result,
    quality_checklist:
      body.quality_checklist as unknown as EnhancementResponse["quality_checklist"],
    meta,
  };

  if (body.quality_judge !== undefined) {
    response.quality_judge = parseQualityJudge(body.quality_judge, rawPrompt);
  }

  return response;
}

function parseEnhancementResult(value: unknown, rawPrompt: string): EnhancementResult {
  if (!isRecord(value)) {
    throw invalidResponse("Enhancement API result must be an object.", rawPrompt);
  }

  const stringFields = [
    "title",
    "enhanced_prompt",
    "role",
    "task",
    "context",
    "format",
    "tone",
  ] as const;

  const arrayFields = [
    "questions",
    "constraints",
    "success_criteria",
    "explanation",
    "added",
    "removed",
    "changed",
  ] as const;

  for (const field of stringFields) {
    if (typeof value[field] !== "string") {
      throw invalidResponse(`Enhancement API result field '${field}' must be a string.`, rawPrompt);
    }
  }

  if (typeof value.needs_clarification !== "boolean") {
    throw invalidResponse(
      "Enhancement API result field 'needs_clarification' must be a boolean.",
      rawPrompt,
    );
  }

  for (const field of arrayFields) {
    if (!isStringArray(value[field])) {
      throw invalidResponse(
        `Enhancement API result field '${field}' must be a string array.`,
        rawPrompt,
      );
    }
  }

  return value as unknown as EnhancementResult;
}

function parseEnhancementMeta(value: unknown, rawPrompt: string): EnhancementMeta {
  if (!isRecord(value)) {
    throw invalidResponse("Enhancement API meta must be an object.", rawPrompt);
  }

  if (
    !isNullableString(value.provider) ||
    !isNullableString(value.model) ||
    typeof value.tokens !== "number" ||
    typeof value.latency_ms !== "number" ||
    typeof value.fellback !== "boolean"
  ) {
    throw invalidResponse("Enhancement API meta has an unexpected shape.", rawPrompt);
  }

  return value as unknown as EnhancementMeta;
}

function parseQualityJudge(value: unknown, rawPrompt: string): EnhancementQualityJudge {
  if (!isRecord(value)) {
    throw invalidResponse("Enhancement API quality_judge must be an object.", rawPrompt);
  }

  if (value.enabled === false && value.status === "disabled" && isEmptyArray(value.suggestions)) {
    return value as EnhancementQualityJudge;
  }

  if (value.enabled !== true || typeof value.status !== "string") {
    throw invalidResponse("Enhancement API quality_judge has an unexpected shape.", rawPrompt);
  }

  return value as EnhancementQualityJudge;
}

function invalidResponse(message: string, rawPrompt: string): EnhancementClientError {
  return new EnhancementClientError({
    code: "invalid_response",
    message,
    rawPrompt,
  });
}

function isEnhancementErrorBody(value: unknown): value is EnhancementErrorBody {
  return (
    isRecord(value) &&
    typeof value.error === "string" &&
    typeof value.message === "string" &&
    (value.raw_prompt === undefined || typeof value.raw_prompt === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEmptyArray(value: unknown): value is [] {
  return Array.isArray(value) && value.length === 0;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}
