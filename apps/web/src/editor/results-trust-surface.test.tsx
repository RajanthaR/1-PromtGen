import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ResultsTrustSurface,
  applySuggestionToPrompt,
  type ResultsTrustSurfaceProps,
} from "./results-trust-surface";
import { buildResultsCopySavePayload } from "./results-view-model";

const result: ResultsTrustSurfaceProps["result"] = {
  added: ["Added audience context", "Added success criteria"],
  changed: ["Reorganized into role, task, format"],
  constraints: ["Keep it concise"],
  context: "Use the onboarding snippet only.",
  enhanced_prompt: "Enhanced prompt from the API",
  explanation: ["Made the request specific without changing the intent."],
  format: "Bullets",
  needs_clarification: false,
  questions: [],
  removed: ["Removed vague wording"],
  role: "Product marketer",
  success_criteria: ["Clear next steps"],
  task: "Write onboarding copy",
  title: "Onboarding Copy Prompt",
  tone: "professional",
};

const qualityChecklist: ResultsTrustSurfaceProps["qualityChecklist"] = {
  after: {
    items: [
      {
        dimension: "Clarity",
        fix_suggestion: "",
        reason: "The prompt states a clear primary task.",
        status: "pass",
      },
      {
        dimension: "Context",
        fix_suggestion: "Name the audience and launch situation.",
        reason: "The prompt includes only light context.",
        status: "partial",
      },
      {
        dimension: "Output format",
        fix_suggestion: "Ask for a markdown table.",
        reason: "The prompt does not specify the response format.",
        status: "missing",
      },
    ],
    structure_score: 82,
  },
  before: {
    items: [],
    structure_score: 45,
  },
};

function makeProps(overrides: Partial<ResultsTrustSurfaceProps> = {}): ResultsTrustSurfaceProps {
  return {
    contextUsedSnippets: [
      { id: "ctx-1", text: "Audience: new admins in a B2B workspace." },
      { id: "ctx-2", text: "Launch context: beta onboarding email." },
    ],
    enhancedPromptValue: "Enhanced prompt from the editor",
    originalPrompt: "write better onboarding",
    onEnhancedPromptChange: vi.fn(),
    qualityChecklist,
    result,
    ...overrides,
  };
}

describe("ResultsTrustSurface", () => {
  it("renders side-by-side original and editable enhanced prompts with score comparison", () => {
    const markup = renderToStaticMarkup(createElement(ResultsTrustSurface, makeProps()));

    expect(markup).toContain("Original prompt");
    expect(markup).toContain("Enhanced prompt");
    expect(markup).toContain("readOnly");
    expect(markup).toContain("Editable starting point");
    expect(markup).toContain("Before");
    expect(markup).toContain("45");
    expect(markup).toContain("After");
    expect(markup).toContain("82");
    expect(markup).toContain("Delta +37");
  });

  it("shows the What changed & why panel open by default with explanation and diff groups", () => {
    const markup = renderToStaticMarkup(createElement(ResultsTrustSurface, makeProps()));

    expect(markup).toContain('<details open=""');
    expect(markup).toContain("What changed &amp; why");
    expect(markup).toContain("Made the request specific without changing the intent.");
    expect(markup).toContain("Added audience context");
    expect(markup).toContain("Removed vague wording");
    expect(markup).toContain("Reorganized into role, task, format");
  });

  it("renders exactly the context snippets supplied through props", () => {
    const markup = renderToStaticMarkup(createElement(ResultsTrustSurface, makeProps()));

    expect(markup).toContain("Audience: new admins in a B2B workspace.");
    expect(markup).toContain("Launch context: beta onboarding email.");
    expect(markup).not.toContain("unselected");
  });

  it("exposes checklist statuses with text labels and accessible status names", () => {
    const markup = renderToStaticMarkup(createElement(ResultsTrustSurface, makeProps()));

    expect(markup).toContain("Status: pass");
    expect(markup).toContain("[x]");
    expect(markup).toContain("Pass");
    expect(markup).toContain("Status: partial");
    expect(markup).toContain("[-]");
    expect(markup).toContain("Partial");
    expect(markup).toContain("Status: missing");
    expect(markup).toContain("[!]");
    expect(markup).toContain("Missing");
  });

  it("updates the controlled enhanced prompt and save payload with the current edited value", () => {
    expect(
      buildResultsCopySavePayload({
        contextUsedSnippets: makeProps().contextUsedSnippets,
        enhancedPrompt: "Edited current prompt",
        originalPrompt: "write better onboarding",
        qualityChecklist,
        result,
      }),
    ).toMatchObject({
      enhancedPrompt: "Edited current prompt",
      originalPrompt: "write better onboarding",
      structureScoreAfter: 82,
      structureScoreBefore: 45,
    });
  });

  it("applies checklist suggestions through the editable prompt callback", () => {
    expect(applySuggestionToPrompt("Prompt body", "Name the audience and launch situation.")).toBe(
      "Prompt body\n\nAdditional requirement:\nName the audience and launch situation.",
    );
  });
});
