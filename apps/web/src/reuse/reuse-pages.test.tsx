import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContextPage } from "./context-page";
import { HistoryPage } from "./history-page";
import { LibraryPage } from "./library-page";
import { TemplatesPage } from "./templates-page";

describe("reuse pages", () => {
  it("renders the Library page with filter, versioning, copy, and restore affordances", () => {
    const markup = renderToStaticMarkup(createElement(LibraryPage));

    expect(markup).toContain("Saved prompts");
    expect(markup).toContain("Search");
    expect(markup).toContain("Folder");
    expect(markup).toContain("Tag");
    expect(markup).toContain("Include deleted");
    expect(markup).toContain("Duplicate");
    expect(markup).toContain("Pin");
    expect(markup).toContain("Copy Markdown");
    expect(markup).toContain("Copy JSON");
    expect(markup).toContain("Restore as new version");
  });

  it("renders the History page with chronological operations, delete, and send-to-editor", () => {
    const markup = renderToStaticMarkup(createElement(HistoryPage));

    expect(markup).toContain("Prompt operations");
    expect(markup).toContain("Chronological history");
    expect(markup).toContain("Send to editor");
    expect(markup).toContain("Delete");
    expect(markup).toContain("Original");
    expect(markup).toContain("Enhanced");
  });

  it("renders the Context page with CRUD controls and explicit selected snippets", () => {
    const markup = renderToStaticMarkup(createElement(ContextPage));

    expect(markup).toContain("Reusable snippets");
    expect(markup).toContain("New snippet");
    expect(markup).toContain("Snippet editor");
    expect(markup).toContain("Selected snippets");
    expect(markup).toContain("No snippets selected.");
    expect(markup).toContain("Edit");
    expect(markup).toContain("Delete");
    expect(markup.toLowerCase()).not.toContain("auto-inject");
  });

  it("renders the Templates page with filters, required fields, generate, and editor send", () => {
    const markup = renderToStaticMarkup(createElement(TemplatesPage));

    expect(markup).toContain("Prompt templates");
    expect(markup).toContain("Recently used");
    expect(markup).toContain("Difficulty");
    expect(markup).toContain("Tool");
    expect(markup).toContain("Fill variables");
    expect(markup).toContain('required=""');
    expect(markup).toContain("Generate filled prompt");
  });
});
