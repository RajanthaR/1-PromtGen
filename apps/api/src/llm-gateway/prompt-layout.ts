import {
  formatGoldenFewShotsForPrompt,
  PROMPT_ENGINE_META_PROMPT_V2,
} from "@promptgen/prompt-engine";

import { promptEnhancementJsonSchema } from "./schema";
import type { PromptEnhancementInput } from "./types";

export function buildStaticFirstPromptParts(input: PromptEnhancementInput): {
  staticParts: string[];
  variablePart: string;
} {
  const fewShots = input.options?.few_shots ?? [formatGoldenFewShotsForPrompt()];
  const staticParts = [
    input.options?.meta_prompt ?? PROMPT_ENGINE_META_PROMPT_V2,
    ...fewShots,
    `# Output schema\n${JSON.stringify(promptEnhancementJsonSchema)}`,
  ];
  const variablePart = [
    "# Request controls",
    `mode: ${input.mode}`,
    `target_model: ${input.target_model}`,
    `prompt_type: ${input.prompt_type}`,
    `selected_context: ${JSON.stringify(input.options?.context_snippets ?? [])}`,
    `options: ${JSON.stringify({
      audience: input.options?.audience ?? "",
      constraints: input.options?.constraints ?? [],
      creativity: input.options?.creativity ?? null,
      language: input.options?.language ?? "",
      output_format: input.options?.output_format ?? "",
      tone: input.options?.tone ?? "",
    })}`,
    "# User input",
    "<user_input>",
    input.raw_prompt,
    "</user_input>",
  ].join("\n");

  return {
    staticParts,
    variablePart,
  };
}
