import type { PromptEnhancementResult } from "./types";

const metaPromptLeakPatterns = [
  "# Role",
  "# Goal",
  "# Inputs",
  "You are a prompt-architecture engine",
  "Return only an object matching the provided schema",
  "<user_input>{{raw_prompt}}</user_input>",
];

export function screenPromptEnhancementOutput(result: PromptEnhancementResult): void {
  const outputText = [
    result.title,
    result.enhanced_prompt,
    result.role,
    result.task,
    result.context,
    result.explanation.join("\n"),
  ].join("\n");

  if (!result.needs_clarification && !result.enhanced_prompt.trim()) {
    throw new Error("Enhanced prompt is empty.");
  }

  for (const pattern of metaPromptLeakPatterns) {
    if (outputText.includes(pattern)) {
      throw new Error("Output appears to contain gateway prompt instructions.");
    }
  }
}

