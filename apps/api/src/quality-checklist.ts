import { detectSecrets } from "./llm-gateway/secrets";

export type ChecklistDimension =
  | "Clarity"
  | "Context"
  | "Specificity"
  | "Output format"
  | "Model/tool fit"
  | "Safety/privacy"
  | "Concision";

export type ChecklistStatus = "pass" | "partial" | "missing";

export interface ChecklistItem {
  dimension: ChecklistDimension;
  status: ChecklistStatus;
  reason: string;
  fix_suggestion: string;
}

export interface PromptStructureChecklist {
  items: ChecklistItem[];
  structure_score: number;
}

const checklistWeights: ReadonlyArray<{ dimension: ChecklistDimension; weight: number }> = [
  { dimension: "Clarity", weight: 20 },
  { dimension: "Context", weight: 15 },
  { dimension: "Specificity", weight: 15 },
  { dimension: "Output format", weight: 15 },
  { dimension: "Model/tool fit", weight: 15 },
  { dimension: "Safety/privacy", weight: 10 },
  { dimension: "Concision", weight: 10 },
];

const taskVerbPattern =
  /\b(analyze|build|compare|compose|create|design|draft|explain|generate|improve|make|plan|review|rewrite|summarize|translate|write)\b/i;
const vagueReferencePattern = /\b(this|it|stuff|things?|something|better|nice|good)\b/i;
const taskConnectorPattern = /\b(and then|then|also|after that|as well as)\b/i;

const audiencePattern =
  /\b(for|audience|users?|customers?|students?|developers?|teachers?|team|stakeholders?|readers?|clients?|operators?|leaders?)\b/i;
const goalPattern =
  /\b(goal|purpose|so that|in order to|to help|to (increase|reduce|convert|teach|inform|persuade|retain|onboard|support|explain|decide)|aimed at)\b/i;
const situationPattern =
  /\b(context|background|scenario|currently|we are|our|product|company|project|campaign|market|situation)\b/i;

const constraintPattern =
  /\b(must|should|avoid|do not|only|include|exclude|keep|under|over|between|at least|no more than|constraint|requirement|deadline|budget)\b/i;
const inputPattern =
  /\b(use|based on|given|input|data|source|example|from the following|provided|attached)\b/i;
const successPattern =
  /\b(success|criteria|measure|optimi[sz]e|ready to|acceptance|checklist|must include)\b/i;
const specificValuePattern = /\b\d+[\w%$-]*\b|\[[A-Z0-9 _-]+\]/;

const formatPattern =
  /\b(json|xml|yaml|table|csv|markdown|bullets?|numbered list|sections?|headings?|schema|template|subject line|outline|format)\b|(?:return|respond)\b.{0,24}\b(as|in)\b/i;
const lengthPattern =
  /\b(under|within|no more than|at most|exactly|paragraphs?|sentences?|words?|bullets?)\b.{0,16}\b\d+\b|\b\d+\b.{0,16}\b(paragraphs?|sentences?|words?|bullets?)\b/i;

const structuredPromptPattern =
  /(^|\n)\s*(#{1,3}\s*)?(role|task|context|constraints?|format|tone|success criteria|output)\s*[:\n]/i;
const modelOrToolPattern =
  /\b(gpt|chatgpt|claude|gemini|copilot|llm|model|browser|web search|python|sql|spreadsheet|api|tool|function call)\b/i;
const promptRolePattern = /\b(act as|you are|system prompt|developer prompt)\b/i;

const unsafeInstructionPattern =
  /\b(steal|exfiltrate|phish|malware|ransomware|keylogger|bypass authentication|evade detection|credential stuffing|scrape private|doxx?)\b/i;
const sensitiveDataPattern =
  /\b(ssn|social security|credit card|password|api key|private key|secret|token|patient data|personal data|pii)\b/i;

export function evaluatePromptStructure(prompt: string): PromptStructureChecklist {
  const analysis = analyzePrompt(prompt);
  const items = checklistWeights.map(({ dimension }) => evaluateDimension(dimension, analysis));
  const structure_score = Math.round(
    items.reduce((total, item) => {
      const weight =
        checklistWeights.find((entry) => entry.dimension === item.dimension)?.weight ?? 0;
      return total + weight * statusMultiplier(item.status);
    }, 0),
  );

  return {
    items,
    structure_score,
  };
}

function analyzePrompt(prompt: string): {
  normalized: string;
  wordCount: number;
  taskVerbCount: number;
  hasTaskVerb: boolean;
  hasVagueReference: boolean;
  hasMultiTaskConnector: boolean;
  contextSignalCount: number;
  specificitySignalCount: number;
  hasFormatSignal: boolean;
  hasLengthSignal: boolean;
  hasStructuredPrompt: boolean;
  hasModelOrToolSignal: boolean;
  hasPromptRoleSignal: boolean;
  hasSecret: boolean;
  hasUnsafeInstruction: boolean;
  hasSensitiveDataSignal: boolean;
} {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  const words = normalized.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  const taskVerbMatches = normalized.match(
    /\b(analyze|build|compare|compose|create|design|draft|explain|generate|improve|make|plan|review|rewrite|summarize|translate|write)\b/gi,
  );
  const contextSignals = [
    audiencePattern.test(normalized),
    goalPattern.test(normalized),
    situationPattern.test(normalized),
  ].filter(Boolean).length;
  const specificitySignals = [
    constraintPattern.test(normalized),
    inputPattern.test(normalized),
    successPattern.test(normalized),
    specificValuePattern.test(normalized),
  ].filter(Boolean).length;

  return {
    normalized,
    wordCount: words.length,
    taskVerbCount: taskVerbMatches?.length ?? 0,
    hasTaskVerb: taskVerbPattern.test(normalized),
    hasVagueReference: vagueReferencePattern.test(normalized),
    hasMultiTaskConnector: taskConnectorPattern.test(normalized),
    contextSignalCount: contextSignals,
    specificitySignalCount: specificitySignals,
    hasFormatSignal: formatPattern.test(normalized),
    hasLengthSignal: lengthPattern.test(normalized),
    hasStructuredPrompt: structuredPromptPattern.test(prompt),
    hasModelOrToolSignal: modelOrToolPattern.test(normalized),
    hasPromptRoleSignal: promptRolePattern.test(normalized),
    hasSecret: detectSecrets(prompt).length > 0,
    hasUnsafeInstruction: unsafeInstructionPattern.test(normalized),
    hasSensitiveDataSignal: sensitiveDataPattern.test(normalized),
  };
}

function evaluateDimension(
  dimension: ChecklistDimension,
  analysis: ReturnType<typeof analyzePrompt>,
): ChecklistItem {
  switch (dimension) {
    case "Clarity":
      return evaluateClarity(analysis);
    case "Context":
      return evaluateContext(analysis);
    case "Specificity":
      return evaluateSpecificity(analysis);
    case "Output format":
      return evaluateOutputFormat(analysis);
    case "Model/tool fit":
      return evaluateModelToolFit(analysis);
    case "Safety/privacy":
      return evaluateSafetyPrivacy(analysis);
    case "Concision":
      return evaluateConcision(analysis);
  }
}

function evaluateClarity(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (!analysis.hasTaskVerb || (analysis.wordCount <= 5 && analysis.hasVagueReference)) {
    return item(
      "Clarity",
      "missing",
      "The prompt does not state a clear task.",
      "Name the exact action the model should perform.",
    );
  }

  if (
    analysis.wordCount < 8 ||
    analysis.hasVagueReference ||
    (analysis.taskVerbCount >= 3 && analysis.hasMultiTaskConnector)
  ) {
    return item(
      "Clarity",
      "partial",
      "The task is present but still ambiguous or crowded.",
      "Rewrite it as one primary ask with concrete wording.",
    );
  }

  return item("Clarity", "pass", "The prompt states a clear primary task.", "");
}

function evaluateContext(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (analysis.contextSignalCount >= 2) {
    return item("Context", "pass", "Audience, situation, or goal context is present.", "");
  }

  if (analysis.contextSignalCount === 1) {
    return item(
      "Context",
      "partial",
      "The prompt includes only light context.",
      "Add the audience, situation, and desired outcome.",
    );
  }

  return item(
    "Context",
    "missing",
    "The prompt does not explain who it is for or why it matters.",
    "Add audience, background, or goal context.",
  );
}

function evaluateSpecificity(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (analysis.specificitySignalCount >= 2) {
    return item(
      "Specificity",
      "pass",
      "Inputs, constraints, or success criteria are explicit.",
      "",
    );
  }

  if (analysis.specificitySignalCount === 1) {
    return item(
      "Specificity",
      "partial",
      "The prompt has one concrete requirement but lacks enough detail.",
      "Add inputs, constraints, and success criteria.",
    );
  }

  return item(
    "Specificity",
    "missing",
    "The prompt lacks concrete inputs, constraints, or success criteria.",
    "Specify source material, limits, and what a good answer must include.",
  );
}

function evaluateOutputFormat(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (analysis.hasFormatSignal) {
    return item("Output format", "pass", "The desired response format is specified.", "");
  }

  if (analysis.hasLengthSignal) {
    return item(
      "Output format",
      "partial",
      "The prompt gives a length hint but no response structure.",
      "State the exact format, such as bullets, sections, JSON, or a table.",
    );
  }

  return item(
    "Output format",
    "missing",
    "The prompt does not specify the response format.",
    "Add the expected format and any length limits.",
  );
}

function evaluateModelToolFit(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (analysis.hasStructuredPrompt || analysis.hasModelOrToolSignal) {
    return item(
      "Model/tool fit",
      "pass",
      "The prompt is structured for a model or named tool.",
      "",
    );
  }

  if (analysis.hasPromptRoleSignal) {
    return item(
      "Model/tool fit",
      "partial",
      "The prompt gives a role but little model-ready structure.",
      "Use labeled sections or name any required tool/model capability.",
    );
  }

  return item(
    "Model/tool fit",
    "missing",
    "The prompt is plain prose with no model or tool adaptation.",
    "Add role, task, context, constraints, and output sections.",
  );
}

function evaluateSafetyPrivacy(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (analysis.hasSecret || analysis.hasUnsafeInstruction) {
    return item(
      "Safety/privacy",
      "missing",
      "The prompt includes likely secrets or unsafe instructions.",
      "Remove credentials, private data, and unsafe instructions before use.",
    );
  }

  if (analysis.hasSensitiveDataSignal) {
    return item(
      "Safety/privacy",
      "partial",
      "The prompt mentions sensitive data without clear minimization.",
      "Use placeholders or explain why sensitive data is necessary.",
    );
  }

  return item(
    "Safety/privacy",
    "pass",
    "No obvious secrets or unsafe instructions are present.",
    "",
  );
}

function evaluateConcision(analysis: ReturnType<typeof analyzePrompt>): ChecklistItem {
  if (analysis.wordCount === 0) {
    return item(
      "Concision",
      "missing",
      "The prompt is empty.",
      "Add enough detail for the model to act.",
    );
  }

  if (analysis.wordCount < 8) {
    return item(
      "Concision",
      "missing",
      "The prompt is too brief to be useful.",
      "Add task, context, constraints, and format details.",
    );
  }

  if (analysis.wordCount > 500) {
    return item(
      "Concision",
      "missing",
      "The prompt is too long for a concise instruction.",
      "Remove repeated or unrelated details.",
    );
  }

  if (analysis.wordCount < 20 || analysis.wordCount > 250) {
    return item(
      "Concision",
      "partial",
      "The prompt is usable but either thin or wordy.",
      "Adjust the detail level to keep only actionable context.",
    );
  }

  return item("Concision", "pass", "The prompt is detailed without obvious bloat.", "");
}

function item(
  dimension: ChecklistDimension,
  status: ChecklistStatus,
  reason: string,
  fixSuggestion: string,
): ChecklistItem {
  return {
    dimension,
    status,
    reason,
    fix_suggestion: fixSuggestion,
  };
}

function statusMultiplier(status: ChecklistStatus): number {
  if (status === "pass") {
    return 1;
  }

  if (status === "partial") {
    return 0.5;
  }

  return 0;
}
