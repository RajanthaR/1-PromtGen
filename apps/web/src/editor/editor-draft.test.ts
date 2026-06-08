import { describe, expect, it } from "vitest";

import { createEditorDraftUrl, parseEditorDraftSearchParams } from "./editor-draft";

describe("editor draft URLs", () => {
  it("round trips send-to-editor payloads into an editable editor draft", () => {
    const url = createEditorDraftUrl({
      contextIds: ["ctx_1", "ctx_2"],
      mode: "shorten",
      prompt: "  Draft a concise product update.  ",
      source: "history",
      targetModel: "gemini",
      tone: "concise",
    });
    const parsedUrl = new URL(`http://localhost:3000${url}`);

    expect(parseEditorDraftSearchParams(Object.fromEntries(parsedUrl.searchParams))).toEqual({
      contextIds: ["ctx_1", "ctx_2"],
      mode: "shorten",
      prompt: "Draft a concise product update.",
      source: "history",
      targetModel: "gemini",
      tone: "concise",
    });
  });

  it("defaults unknown query values to launch-safe editor options", () => {
    expect(
      parseEditorDraftSearchParams({
        mode: "image",
        prompt: "Improve this prompt.",
        source: "shared-workspace",
        targetModel: "video-tool",
        tone: "dramatic",
      }),
    ).toMatchObject({
      mode: "enhance",
      prompt: "Improve this prompt.",
      source: "direct",
      targetModel: "auto",
      tone: "neutral",
    });
  });

  it("ignores empty prompt drafts", () => {
    expect(parseEditorDraftSearchParams({ prompt: "   " })).toBeNull();
  });
});
