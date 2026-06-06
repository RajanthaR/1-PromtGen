import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import {
  EditorShell,
  createEditorSubmitPayload,
  createInitialEditorShellState,
  getSelectedContextSnippets,
  isPromptSubmittable,
  setEditorShellOption,
  toggleContextSelection,
} from "./editor-shell";
import { contextSnippetOptions } from "./editor-options";
import { emptyStateHowItWorks, samplePrompt } from "./sample-prompt";

describe("EditorShell state", () => {
  it("defaults to Auto target model with Enhance mode and neutral tone", () => {
    expect(createInitialEditorShellState()).toMatchObject({
      mode: "enhance",
      rawPrompt: "",
      selectedContextIds: [],
      targetModel: "auto",
      tone: "neutral",
    });
  });

  it("updates selector-backed options", () => {
    const initialState = createInitialEditorShellState();
    const withTarget = setEditorShellOption(initialState, "targetModel", "gemini");
    const withMode = setEditorShellOption(withTarget, "mode", "refine");
    const withTone = setEditorShellOption(withMode, "tone", "technical");

    expect(withTone).toMatchObject({
      mode: "refine",
      targetModel: "gemini",
      tone: "technical",
    });
  });

  it("keeps context snippets explicit and selected only", () => {
    const initialState = createInitialEditorShellState();
    const withAudience = toggleContextSelection(initialState, "audience-saas-founders", true);
    const withBrandVoice = toggleContextSelection(withAudience, "brand-voice-practical", true);
    const withoutAudience = toggleContextSelection(withBrandVoice, "audience-saas-founders", false);

    expect(withoutAudience.selectedContextIds).toEqual(["brand-voice-practical"]);
    expect(getSelectedContextSnippets(withoutAudience.selectedContextIds)).toEqual([
      contextSnippetOptions[1],
    ]);
  });

  it("disables action when the prompt is empty or whitespace", () => {
    expect(isPromptSubmittable("")).toBe(false);
    expect(isPromptSubmittable("   \n\t")).toBe(false);
    expect(isPromptSubmittable("Write a short product update")).toBe(true);
  });

  it("builds the later API payload with selected context ids and bodies only", () => {
    const state = createInitialEditorShellState({
      mode: "shorten",
      rawPrompt: "Make this launch prompt concise.",
      selectedContextIds: ["launch-email-format"],
      targetModel: "auto",
      tone: "concise",
    });

    expect(createEditorSubmitPayload(state)).toEqual({
      mode: "shorten",
      request: {
        options: {
          context_ids: ["launch-email-format"],
          context_snippets: [contextSnippetOptions[2]],
          tone: "concise",
        },
        prompt_type: "text",
        raw_prompt: "Make this launch prompt concise.",
        target_model: "auto",
      },
    });
  });
});

describe("EditorShell markup", () => {
  it("renders labeled editor controls, explicit context picker, and empty state", () => {
    const markup = renderToStaticMarkup(createElement(EditorShell));

    expect(markup).toContain("Target model");
    expect(markup).toContain("Mode");
    expect(markup).toContain("Tone");
    expect(markup).toContain("Original prompt");
    expect(markup).toContain("Context snippets");
    expect(markup).toContain(samplePrompt);
    expect(markup).toContain(emptyStateHowItWorks);
    expect(markup).toContain("No context selected");
    expect(markup).toContain('disabled=""');
  });

  it("renders an enabled action for non-empty prompts", () => {
    const markup = renderToStaticMarkup(
      createElement(EditorShell, {
        initialState: { mode: "improve", rawPrompt: "Improve this prompt." },
      }),
    );

    expect(markup).toContain("Improve prompt");
    expect(markup).toContain("Ready to run.");
    expect(markup).not.toContain("Enter a prompt to enable actions.");
  });
});
