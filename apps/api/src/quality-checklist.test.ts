import { describe, expect, it } from "vitest";

import type { ChecklistDimension, PromptStructureChecklist } from "./quality-checklist";
import { evaluatePromptStructure } from "./quality-checklist";

const completePrompt = `# Role
You are a B2B SaaS lifecycle marketer.

# Task
Write a launch email for SaaS operations leaders.

# Context
Product: self-serve analytics dashboard. Goal: help teams spot performance issues faster.

# Constraints
Use only the provided facts, keep the body under 180 words, and include [PROOF POINT].

# Output
Return Markdown with a subject line, concise opening, three benefit bullets, and one CTA.

# Success criteria
The email is ready to copy and makes the dashboard value clear.`;

describe("quality checklist heuristic", () => {
  it("returns byte-identical JSON for identical input", () => {
    const first = JSON.stringify(evaluatePromptStructure(completePrompt));
    const second = JSON.stringify(evaluatePromptStructure(completePrompt));

    expect(first).toBe(second);
  });

  it("returns only checklist items and a structure_score label", () => {
    const result = evaluatePromptStructure(completePrompt);

    expect(Object.keys(result)).toEqual(["items", "structure_score"]);
    expect(result.items.map((item) => item.dimension)).toEqual([
      "Clarity",
      "Context",
      "Specificity",
      "Output format",
      "Model/tool fit",
      "Safety/privacy",
      "Concision",
    ]);
    expect(JSON.stringify(result)).not.toContain("quality_score");
  });

  it("scores a structurally complete prompt at 100", () => {
    const result = evaluatePromptStructure(completePrompt);

    expect(result.structure_score).toBe(100);
    expect(result.items.every((item) => item.status === "pass")).toBe(true);
  });

  it("requires one-line reasons and fix suggestions for every non-passing item", () => {
    const result = evaluatePromptStructure("Make this better.");

    for (const item of result.items.filter((checklistItem) => checklistItem.status !== "pass")) {
      expect(item.reason.trim()).toBe(item.reason);
      expect(item.reason).not.toContain("\n");
      expect(item.reason.length).toBeGreaterThan(0);
      expect(item.fix_suggestion.trim()).toBe(item.fix_suggestion);
      expect(item.fix_suggestion).not.toContain("\n");
      expect(item.fix_suggestion.length).toBeGreaterThan(0);
    }
  });

  it("marks clarity missing when the task is vague", () => {
    const result = evaluatePromptStructure("Make this better.");

    expect(statusFor(result, "Clarity")).toBe("missing");
  });

  it("marks context missing when audience, situation, and goal are absent", () => {
    const result = evaluatePromptStructure(
      "Write a concise Markdown checklist with three bullets and include a deadline.",
    );

    expect(statusFor(result, "Context")).toBe("missing");
  });

  it("marks specificity missing when inputs, constraints, and success criteria are absent", () => {
    const result = evaluatePromptStructure(
      "Write a product announcement for customers in Markdown.",
    );

    expect(statusFor(result, "Specificity")).toBe("missing");
  });

  it("marks output format missing when no response shape is requested", () => {
    const result = evaluatePromptStructure(
      "Write a launch email for teachers that includes a clear subject and a concise benefit.",
    );

    expect(statusFor(result, "Output format")).toBe("missing");
  });

  it("marks model/tool fit missing when the prompt has no role, sections, model, or tool signal", () => {
    const result = evaluatePromptStructure(
      "Write a clear launch email for teachers with three benefit bullets and a CTA.",
    );

    expect(statusFor(result, "Model/tool fit")).toBe("missing");
  });

  it("marks safety/privacy missing when likely credentials are present", () => {
    const result = evaluatePromptStructure(
      "Write a support reply using this API key sk-test-1234567890abcdefghijklmnop.",
    );

    expect(statusFor(result, "Safety/privacy")).toBe("missing");
  });

  it("does not treat harmless secret or token wording as sensitive data", () => {
    const story = evaluatePromptStructure(
      "Write a short story about a secret garden for students in Markdown.",
    );
    const parser = evaluatePromptStructure(
      "Write a parser that returns the first token from each sentence in JSON.",
    );

    expect(statusFor(story, "Safety/privacy")).toBe("pass");
    expect(statusFor(parser, "Safety/privacy")).toBe("pass");
  });

  it("marks concision partial when the prompt is actionable but thin", () => {
    const result = evaluatePromptStructure("Write a launch email for teachers in Markdown.");

    expect(statusFor(result, "Concision")).toBe("partial");
  });
});

function statusFor(result: PromptStructureChecklist, dimension: ChecklistDimension): string {
  const item = result.items.find((checklistItem) => checklistItem.dimension === dimension);

  if (!item) {
    throw new Error(`Missing dimension: ${dimension}`);
  }

  return item.status;
}
