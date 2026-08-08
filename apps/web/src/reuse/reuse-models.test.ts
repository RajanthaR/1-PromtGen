import { describe, expect, it } from "vitest";

import { parseEditorDraftSearchParams } from "../editor/editor-draft";
import {
  createContextSnippet,
  createHistoryEditorUrl,
  createLibraryEditorUrl,
  createTemplateEditorUrl,
  deleteContextSnippet,
  deleteHistoryEntry,
  duplicateLibraryPrompt,
  editLibraryPrompt,
  filterHistoryEntries,
  filterLibraryPrompts,
  filterTemplates,
  formatPromptAsJson,
  formatPromptAsMarkdown,
  generateTemplatePrompt,
  getExplicitlySelectedContextSnippets,
  getLatestLibraryVersion,
  restoreLibraryPromptVersion,
  seedContextSnippets,
  seedHistoryEntries,
  seedLibraryPrompts,
  seedTemplates,
  softDeleteLibraryPrompt,
  tagLibraryPrompt,
  toggleContextSelection,
  updateContextSnippet,
  validateTemplateVariables,
} from "./reuse-models";

describe("library reuse state", () => {
  it("filters saved prompts by text, folder, tag, and deleted visibility", () => {
    expect(
      filterLibraryPrompts(seedLibraryPrompts, {
        folder: "Growth",
        includeDeleted: false,
        query: "sequence",
        tag: "launch",
      }).map((prompt) => prompt.id),
    ).toEqual(["prompt_launch_email"]);

    expect(
      filterLibraryPrompts(seedLibraryPrompts, {
        folder: "Support",
        includeDeleted: false,
        query: "",
        tag: "all",
      }),
    ).toEqual([]);

    expect(
      filterLibraryPrompts(seedLibraryPrompts, {
        folder: "Support",
        includeDeleted: true,
        query: "",
        tag: "all",
      }).map((prompt) => prompt.id),
    ).toEqual(["prompt_support_macro"]);
  });

  it("edits and restores prompts by appending versions without deleting newer versions", () => {
    const edited = editLibraryPrompt(
      seedLibraryPrompts,
      "prompt_interview_synthesis",
      {
        body: "Edited synthesis prompt.",
        changeNote: "Tightened output.",
        title: "Interview synthesis",
      },
      "2026-06-07T09:00:00.000Z",
    );
    const restored = restoreLibraryPromptVersion(
      edited,
      "prompt_interview_synthesis",
      "prompt_interview_synthesis_v1",
      "2026-06-07T10:00:00.000Z",
    );
    const prompt = restored.find((item) => item.id === "prompt_interview_synthesis");

    expect(prompt?.versions.map((version) => version.versionNumber)).toEqual([1, 2, 3]);
    expect(prompt ? getLatestLibraryVersion(prompt).changeNote : "").toBe("Restored version 1.");
    expect(prompt?.versions[1]?.body).toBe("Edited synthesis prompt.");
  });

  it("supports duplicate, tag, soft delete, Markdown copy, JSON copy, and editor links", () => {
    const duplicated = duplicateLibraryPrompt(
      seedLibraryPrompts,
      "prompt_launch_email",
      "2026-06-07T09:00:00.000Z",
    );
    const tagged = tagLibraryPrompt(duplicated, duplicated[0]?.id ?? "", "Onboarding");
    const deleted = softDeleteLibraryPrompt(
      tagged,
      duplicated[0]?.id ?? "",
      "2026-06-07T09:05:00.000Z",
    );
    const prompt = deleted[0];

    expect(prompt?.title).toBe("Launch email sequence copy");
    expect(prompt?.tags).toContain("onboarding");
    expect(prompt?.deletedAt).toBe("2026-06-07T09:05:00.000Z");
    expect(prompt ? formatPromptAsMarkdown(prompt) : "").toContain("# Launch email sequence copy");
    expect(prompt ? JSON.parse(formatPromptAsJson(prompt)).title : "").toBe(
      "Launch email sequence copy",
    );

    const firstPrompt = seedLibraryPrompts[0];
    if (!firstPrompt) {
      throw new Error("Missing seed library prompt.");
    }

    const draft = parseEditorDraftSearchParams(
      Object.fromEntries(
        new URL(`http://localhost:3000${createLibraryEditorUrl(firstPrompt)}`).searchParams,
      ),
    );
    expect(draft?.source).toBe("library");
    expect(draft?.prompt).toContain("Act as a B2B lifecycle marketer.");
  });
});

describe("history reuse state", () => {
  it("keeps operations newest-first, deletable, and sendable to the editor", () => {
    expect(filterHistoryEntries(seedHistoryEntries).map((entry) => entry.id)).toEqual([
      "hist_onboarding_email",
      "hist_release_note",
      "hist_refine_questions",
    ]);
    expect(
      deleteHistoryEntry(seedHistoryEntries, "hist_release_note").map((entry) => entry.id),
    ).toEqual(["hist_onboarding_email", "hist_refine_questions"]);

    const firstEntry = seedHistoryEntries[0];
    if (!firstEntry) {
      throw new Error("Missing seed history entry.");
    }

    const draft = parseEditorDraftSearchParams(
      Object.fromEntries(
        new URL(`http://localhost:3000${createHistoryEditorUrl(firstEntry)}`).searchParams,
      ),
    );
    expect(draft).toMatchObject({
      mode: "enhance",
      source: "history",
      targetModel: "auto",
    });
    expect(draft?.prompt).toContain("Rewrite the onboarding email");
  });
});

describe("context reuse state", () => {
  it("returns only explicitly selected snippets", () => {
    const selectedIds = toggleContextSelection([], "ctx_brand_voice", true);

    expect(getExplicitlySelectedContextSnippets(seedContextSnippets, selectedIds)).toEqual([
      seedContextSnippets[0],
    ]);
    expect(getExplicitlySelectedContextSnippets(seedContextSnippets, [])).toEqual([]);
  });

  it("supports context create, update, and delete", () => {
    const created = createContextSnippet(
      seedContextSnippets,
      {
        body: "Stack: Next.js and TypeScript.",
        kind: "coding_stack",
        tags: ["stack"],
        title: "Frontend stack",
      },
      "2026-06-07T09:00:00.000Z",
    );
    const createdId = created[0]?.id ?? "";
    const updated = updateContextSnippet(
      created,
      createdId,
      {
        body: "Stack: Next.js, React, TypeScript.",
        kind: "coding_stack",
        tags: ["stack", "frontend"],
        title: "Frontend stack",
      },
      "2026-06-07T09:05:00.000Z",
    );

    expect(updated[0]?.body).toContain("React");
    expect(deleteContextSnippet(updated, createdId)).toHaveLength(seedContextSnippets.length);
  });
});

describe("template reuse state", () => {
  it("ships the full launch catalog of 100 public templates", () => {
    expect(seedTemplates).toHaveLength(100);
    expect(new Set(seedTemplates.map((template) => template.id)).size).toBe(100);
  });

  it("filters templates by tag, tool, difficulty, and recent use", () => {
    expect(
      filterTemplates(
        seedTemplates,
        {
          difficulty: "advanced",
          query: "review",
          recentOnly: false,
          tag: "review",
          tool: "claude",
        },
        [],
      ).map((template) => template.id),
    ).toEqual(["tmpl_coding_code_review"]);

    expect(
      filterTemplates(
        seedTemplates,
        {
          difficulty: "all",
          query: "",
          recentOnly: true,
          tag: "all",
          tool: "all",
        },
        ["tmpl_support_reply_general"],
      ).map((template) => template.id),
    ).toEqual(["tmpl_support_reply_general"]);
  });

  it("blocks generation when required variables are empty", () => {
    const template = seedTemplates.find((item) => item.id === "tmpl_content_blog_outline");

    expect(template ? validateTemplateVariables(template, { cta_type: "demo" }) : {}).toEqual({
      audience: "Audience is required.",
      topic: "Topic is required.",
    });
    expect(template ? generateTemplatePrompt(template, { cta_type: "demo" }) : null).toMatchObject({
      prompt: "",
      status: "invalid",
    });
  });

  it("generates an editable filled prompt and round trips it to the editor", () => {
    const template = seedTemplates.find((item) => item.id === "tmpl_content_blog_outline");
    const result = template
      ? generateTemplatePrompt(template, {
          audience: "trial users",
          cta_type: "invite a teammate",
          topic: "team analytics",
        })
      : null;

    expect(result).toMatchObject({ status: "generated" });
    expect(result?.prompt).toContain("trial users");
    expect(result?.prompt).toContain("team analytics");

    const draft = parseEditorDraftSearchParams(
      Object.fromEntries(
        new URL(`http://localhost:3000${createTemplateEditorUrl(result?.prompt ?? "")}`)
          .searchParams,
      ),
    );
    expect(draft?.source).toBe("template");
    expect(draft?.prompt).toContain("team analytics");
  });
});
