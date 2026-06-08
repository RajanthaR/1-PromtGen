import type { IncomingMessage, ServerResponse } from "node:http";

import type { HistoryUsagePort, RecordPromptOperationInput } from "@promptgen/history-usage";

import { LlmGatewayError } from "./llm-gateway";
import type { JsonLogger } from "./logger";
import type { PromptStructureChecklist } from "./quality-checklist";
import { evaluatePromptStructure } from "./quality-checklist";

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

export interface EnhancementQualityChecklist {
  before: PromptStructureChecklist;
  after: PromptStructureChecklist;
}

export interface EnhancementGatewayRequest {
  raw_prompt: string;
  mode: EnhancementMode;
  target_model: string;
  prompt_type: "text";
  options: Record<string, unknown>;
}

export interface EnhancementSelectedContextSnippet {
  id: string;
  title: string;
  body: string;
}

export interface EnhancementContextPort {
  listSelectedSnippets(
    userId: string,
    snippetIds: string[],
  ): Promise<EnhancementSelectedContextSnippet[]>;
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

export interface EnhancementJudgeGatewayRequest {
  raw_prompt: string;
  enhanced_prompt: string;
  target_model: string;
  generator_provider: string;
  generator_model: string;
  prompt_type: "text";
}

export interface EnhancementJudgeSuggestion {
  dimension: string;
  weakness: string;
  improvement: string;
}

export interface EnhancementJudgeGatewayResult {
  result: {
    summary: string;
    suggestions: EnhancementJudgeSuggestion[];
  };
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
  judge?(request: EnhancementJudgeGatewayRequest): Promise<EnhancementJudgeGatewayResult>;
}

export interface EnhancementHandlerDependencies {
  context?: EnhancementContextPort;
  gateway: EnhancementGateway;
  history?: HistoryUsagePort;
  llmJudgeEnabled?: boolean;
  logger: JsonLogger;
}

interface EnhancementHttpRequest {
  raw_prompt: string;
  target_model: string;
  prompt_type: "text";
  options: Record<string, unknown>;
  user_id?: string;
}

type EnhancementJudgeResponse =
  | {
      enabled: false;
      status: "disabled";
      suggestions: [];
    }
  | {
      enabled: true;
      status: "completed";
      summary: string;
      suggestions: EnhancementJudgeSuggestion[];
      meta: EnhancementJudgeGatewayResult["meta"];
    }
  | {
      enabled: true;
      status: "failed" | "unavailable";
      suggestions: [];
      error: "judge_failed" | "judge_not_configured";
    };

type ContextResolutionResult =
  | {
      ok: true;
      snippets: EnhancementSelectedContextSnippet[];
    }
  | {
      ok: false;
      statusCode: 400 | 503;
      body: {
        error: string;
        message: string;
        raw_prompt: string;
      };
    };

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

const maxRequestBodyBytes = 1024 * 1024;

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
    const qualityChecklist = buildQualityChecklist(
      parsedRequest.raw_prompt,
      result.enhanced_prompt,
    );
    await recordOperation({
      dependencies,
      enhancedPrompt: result.enhanced_prompt,
      gatewayMeta: null,
      input: parsedRequest,
      mode,
      qualityChecklist,
      userId,
    });
    writeJson(response, 200, {
      result,
      quality_checklist: qualityChecklist,
      used_context: [],
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

  const selectedContext = await resolveSelectedContextForGateway({
    dependencies,
    input: parsedRequest,
    userId,
  });

  if (!selectedContext.ok) {
    writeJson(response, selectedContext.statusCode, selectedContext.body);
    dependencies.logger.warn("api.enhancement_request", {
      mode,
      statusCode: selectedContext.statusCode,
      error: selectedContext.body.error,
    });
    return;
  }

  try {
    const gatewayResult = await dependencies.gateway.enhance({
      raw_prompt: parsedRequest.raw_prompt,
      mode,
      target_model: parsedRequest.target_model,
      prompt_type: parsedRequest.prompt_type,
      options: buildGatewayOptions({
        options: parsedRequest.options,
        selectedContextSnippets: selectedContext.snippets,
        refineOptions:
          mode === "refine" && clarificationSkipped
            ? {
                clarification_skipped: true,
                placeholders: clarification.placeholders,
              }
            : {},
      }),
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
    const qualityChecklist = buildQualityChecklist(
      parsedRequest.raw_prompt,
      result.enhanced_prompt,
    );

    await recordOperation({
      dependencies,
      enhancedPrompt: result.enhanced_prompt,
      gatewayMeta: gatewayResult.meta,
      input: parsedRequest,
      mode,
      qualityChecklist,
      userId,
    });

    const qualityJudge = await maybeRunQualityJudge({
      dependencies,
      enhancedPrompt: result.enhanced_prompt,
      gatewayMeta: gatewayResult.meta,
      input: parsedRequest,
    });

    writeJson(response, 200, {
      result,
      quality_checklist: qualityChecklist,
      used_context: selectedContext.snippets,
      meta: gatewayResult.meta,
      quality_judge: qualityJudge,
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
      qualityJudgeStatus: qualityJudge.status,
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

async function maybeRunQualityJudge(input: {
  dependencies: EnhancementHandlerDependencies;
  enhancedPrompt: string;
  gatewayMeta: EnhancementGatewayResult["meta"];
  input: EnhancementHttpRequest;
}): Promise<EnhancementJudgeResponse> {
  if (!shouldRunLlmJudge(input.input.options) || input.dependencies.llmJudgeEnabled !== true) {
    return {
      enabled: false,
      status: "disabled",
      suggestions: [],
    };
  }

  if (!input.dependencies.gateway.judge) {
    input.dependencies.logger.warn("api.enhancement_quality_judge", {
      status: "unavailable",
      error: "judge_not_configured",
    });

    return {
      enabled: true,
      status: "unavailable",
      suggestions: [],
      error: "judge_not_configured",
    };
  }

  try {
    const judgeResult = await input.dependencies.gateway.judge({
      enhanced_prompt: input.enhancedPrompt,
      generator_model: input.gatewayMeta.model,
      generator_provider: input.gatewayMeta.provider,
      prompt_type: input.input.prompt_type,
      raw_prompt: input.input.raw_prompt,
      target_model: input.input.target_model,
    });

    return {
      enabled: true,
      status: "completed",
      summary: judgeResult.result.summary,
      suggestions: judgeResult.result.suggestions,
      meta: judgeResult.meta,
    };
  } catch (error) {
    const isConfigurationError =
      error instanceof LlmGatewayError && error.code === "configuration_error";

    input.dependencies.logger.warn("api.enhancement_quality_judge", {
      status: isConfigurationError ? "unavailable" : "failed",
      error: isConfigurationError ? "judge_not_configured" : "judge_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    });

    return {
      enabled: true,
      status: isConfigurationError ? "unavailable" : "failed",
      suggestions: [],
      error: isConfigurationError ? "judge_not_configured" : "judge_failed",
    };
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
    enhanced_prompt:
      `${output.enhanced_prompt.trim()}\n\nClarify before use: replace ${placeholderText} with the missing details.`.trim(),
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
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return {
      error: "invalid_request",
      message: error instanceof Error ? error.message : "Failed to read request body.",
    };
  }

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

  const options: Record<string, unknown> = body.options === undefined ? {} : body.options;
  const contextIdsValidation = validateContextIdsOption(options);

  if (!contextIdsValidation.valid) {
    return {
      error: "invalid_request",
      message: contextIdsValidation.message,
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
    options,
    ...(userId ? { user_id: userId } : {}),
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;

    if (totalLength > maxRequestBodyBytes) {
      throw new Error("Request body exceeds maximum size limit of 1MB.");
    }

    chunks.push(buffer);
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

function shouldRunLlmJudge(options: Record<string, unknown>): boolean {
  return options.enable_llm_judge === true;
}

async function resolveSelectedContextForGateway(input: {
  dependencies: EnhancementHandlerDependencies;
  input: EnhancementHttpRequest;
  userId: string | null;
}): Promise<ContextResolutionResult> {
  const selectedIds = readContextIds(input.input.options);

  if (selectedIds.length === 0) {
    return { ok: true, snippets: [] };
  }

  if (!input.userId) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: "user_id_required_for_context",
        message: "user_id or x-user-id is required when context_ids are selected.",
        raw_prompt: input.input.raw_prompt,
      },
    };
  }

  if (!input.dependencies.context) {
    return {
      ok: false,
      statusCode: 503,
      body: {
        error: "context_not_configured",
        message: "Context storage is not configured for selected context_ids.",
        raw_prompt: input.input.raw_prompt,
      },
    };
  }

  try {
    const resolved = await input.dependencies.context.listSelectedSnippets(
      input.userId,
      selectedIds,
    );
    const resolvedById = new Map(resolved.map((snippet) => [snippet.id, snippet]));
    const ordered = selectedIds.map((snippetId) => resolvedById.get(snippetId));

    if (ordered.some((snippet) => snippet === undefined)) {
      return {
        ok: false,
        statusCode: 400,
        body: {
          error: "selected_context_not_found",
          message: "One or more selected context snippets were not found.",
          raw_prompt: input.input.raw_prompt,
        },
      };
    }

    return {
      ok: true,
      snippets: ordered as EnhancementSelectedContextSnippet[],
    };
  } catch {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: "selected_context_not_found",
        message: "One or more selected context snippets were not found.",
        raw_prompt: input.input.raw_prompt,
      },
    };
  }
}

function buildGatewayOptions(input: {
  options: Record<string, unknown>;
  refineOptions: Record<string, unknown>;
  selectedContextSnippets: EnhancementSelectedContextSnippet[];
}): Record<string, unknown> {
  const { context_ids: _contextIds, context_snippets: _contextSnippets, ...rest } = input.options;
  const contextBodies = input.selectedContextSnippets.map((snippet) => snippet.body);

  return {
    ...rest,
    ...input.refineOptions,
    ...(contextBodies.length > 0 ? { context_snippets: contextBodies } : {}),
  };
}

function validateContextIdsOption(
  options: Record<string, unknown>,
): { valid: true } | { valid: false; message: string } {
  const contextIds = options.context_ids;

  if (contextIds === undefined) {
    return { valid: true };
  }

  if (!Array.isArray(contextIds) || contextIds.some((snippetId) => typeof snippetId !== "string")) {
    return { valid: false, message: "options.context_ids must be a string array when provided." };
  }

  if (contextIds.some((snippetId) => !snippetId.trim())) {
    return { valid: false, message: "options.context_ids must not include blank ids." };
  }

  return { valid: true };
}

function readContextIds(options: Record<string, unknown>): string[] {
  const contextIds = options.context_ids;

  if (!Array.isArray(contextIds)) {
    return [];
  }

  return Array.from(new Set(contextIds.map((snippetId) => String(snippetId).trim())));
}

async function recordOperation(input: {
  dependencies: EnhancementHandlerDependencies;
  enhancedPrompt: string;
  gatewayMeta: EnhancementGatewayResult["meta"] | null;
  input: EnhancementHttpRequest;
  mode: EnhancementMode;
  qualityChecklist: EnhancementQualityChecklist;
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
    structureScoreBefore: input.qualityChecklist.before.structure_score,
    structureScoreAfter: input.qualityChecklist.after.structure_score,
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

function buildQualityChecklist(
  originalPrompt: string,
  enhancedPrompt: string,
): EnhancementQualityChecklist {
  return {
    before: evaluatePromptStructure(originalPrompt),
    after: evaluatePromptStructure(enhancedPrompt),
  };
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
