import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ResultsTrustSurface, type ResultsTrustSurfaceProps } from "./results-trust-surface";

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
    const onEnhancedPromptChange = vi.fn();
    const onSave = vi.fn();
    const element = ResultsTrustSurface(
      makeProps({
        enhancedPromptValue: "Edited current prompt",
        onEnhancedPromptChange,
        onSave,
      }),
    );

    const enhancedTextarea = findByProps(element, { id: "results-enhanced-prompt" });
    const onTextareaChange = getFunctionProp(enhancedTextarea, "onChange");
    onTextareaChange({
      currentTarget: { value: "Edited again" },
    });

    const saveButton = findButtonByText(element, "Save current prompt");
    const onSaveClick = getFunctionProp(saveButton, "onClick");
    onSaveClick();

    expect(onEnhancedPromptChange).toHaveBeenCalledWith("Edited again");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        enhancedPrompt: "Edited current prompt",
        originalPrompt: "write better onboarding",
        structureScoreAfter: 82,
        structureScoreBefore: 45,
      }),
    );
  });

  it("applies checklist suggestions through the editable prompt callback", () => {
    const onEnhancedPromptChange = vi.fn();
    const onApplyChecklistSuggestion = vi.fn();
    const element = ResultsTrustSurface(
      makeProps({
        enhancedPromptValue: "Prompt body",
        onApplyChecklistSuggestion,
        onEnhancedPromptChange,
      }),
    );

    const applyButton = findButtonByText(element, "Apply suggestion for Context");
    const onApplyClick = getFunctionProp(applyButton, "onClick");
    onApplyClick();

    expect(onEnhancedPromptChange).toHaveBeenCalledWith(
      "Prompt body\n\nAdditional requirement:\nName the audience and launch situation.",
    );
    expect(onApplyChecklistSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: "Context" }),
      "Prompt body\n\nAdditional requirement:\nName the audience and launch situation.",
    );
  });
});

type TestElement = {
  props?: {
    children?: TestNode;
    [key: string]: unknown;
  };
  type?: string | ((props: Record<string, unknown>) => TestNode);
};

type TestNode = TestElement | string | number | boolean | null | undefined | TestNode[];

function findByProps(node: TestNode, expectedProps: Record<string, string>): TestElement {
  const found = findNode(node, (candidate) =>
    Object.entries(expectedProps).every(([key, value]) => candidate.props?.[key] === value),
  );

  if (!found) {
    throw new Error(`Unable to find element with props ${JSON.stringify(expectedProps)}`);
  }

  return found;
}

function findButtonByText(node: TestNode, text: string): TestElement {
  const found = findNode(
    node,
    (candidate) => candidate.type === "button" && nodeHasText(candidate, text),
  );

  if (!found) {
    throw new Error(`Unable to find button with text ${text}`);
  }

  return found;
}

function getFunctionProp(element: TestElement, propName: string): (...args: unknown[]) => unknown {
  const propValue = element.props?.[propName];

  if (typeof propValue !== "function") {
    throw new Error(`Expected ${propName} to be a function`);
  }

  return propValue as (...args: unknown[]) => unknown;
}

function findNode(
  node: TestNode,
  predicate: (candidate: TestElement) => boolean,
): TestElement | null {
  if (node === null || node === undefined || typeof node === "boolean") {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof node === "string" || typeof node === "number") {
    return null;
  }

  if (typeof node.type === "function") {
    return findNode(node.type(node.props ?? {}), predicate);
  }

  if (predicate(node)) {
    return node;
  }

  return findNode(node.props?.children, predicate);
}

function nodeHasText(node: TestNode, text: string): boolean {
  if (node === null || node === undefined || typeof node === "boolean") {
    return false;
  }

  if (Array.isArray(node)) {
    return node.some((child) => nodeHasText(child, text));
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node) === text;
  }

  if (typeof node.type === "function") {
    return nodeHasText(node.type(node.props ?? {}), text);
  }

  return nodeHasText(node.props?.children, text);
}
