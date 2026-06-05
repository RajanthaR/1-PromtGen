import type { PromptEngineStructuredOutput, PromptEnhancementMode } from "../schema";

export interface PromptEngineGoldenFewShot {
  id: "vague-to-structured" | "refine-to-questions" | "shorten-preserve-constraints";
  mode: PromptEnhancementMode;
  targetModel: "gemini";
  userInput: string;
  selectedContext: string;
  output: PromptEngineStructuredOutput;
}

export const PROMPT_ENGINE_GOLDEN_FEW_SHOTS = [
  {
    id: "vague-to-structured",
    mode: "enhance",
    targetModel: "gemini",
    userInput: "Write a launch email for our new analytics dashboard.",
    selectedContext: "Product: self-serve analytics dashboard. Audience: SaaS operations leads.",
    output: {
      title: "Analytics Dashboard Launch Email",
      needs_clarification: false,
      questions: [],
      enhanced_prompt:
        "You are a B2B SaaS lifecycle marketer. Write a launch email for a self-serve analytics dashboard aimed at SaaS operations leads. Focus on the practical value of faster visibility into team performance. Use a clear subject line, a concise opening, three benefit bullets, one proof or placeholder proof point, and a direct call to action. Keep the body under 180 words and use placeholders like [PRODUCT NAME] or [PROOF POINT] for missing facts.",
      role: "B2B SaaS lifecycle marketer",
      task: "Write a concise launch email for a self-serve analytics dashboard.",
      context: "Product: self-serve analytics dashboard. Audience: SaaS operations leads.",
      constraints: [
        "Keep the body under 180 words.",
        "Use placeholders for missing product name and proof point.",
        "Preserve the launch-email intent.",
      ],
      format: "Subject line, email body, benefit bullets, call to action",
      tone: "professional",
      success_criteria: [
        "Makes the dashboard value clear to SaaS operations leads.",
        "Includes a direct call to action.",
        "Uses placeholders instead of invented facts.",
      ],
      explanation: [
        "Added role, audience, format, and length constraints.",
        "Used selected context to avoid inventing product details.",
      ],
      added: ["Role", "audience", "benefit bullets", "CTA", "placeholders"],
      removed: [],
      changed: ["Turned a vague request into a structured launch-email prompt."],
    },
  },
  {
    id: "refine-to-questions",
    mode: "refine",
    targetModel: "gemini",
    userInput: "Make this better for my clients.",
    selectedContext: "",
    output: {
      title: "Clarify Client-Facing Prompt",
      needs_clarification: true,
      questions: [
        "What should the prompt help your clients create or decide?",
        "Who are the clients, and what level of expertise should the output assume?",
        "What format should the final answer use?",
      ],
      enhanced_prompt: "",
      role: "",
      task: "Clarify a thin client-facing prompt before rewriting it.",
      context: "",
      constraints: ["Ask only for information needed to preserve intent."],
      format: "Clarifying questions",
      tone: "professional",
      success_criteria: [
        "Questions identify the missing task, audience, and format.",
        "No business facts are invented.",
      ],
      explanation: [
        "The input is too thin for a reliable rewrite.",
        "Refine mode asks targeted questions before enhancement.",
      ],
      added: ["Clarifying questions"],
      removed: [],
      changed: ["Deferred the rewrite until the user's goal is clear."],
    },
  },
  {
    id: "shorten-preserve-constraints",
    mode: "shorten",
    targetModel: "gemini",
    userInput:
      "Please rewrite this prompt so it is much shorter, but keep the requirement to compare three options, mention risks, and end with a recommendation.",
    selectedContext: "",
    output: {
      title: "Concise Comparison Prompt",
      needs_clarification: false,
      questions: [],
      enhanced_prompt:
        "Compare three options. For each, summarize the main benefit, key risk, and best-fit use case. End with one recommendation and the reason.",
      role: "Decision-support assistant",
      task: "Compare three options and recommend one.",
      context: "",
      constraints: [
        "Keep the prompt short.",
        "Compare exactly three options.",
        "Mention risks.",
        "End with a recommendation.",
      ],
      format: "Compact comparison with final recommendation",
      tone: "concise",
      success_criteria: [
        "Preserves the three-option comparison.",
        "Includes risks and a recommendation.",
        "Uses substantially fewer words than the original request.",
      ],
      explanation: [
        "Compressed the wording while preserving all explicit requirements.",
        "Kept the output format concrete.",
      ],
      added: ["Best-fit use case", "reason for recommendation"],
      removed: ["Polite filler"],
      changed: ["Condensed the request into a direct reusable prompt."],
    },
  },
] as const satisfies readonly PromptEngineGoldenFewShot[];

export function formatGoldenFewShotsForPrompt(): string {
  return PROMPT_ENGINE_GOLDEN_FEW_SHOTS.map((example, index) => {
    const selectedContext = example.selectedContext || "(none selected)";

    return [
      `Example ${index + 1}: ${example.id}`,
      `mode: ${example.mode}`,
      `target_model: ${example.targetModel}`,
      `selected_context: ${selectedContext}`,
      `<user_input>${example.userInput}</user_input>`,
      "expected_output:",
      JSON.stringify(example.output, null, 2),
    ].join("\n");
  }).join("\n\n");
}
