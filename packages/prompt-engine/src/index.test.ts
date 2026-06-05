import { describe, expect, it } from "vitest";

import { createPhaseOnePromptEngineStub, type PromptEngineRequest } from "./index";

describe("prompt-engine public boundary", () => {
  it("requires user scope and selected context ids for enhancement requests", () => {
    const request = {
      userId: "user_123",
      rawPrompt: "Write a launch email.",
      mode: "enhance",
      promptType: "email",
      selectedContextSnippetIds: ["ctx_1"],
    } satisfies PromptEngineRequest;

    expect(request.selectedContextSnippetIds).toEqual(["ctx_1"]);
  });

  it("keeps Phase 1 enhancement as a stub with no provider call", async () => {
    await expect(
      createPhaseOnePromptEngineStub().enhancePrompt({
        userId: "user_123",
        rawPrompt: "Improve this.",
        mode: "improve",
        promptType: "general",
        selectedContextSnippetIds: [],
      }),
    ).rejects.toThrow("Prompt engine enhancement is deferred until Phase 2.");
  });
});
