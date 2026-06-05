import { describe, expect, it } from "vitest";

import type { ContextPort, SelectedContextSnippet } from "./index";

describe("context public boundary", () => {
  it("returns only explicitly selected snippets for enhancement", async () => {
    const selected = {
      id: "ctx_1",
      title: "Brand voice",
      body: "Plain and direct.",
    } satisfies SelectedContextSnippet;

    const port: Pick<ContextPort, "listSelectedSnippets"> = {
      async listSelectedSnippets(_userId, snippetIds) {
        return snippetIds.includes(selected.id) ? [selected] : [];
      },
    };

    await expect(port.listSelectedSnippets("user_123", ["ctx_1"])).resolves.toEqual([selected]);
    await expect(port.listSelectedSnippets("user_123", [])).resolves.toEqual([]);
  });
});
