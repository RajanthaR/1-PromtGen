import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditorHome, editorHomeTestIds } from "./editor-home";

describe("EditorHome", () => {
  it("renders the integrated editor home with the empty state", () => {
    const markup = renderToStaticMarkup(createElement(EditorHome));

    expect(markup).toContain("PromptForge Studio");
    expect(markup).toContain("Ready when your prompt is");
    expect(markup).toContain("Select only the context snippets you want included");
    expect(markup).toContain("Add a prompt to enhance.");
  });

  it("exposes the canonical loading text for the live state", () => {
    expect(editorHomeTestIds.loadingText).toBe("Structuring your prompt…");
  });
});
