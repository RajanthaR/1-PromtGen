import type { IncomingMessage, ServerResponse } from "node:http";

import type { HistoryUsagePort, RecordPromptOperationInput } from "@promptgen/history-usage";

import type { JsonLogger } from "./logger";

export const enhancementModes = ["improve", "enhance", "refine", "shorten"] as const;

export type EnhancementMode = (typeof enhancementModes)[number];

export interface EnhancementOutput {
  title: string;
  needs_clarification: boolean;
  questions: string[];
  enhanced_prompt: string;
  role: string;
  task: string;
  context: string;
  constraints: string[];
  format: string;
  tone: string;
  success_criteria: string[];
  explanation: string[];
  added: string[];
  removed: string[];
  changed: string[];
}

export interface EnhancementGatewayRequest {
  raw_prompt: string;
  mode: EnhancementMode;
  target_model: string;
  prompt_type: "text";
  options: Record<string, unknown>;
}

export interface EnhancementGatewayResult {
  result: unknown;
  meta: {
    provider: string;
    model: string;
    tokens: number;
    latency_ms: number;
    fellback: boolean;
  };
}

export interface EnhancementGateway {
  enhance(request: EnhancementGatewayRequest): Promise<EnhancementGatewayResult>;
}

export interface EnhancementHandlerDependencies {
  gateway: EnhancementGateway;
  history?: HistoryUsagePort;
  logger: JsonLogger;
}

interface EnhancementHttpRequest {
  raw_prompt: string;
  target_model: string;
  prompt_type: "text";
  options: Record<string, unknown>;
  user_id?: string;
}

interface ClarificationCheck {
  isThin: boolean;
  missingTask: boolean;
  missingAudienceOrGoal: boolean;
  questions: string[];
  placeholders: string[];
}

const requiredStringFields = [
  "title",
  "enhanced_prompt",
  "role",
  "task",
  "context",
  "format",
  "tone",
] as const;

const requiredStringArrayFields = [
  "questions",
  "constraints",
  "success_criteria",
  "explanation",
  "added",
  "removed",
  "changed",
] as const;

const taskVerbs = new Set([
  "analyze",
  "build",
  "compare",
  "compose",
  "create",
  "design",
  "draft",
  "enhance",
  "explain",
  "generate",
  "improve",
  "make",
  "plan",
  "review",
  "rewrite",
  "shorten",
  "summarize",
  "translate",
  "write",
]);

export function isEnhancementMode(value: string): value is EnhancementMode {
  return enhancementModes.includes(value as EnhancementMode);
}

export async function handleEnhancementRequest(
  request: IncomingMessage,
  response: ServerResponse,
  mode: EnhancementMode,
  dependencies: EnhancementHandlerDependencies,
): Promise<void> {
  if ((request.method ?? "GET") !== "POST") {
    writeJson(response, 405, { error: "method_not_allowed" });
    dependencies.logger.warn("api.enhancement_request", {
      mode,
      statusCode: 405,
    });
    return;
  }

  const parsedRequest = await parseEnhancementRequest(request);

  if ("error" in parsedRequest) {
    writeJson(response, 400, parsedRequest);
    dependencies.logger.warn("api.enhancement_request", {
      mode,
      statusCode: 400,
      error: parsedRequest.error,
    });
    return;
  }

  const userId = resolveUserId(request, parsedRequest);
  const clarification = analyzeClarificationNeed(parsedRequest.raw_prompt);
  const clarificationSkipped = isClarificationSkipped(parsedRequest.options);

  if (mode === "refine" && clarification.isThin && !clarificationSkipped) {
    const result = buildClarificationResult(parsedRequest.raw_prompt, clarification);
    await recordOperation({
      dependencies,
      enhancedPrompt: result.enhanced_prompt,
      gatewayMeta: null,
      input: parsedRequest,
      mode,
      userId,
    });
    writeJson(response, 200, {
      result,
      meta: {
        provider: null,
        model: null,
        tokens: 0,
        latency_ms: 0,
        fellback: false,
      },
    });
    dependencies.logger.info("api.enhancement_request", {
      mode,
      statusCode: 200,
      needsClarification: true,
    });
    return;
  }

  try {
    const gatewayResult = await dependencies.gateway.enhance({
      raw_prompt: parsedRequest.raw_prompt,
      mode,
      target_model: parsedRequest.target_model,
      prompt_type: parsedRequest.prompt_type,
      options: {
        ...parsedRequest.options,
        ...(mode === "refine" && clarificationSkipped
          ? {
              clarification_skipped: true,
              placeholders: clarification.placeholders,
            }
          : {}),
      },
    });
    const validation = validateEnhancementOutput(gatewayResult.result);

    if (!validation.valid) {
      writeJson(response, 502, {
        error: "invalid_gateway_output",
        message: validation.message,
        raw_prompt: parsedRequest.raw_prompt,
      });
      dependencies.logger.error("api.enhancement_request", {
        mode,
        statusCode: 502,
        error: "invalid_gateway_output",
      });
      return;
    }

    const result =
      mode === "refine" && clarificationSkipped
        ? applySkippedClarificationPlaceholders(validation.output, clarification.placeholders)
        : validation.output;

    await recordOperation({
      dependencies,
      enhancedPrompt: result.enhanced_prompt,
      gatewayMeta: gatewayResult.meta,
      input: parsedRequest,
      mode,
      userId,
    });

    writeJson(response, 200, {
      result,
      meta: gatewayResult.meta,
    });
    dependencies.logger.info("api.enhancement_request", {
      mode,
      statusCode: 200,
      needsClarification: result.needs_clarification,
      provider: gatewayResult.meta.provider,
      model: gatewayResult.meta.model,
      tokens: gatewayResult.meta.tokens,
      latencyMs: gatewayResult.meta.latency_ms,
      fellback: gatewayResult.meta.fellback,
    });
  } catch (error) {
    writeJson(response, 502, {
      error: "gateway_error",
      message: error instanceof Error ? error.message : "Gateway request failed.",
      raw_prompt: parsedRequest.raw_prompt,
    });
    dependencies.logger.error("api.enhancement_request", {
      mode,
      statusCode: 502,
      error: "gateway_error",
    });
  }
}

export function validateEnhancementOutput(
  value: unknown,
): { valid: true; output: EnhancementOutput } | { valid: false; message: string } {
  if (!isRecord(value)) {
    return { valid: false, message: "Gateway output must be an object." };
  }

  for (const field of requiredStringFields) {
    if (typeof value[field] !== "string") {
      return { valid: false, message: `Gateway output field '${field}' must be a string.` };
    }
  }

  if (typeof value.needs_clarification !== "boolean") {
    return {
      valid: false,
      message: "Gateway output field 'needs_clarification' must be a boolean.",
    };
  }

  for (const field of requiredStringArrayFields) {
    if (!isStringArray(value[field])) {
      return { valid: false, message: `Gateway output field '${field}' must be a string array.` };
    }
  }

  const questions = value.questions;
  const enhancedPrompt = value.enhanced_prompt;

  if (!isStringArray(questions) || typeof enhancedPrompt !== "string") {
    return { valid: false, message: "Gateway output failed schema validation." };
  }

  if (questions.length > 3) {
    return { valid: false, message: "Gateway output may include at most 3 questions." };
  }

  if (value.needs_clarification) {
    if (questions.length < 1) {
      return { valid: false, message: "Clarification output must include 1-3 questions." };
    }
  } else if (!enhancedPrompt.trim()) {
    return { valid: false, message: "Enhanced output must include enhanced_prompt." };
  }

  return { valid: true, output: value as unknown as EnhancementOutput };
}

export function analyzeClarificationNeed(rawPrompt: string): ClarificationCheck {
  const normalized = rawPrompt.trim().toLowerCase();
  const words = normalized.match(/[a-z0-9']+/g) ?? [];
  const shortInput = words.length < 12 || normalized.length < 80;
  const missingTask = !words.some((word) => taskVerbs.has(word));
  const missingAudienceOrGoal =
    !/\b(for|audience|users?|customers?|students?|developers?|team|goal|purpose|so that|to help|convert|persuade|teach|inform)\b/.test(
      normalized,
    );
  const isThin = shortInput && (missingTask || missingAudienceOrGoal);
  const questions: string[] = [];
  const placeholders: string[] = [];

  if (missingTask) {
    questions.push("What task should the enhanced prompt ask the model to perform?");
    placeholders.push("[TASK]");
  }

  if (missingAudienceOrGoal) {
    questions.push("Who is the prompt for, and what outcome should it optimize for?");
    placeholders.push("[AUDIENCE OR GOAL]");
  }

  if (shortInput) {
    questions.push("Are there any constraints, tone, or output format requirements to preserve?");
    placeholders.push("[CONSTRAINTS, TONE, OR FORMAT]");
  }

  return {
    isThin,
    missingTask,
    missingAudienceOrGoal,
    questions: questions.slice(0, 3),
    placeholders: placeholders.slice(0, 3),
  };
}

function buildClarificationResult(
  rawPrompt: string,
  clarification: ClarificationCheck,
): EnhancementOutput {
  return {
    title: "Clarify prompt details",
    needs_clarification: true,
    questions: clarification.questions,
    enhanced_prompt: "",
    role: "",
    task: clarification.missingTask ? "" : rawPrompt.trim(),
    context: "",
    constraints: [],
    format: "",
    tone: "",
    success_criteria: [],
    explanation: ["The input is too thin to enhance without guessing."],
    added: [],
    removed: [],
    changed: [],
  };
}

function applySkippedClarificationPlaceholders(
  output: EnhancementOutput,
  placeholders: string[],
): EnhancementOutput {
  const missingPlaceholders = placeholders.filter(
    (placeholder) =>
      !output.enhanced_prompt.includes(placeholder) &&
      !output.context.includes(placeholder) &&
      !output.task.includes(placeholder),
  );

  if (missingPlaceholders.length === 0) {
    return output;
  }

  const placeholderText = missingPlaceholders.join(", ");

  return {
    ...output,
    enhanced_prompt: `${output.enhanced_prompt.trim()}\n\nClarify before use: replace ${placeholderText} with the missing details.`.trim(),
    context: [output.context.trim(), `Missing details: ${placeholderText}.`]
      .filter(Boolean)
      .join(" "),
    constraints: [
      ...output.constraints,
      `Use explicit placeholders for skipped clarification details: ${placeholderText}.`,
    ],
    explanation: [
      ...output.explanation,
      "Skipped clarification was preserved with bracketed placeholders.",
    ],
    added: [...output.added, `Bracketed placeholders: ${placeholderText}.`],
  };
}

async function parseEnhancementRequest(
  request: IncomingMessage,
): Promise<EnhancementHttpRequest | { error: string; message: string; raw_prompt?: string }> {
  const body = await readJsonBody(request);

  if (!isRecord(body)) {
    return { error: "invalid_request", message: "Request body must be a JSON object." };
  }

  if (typeof body.raw_prompt !== "string") {
    return { error: "invalid_request", message: "raw_prompt is required." };
  }

  const rawPrompt = body.raw_prompt.trim();

  if (!rawPrompt) {
    return {
      error: "invalid_request",
      message: "raw_prompt must not be empty.",
      raw_prompt: body.raw_prompt,
    };
  }

  const promptType = body.prompt_type ?? "text";

  if (promptType !== "text") {
    return {
      error: "unsupported_prompt_type",
      message: "Only text prompts are supported at launch.",
      raw_prompt: rawPrompt,
    };
  }

  if (body.target_model !== undefined && typeof body.target_model !== "string") {
    return {
      error: "invalid_request",
      message: "target_model must be a string when provided.",
      raw_prompt: rawPrompt,
    };
  }

  if (body.options !== undefined && !isRecord(body.options)) {
    return {
      error: "invalid_request",
      message: "options must be an object when provided.",
      raw_prompt: rawPrompt,
    };
  }

  if (body.user_id !== undefined && typeof body.user_id !== "string") {
    return {
      error: "invalid_request",
      message: "user_id must be a string when provided.",
      raw_prompt: rawPrompt,
    };
  }

  const targetModel = typeof body.target_model === "string" ? body.target_model.trim() : "";
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";

  return {
    raw_prompt: rawPrompt,
    target_model: targetModel || "auto",
    prompt_type: "text",
    options: body.options ?? {},
    ...(userId ? { user_id: userId } : {}),
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function resolveUserId(request: IncomingMessage, input: EnhancementHttpRequest): string | null {
  const headerValue = request.headers["x-user-id"];

  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }

  if (Array.isArray(headerValue)) {
    const firstValue = headerValue.find((value) => value.trim());

    if (firstValue) {
      return firstValue.trim();
    }
  }

  return input.user_id ?? null;
}

function isClarificationSkipped(options: Record<string, unknown>): boolean {
  return options.skip_clarification === true || options.skipped_clarification === true;
}

async function recordOperation(input: {
  dependencies: EnhancementHandlerDependencies;
  enhancedPrompt: string;
  gatewayMeta: EnhancementGatewayResult["meta"] | null;
  input: EnhancementHttpRequest;
  mode: EnhancementMode;
  userId: string | null;
}): Promise<void> {
  if (!input.dependencies.history || !input.userId) {
    return;
  }

  const operation: RecordPromptOperationInput = {
    original: input.input.raw_prompt,
    enhanced: input.enhancedPrompt,
    mode: input.mode,
    targetModel: input.input.target_model,
    promptType: input.input.prompt_type,
    saved: false,
    ...(input.gatewayMeta
      ? {
          tokens: input.gatewayMeta.tokens,
          provider: input.gatewayMeta.provider,
          model: input.gatewayMeta.model,
          latencyMs: input.gatewayMeta.latency_ms,
        }
      : {}),
  };

  await input.dependencies.history.recordPromptOperation(input.userId, operation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
