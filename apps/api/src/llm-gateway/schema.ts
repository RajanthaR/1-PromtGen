import {
  PROMPT_ENGINE_OUTPUT_SCHEMA,
  PROMPT_QUALITY_JUDGE_OUTPUT_SCHEMA,
  validatePromptQualityJudgeOutput,
  validatePromptEngineOutput,
} from "@promptgen/prompt-engine";

import type { PromptEnhancementResult, PromptQualityJudgeResult } from "./types";

export const promptEnhancementJsonSchema = PROMPT_ENGINE_OUTPUT_SCHEMA;
export const promptQualityJudgeJsonSchema = PROMPT_QUALITY_JUDGE_OUTPUT_SCHEMA;

const requiredStringFields = [
  "title",
  "enhanced_prompt",
  "role",
  "task",
  "context",
  "format",
  "tone",
] satisfies Array<keyof PromptEnhancementResult>;

const requiredStringArrayFields = [
  "questions",
  "constraints",
  "success_criteria",
  "explanation",
  "added",
  "removed",
  "changed",
] satisfies Array<keyof PromptEnhancementResult>;

export function validatePromptEnhancementResult(value: unknown): PromptEnhancementResult {
  const schemaValidation = validatePromptEngineOutput(value);

  if (!schemaValidation.valid) {
    throw new Error(
      `Structured output failed schema validation: ${schemaValidation.errors.join("; ")}`,
    );
  }

  if (!isRecord(value)) {
    throw new Error("Structured output must be an object.");
  }

  for (const field of requiredStringFields) {
    if (typeof value[field] !== "string") {
      throw new Error(`Structured output field ${field} must be a string.`);
    }
  }

  if (typeof value.needs_clarification !== "boolean") {
    throw new Error("Structured output field needs_clarification must be a boolean.");
  }

  for (const field of requiredStringArrayFields) {
    if (!Array.isArray(value[field]) || !value[field].every((item) => typeof item === "string")) {
      throw new Error(`Structured output field ${field} must be a string array.`);
    }
  }

  const result: PromptEnhancementResult = {
    added: value.added as string[],
    changed: value.changed as string[],
    constraints: value.constraints as string[],
    context: value.context as string,
    enhanced_prompt: value.enhanced_prompt as string,
    explanation: value.explanation as string[],
    format: value.format as string,
    needs_clarification: value.needs_clarification,
    questions: value.questions as string[],
    removed: value.removed as string[],
    role: value.role as string,
    success_criteria: value.success_criteria as string[],
    task: value.task as string,
    title: value.title as string,
    tone: value.tone as string,
  };

  if (result.needs_clarification && (result.questions.length < 1 || result.questions.length > 3)) {
    throw new Error("Clarification output must include one to three questions.");
  }

  if (!result.needs_clarification && !result.enhanced_prompt.trim()) {
    throw new Error("Enhanced prompt must be present unless clarification is needed.");
  }

  return result;
}

export function validatePromptQualityJudgeResult(value: unknown): PromptQualityJudgeResult {
  const schemaValidation = validatePromptQualityJudgeOutput(value);

  if (!schemaValidation.valid) {
    throw new Error(
      `Structured judge output failed schema validation: ${schemaValidation.errors.join("; ")}`,
    );
  }

  if (!isRecord(value)) {
    throw new Error("Structured judge output must be an object.");
  }

  return {
    summary: value.summary as string,
    suggestions: (value.suggestions as PromptQualityJudgeResult["suggestions"]).map(
      (suggestion) => ({
        dimension: suggestion.dimension,
        weakness: suggestion.weakness,
        improvement: suggestion.improvement,
      }),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
