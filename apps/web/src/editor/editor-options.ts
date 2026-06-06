export const editorModeOptions = [
  {
    label: "Improve",
    value: "improve",
  },
  {
    label: "Enhance",
    value: "enhance",
  },
  {
    label: "Refine",
    value: "refine",
  },
  {
    label: "Shorten",
    value: "shorten",
  },
] as const;

export type EditorMode = (typeof editorModeOptions)[number]["value"];

export const toneOptions = [
  {
    label: "Neutral",
    value: "neutral",
  },
  {
    label: "Professional",
    value: "professional",
  },
  {
    label: "Friendly",
    value: "friendly",
  },
  {
    label: "Concise",
    value: "concise",
  },
  {
    label: "Persuasive",
    value: "persuasive",
  },
  {
    label: "Technical",
    value: "technical",
  },
] as const;

export type ToneOption = (typeof toneOptions)[number]["value"];

export const targetModelOptions = [
  {
    label: "Auto",
    value: "auto",
  },
  {
    label: "ChatGPT",
    value: "chatgpt",
  },
  {
    label: "Claude",
    value: "claude",
  },
  {
    label: "Gemini",
    value: "gemini",
  },
  {
    label: "Other text model",
    value: "other-text",
  },
] as const;

export type TargetModelOption = (typeof targetModelOptions)[number]["value"];

export interface ContextSnippetOption {
  body: string;
  id: string;
  title: string;
}

export const contextSnippetOptions: ContextSnippetOption[] = [
  {
    body: "Audience: busy SaaS founders evaluating analytics tools for revenue teams.",
    id: "audience-saas-founders",
    title: "Audience note",
  },
  {
    body: "Brand voice: clear, practical, evidence-led, and direct.",
    id: "brand-voice-practical",
    title: "Brand voice",
  },
  {
    body: "Output preference: include a short subject line, body copy, and a call to action.",
    id: "launch-email-format",
    title: "Launch email format",
  },
];
