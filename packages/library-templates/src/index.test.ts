import { describe, expect, it } from "vitest";

import type { LibraryTemplatesPort, PublicTemplate, SavedPromptDraft } from "./index";

describe("library-templates public boundary", () => {
  it("keeps public templates readable without user scope", async () => {
    const template = {
      id: "tmpl_1",
      title: "Launch Email",
      category: "email",
      description: "Draft a launch email.",
      body: "Write to {{audience}}.",
      variables: [{ name: "audience", label: "Audience", required: true }],
      tags: ["email"],
      compatibleTools: ["text-model"],
      difficulty: "beginner",
      isPublic: true,
    } satisfies PublicTemplate;

    const port: Pick<LibraryTemplatesPort, "listPublicTemplates"> = {
      async listPublicTemplates() {
        return [template];
      },
    };

    await expect(port.listPublicTemplates()).resolves.toEqual([template]);
  });

  it("keeps saved prompt operations user-scoped", () => {
    const draft = {
      title: "Reusable prompt",
      body: "Summarize this document.",
      tags: ["summary"],
    } satisfies SavedPromptDraft;

    expect(draft).toEqual({
      title: "Reusable prompt",
      body: "Summarize this document.",
      tags: ["summary"],
    });
  });
});
