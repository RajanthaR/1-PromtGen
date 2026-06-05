export const PROMPT_ENGINE_OUTPUT_FIELDS = [
  "title",
  "needs_clarification",
  "questions",
  "enhanced_prompt",
  "role",
  "task",
  "context",
  "constraints",
  "format",
  "tone",
  "success_criteria",
  "explanation",
  "added",
  "removed",
  "changed",
] as const;

export type PromptEngineOutputField = (typeof PROMPT_ENGINE_OUTPUT_FIELDS)[number];

export type PromptEnhancementMode = "improve" | "enhance" | "refine" | "shorten";

export type PromptTargetModel = "gemini";

export type PromptTone =
  | "neutral"
  | "professional"
  | "friendly"
  | "concise"
  | "persuasive"
  | "technical";

export interface PromptEngineStructuredOutput {
  title: string;
  needs_clarification: boolean;
  questions: string[];
  enhanced_prompt: string;
  role: string;
  task: string;
  context: string;
  constraints: string[];
  format: string;
  tone: PromptTone;
  success_criteria: string[];
  explanation: string[];
  added: string[];
  removed: string[];
  changed: string[];
}

export type PromptEngineJsonSchema = {
  readonly $schema: "https://json-schema.org/draft/2020-12/schema";
  readonly title: string;
  readonly description: string;
  readonly type: "object";
  readonly additionalProperties: false;
  readonly required: readonly PromptEngineOutputField[];
  readonly properties: Record<PromptEngineOutputField, unknown>;
};

const stringArraySchema = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "array",
  description,
  items: { type: "string" },
  ...extra,
});

export const PROMPT_ENGINE_OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PromptForgePromptEngineOutput",
  description:
    "Canonical flat structured output for PromptForge Studio prompt enhancement. Quality checklist fields are intentionally excluded.",
  type: "object",
  additionalProperties: false,
  required: PROMPT_ENGINE_OUTPUT_FIELDS,
  properties: {
    title: {
      type: "string",
      description:
        "Short human-readable title for the enhanced prompt, based only on the user's provided intent.",
    },
    needs_clarification: {
      type: "boolean",
      description:
        "True only when refine mode needs more information before a strong rewrite can be produced.",
    },
    questions: stringArraySchema(
      "One to three specific clarification questions when needs_clarification is true; otherwise an empty array.",
      { maxItems: 3 },
    ),
    enhanced_prompt: {
      type: "string",
      description:
        "The editable prompt the user can copy. Use an empty string only when clarification is required or the request is refused for safety.",
    },
    role: {
      type: "string",
      description:
        "The role/persona section to include in the enhanced prompt, or an empty string when clarification is required.",
    },
    task: {
      type: "string",
      description:
        "The concrete task the target model should perform, preserving the user's original intent.",
    },
    context: {
      type: "string",
      description:
        "Only the user-provided context and selected context snippets used by the enhanced prompt; never unselected context.",
    },
    constraints: stringArraySchema(
      "Explicit user constraints plus safe inferred structural constraints; use placeholders for unknown facts.",
    ),
    format: {
      type: "string",
      description:
        "Requested output format for the target model, such as bullets, table, email, checklist, or concise paragraph.",
    },
    tone: {
      type: "string",
      enum: ["neutral", "professional", "friendly", "concise", "persuasive", "technical"],
      description:
        "Best-fitting tone for the enhanced prompt. Choose one enum value; preserve any explicit user tone preference.",
    },
    success_criteria: stringArraySchema(
      "Observable criteria that define a useful target-model response to the enhanced prompt.",
    ),
    explanation: stringArraySchema("Brief plain-language reasons explaining what changed and why."),
    added: stringArraySchema(
      "Prompt elements added to make the user's request clearer or more complete.",
    ),
    removed: stringArraySchema(
      "Prompt elements removed or compressed; empty when nothing was removed.",
    ),
    changed: stringArraySchema("Prompt elements rewritten, reorganized, or made more specific."),
  },
} as const satisfies PromptEngineJsonSchema;

export interface PromptEngineSchemaValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validatePromptEngineOutput(value: unknown): PromptEngineSchemaValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ["output must be an object"] };
  }

  const allowedFields = new Set<string>(PROMPT_ENGINE_OUTPUT_FIELDS);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      errors.push(`unexpected field: ${key}`);
    }
  }

  for (const field of PROMPT_ENGINE_OUTPUT_FIELDS) {
    if (!(field in value)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const field of [
    "title",
    "enhanced_prompt",
    "role",
    "task",
    "context",
    "format",
  ] satisfies PromptEngineOutputField[]) {
    if (field in value && typeof value[field] !== "string") {
      errors.push(`${field} must be a string`);
    }
  }

  if ("needs_clarification" in value && typeof value.needs_clarification !== "boolean") {
    errors.push("needs_clarification must be a boolean");
  }

  if (
    "tone" in value &&
    !["neutral", "professional", "friendly", "concise", "persuasive", "technical"].includes(
      String(value.tone),
    )
  ) {
    errors.push("tone must be one of the supported tone enum values");
  }

  for (const field of [
    "questions",
    "constraints",
    "success_criteria",
    "explanation",
    "added",
    "removed",
    "changed",
  ] satisfies PromptEngineOutputField[]) {
    if (field in value && !isStringArray(value[field])) {
      errors.push(`${field} must be an array of strings`);
    }
  }

  if ("questions" in value && Array.isArray(value.questions) && value.questions.length > 3) {
    errors.push("questions must contain at most three items");
  }

  if (
    value.needs_clarification === true &&
    Array.isArray(value.questions) &&
    (value.questions.length < 1 || value.questions.length > 3)
  ) {
    errors.push("clarification outputs must include one to three questions");
  }

  return { valid: errors.length === 0, errors };
}
