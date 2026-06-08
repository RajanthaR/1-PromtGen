import { describe, expect, it } from "vitest";

import {
  ContextLibraryError,
  InMemoryContextStore,
  createContextService,
  type ContextPort,
  type SelectedContextSnippet,
} from "./index";

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

  it("creates, updates, lists, and deletes user-scoped snippets", async () => {
    const service = createContextService(new InMemoryContextStore(), {
      clock: (() => {
        const dates = [new Date("2026-06-07T00:00:00.000Z"), new Date("2026-06-07T00:05:00.000Z")];
        return () => dates.shift() ?? new Date("2026-06-07T00:10:00.000Z");
      })(),
      idGenerator: () => "ctx_brand_voice",
    });

    const created = await service.createSnippet(" user_123 ", {
      body: " Use short sentences. ",
      kind: "brand_voice",
      tags: [" Voice ", "voice", "Launch"],
      title: " Brand voice ",
    });

    expect(created).toMatchObject({
      id: "ctx_brand_voice",
      userId: "user_123",
      title: "Brand voice",
      body: "Use short sentences.",
      kind: "brand_voice",
      tags: ["voice", "launch"],
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    await expect(
      service.updateSnippet("user_123", "ctx_brand_voice", {
        body: "Use short sentences and concrete examples.",
        kind: "brand_voice",
        tags: ["voice"],
        title: "Brand voice v2",
      }),
    ).resolves.toMatchObject({
      title: "Brand voice v2",
      updatedAt: new Date("2026-06-07T00:05:00.000Z"),
    });

    await expect(service.listSnippets("user_123")).resolves.toEqual([
      expect.objectContaining({
        body: "Use short sentences and concrete examples.",
        id: "ctx_brand_voice",
      }),
    ]);

    await service.deleteSnippet("user_123", "ctx_brand_voice");
    await expect(service.listSnippets("user_123")).resolves.toEqual([]);
  });

  it("preserves explicit selection order and never returns unselected snippets", async () => {
    const store = new InMemoryContextStore();
    const service = createContextService(store);
    const now = new Date("2026-06-07T00:00:00.000Z");

    store.seed({
      body: "Selected launch audience.",
      createdAt: now,
      id: "ctx_audience",
      kind: "audience",
      tags: [],
      title: "Audience",
      updatedAt: now,
      userId: "user_123",
    });
    store.seed({
      body: "Unselected private pricing context.",
      createdAt: now,
      id: "ctx_pricing",
      kind: "product",
      tags: [],
      title: "Pricing",
      updatedAt: now,
      userId: "user_123",
    });
    store.seed({
      body: "Other user's selected-looking context.",
      createdAt: now,
      id: "ctx_other",
      kind: "other",
      tags: [],
      title: "Other",
      updatedAt: now,
      userId: "user_456",
    });

    await expect(
      service.listSelectedSnippets("user_123", ["ctx_audience", "ctx_audience"]),
    ).resolves.toEqual([
      {
        body: "Selected launch audience.",
        id: "ctx_audience",
        title: "Audience",
      },
    ]);

    await expect(service.listSelectedSnippets("user_123", ["ctx_other"])).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("validates required fields before storing snippets", async () => {
    const service = createContextService(new InMemoryContextStore());

    await expect(
      service.createSnippet("user_123", {
        body: "   ",
        kind: "other",
        tags: [],
        title: "Empty body",
      }),
    ).rejects.toBeInstanceOf(ContextLibraryError);
  });
});
