import { describe, expect, it } from "vitest";

import {
  createInMemoryHistoryUsageStore,
  createPromptHistorySendToEditorResult,
  getPromptHistoryRetentionLimit,
  type HistoryUsagePort,
  type PromptHistoryPlan,
  type RecordPromptOperationInput,
  type UsageEventInput,
} from "./index";

describe("history-usage public boundary", () => {
  it("keeps history and usage operations user-scoped", () => {
    const portMethods = [
      "recordPromptOperation",
      "listPromptHistory",
      "getPromptHistoryEntry",
      "deleteHistoryEntry",
      "recordUsageEvent",
    ] satisfies Array<keyof HistoryUsagePort>;

    expect(portMethods).toHaveLength(5);
  });

  it("keeps usage metadata primitive-only for structured logging and analytics", () => {
    const event = {
      eventName: "prompt_enhancement_requested",
      units: 1,
      metadata: {
        mode: "enhance",
        cached: false,
      },
    } satisfies UsageEventInput;

    expect(event.metadata?.cached).toBe(false);
  });
});

describe("prompt history retention", () => {
  it("maps launch plans to the spec retention caps", () => {
    expect(getPromptHistoryRetentionLimit("free")).toBe(50);
    expect(getPromptHistoryRetentionLimit("pro")).toBe(500);
    expect(getPromptHistoryRetentionLimit("advanced")).toBeNull();
  });

  it("keeps only the latest 50 entries for Free users", async () => {
    const history = createInMemoryHistoryUsageStore({
      defaultPlan: "free",
      createId: createSequentialId(),
      now: createSequentialClock(),
    });

    for (let index = 1; index <= 51; index += 1) {
      await history.recordPromptOperation("free-user", createOperationInput(index));
    }

    const entries = await history.listPromptHistory("free-user");

    expect(entries).toHaveLength(50);
    expect(entries[0]?.original).toBe("Original prompt 51");
    expect(entries.at(-1)?.original).toBe("Original prompt 2");
    await expect(history.getPromptHistoryEntry("free-user", "history-1")).resolves.toBeNull();
  });

  it("keeps only the latest 500 entries for Pro users", async () => {
    const history = createInMemoryHistoryUsageStore({
      defaultPlan: "pro",
      createId: createSequentialId(),
      now: createSequentialClock(),
    });

    for (let index = 1; index <= 501; index += 1) {
      await history.recordPromptOperation("pro-user", createOperationInput(index));
    }

    const entries = await history.listPromptHistory("pro-user");

    expect(entries).toHaveLength(500);
    expect(entries[0]?.original).toBe("Original prompt 501");
    expect(entries.at(-1)?.original).toBe("Original prompt 2");
  });

  it("does not prune Advanced users", async () => {
    const history = createInMemoryHistoryUsageStore({
      defaultPlan: "advanced",
      createId: createSequentialId(),
      now: createSequentialClock(),
    });

    for (let index = 1; index <= 525; index += 1) {
      await history.recordPromptOperation("advanced-user", createOperationInput(index));
    }

    const entries = await history.listPromptHistory("advanced-user");

    expect(entries).toHaveLength(525);
    expect(entries[0]?.original).toBe("Original prompt 525");
    expect(entries.at(-1)?.original).toBe("Original prompt 1");
  });

  it("uses each user's plan when pruning shared storage", async () => {
    const plans = new Map<string, PromptHistoryPlan>([
      ["free-user", "free"],
      ["advanced-user", "advanced"],
    ]);
    const history = createInMemoryHistoryUsageStore({
      getUserPlan: (userId) => plans.get(userId) ?? "free",
      createId: createSequentialId(),
      now: createSequentialClock(),
    });

    for (let index = 1; index <= 51; index += 1) {
      await history.recordPromptOperation("free-user", createOperationInput(index));
      await history.recordPromptOperation("advanced-user", createOperationInput(index));
    }

    await expect(history.listPromptHistory("free-user")).resolves.toHaveLength(50);
    await expect(history.listPromptHistory("advanced-user")).resolves.toHaveLength(51);
  });
});

describe("prompt history entry actions", () => {
  it("deletes only the requested user's history entry", async () => {
    const history = createInMemoryHistoryUsageStore({
      createId: createSequentialId(),
      now: createSequentialClock(),
    });
    const first = await history.recordPromptOperation("user-1", createOperationInput(1));
    await history.recordPromptOperation("user-2", createOperationInput(2));

    await history.deleteHistoryEntry("user-2", first.id);
    await expect(history.getPromptHistoryEntry("user-1", first.id)).resolves.toMatchObject({
      id: first.id,
      original: "Original prompt 1",
    });

    await history.deleteHistoryEntry("user-1", first.id);
    await expect(history.getPromptHistoryEntry("user-1", first.id)).resolves.toBeNull();
    await expect(history.listPromptHistory("user-2")).resolves.toHaveLength(1);
  });

  it("round-trips original and enhanced prompt text into an editor payload", async () => {
    const history = createInMemoryHistoryUsageStore({
      createId: createSequentialId(),
      now: createSequentialClock(),
    });
    const entry = await history.recordPromptOperation("user-1", {
      ...createOperationInput(1),
      original: "Draft a renewal email.",
      enhanced: "You are a lifecycle marketer. Draft a concise renewal email.",
      mode: "shorten",
      targetModel: "gpt-5.4",
      promptType: "text",
    });

    expect(createPromptHistorySendToEditorResult(entry)).toEqual({
      id: "history-1",
      original: "Draft a renewal email.",
      enhanced: "You are a lifecycle marketer. Draft a concise renewal email.",
      editorPayload: {
        raw_prompt: "Draft a renewal email.",
        enhanced_prompt: "You are a lifecycle marketer. Draft a concise renewal email.",
        mode: "shorten",
        target_model: "gpt-5.4",
        prompt_type: "text",
      },
    });
  });
});

function createOperationInput(index: number): RecordPromptOperationInput {
  return {
    original: `Original prompt ${index}`,
    enhanced: `Enhanced prompt ${index}`,
    mode: "enhance",
    targetModel: "auto",
    promptType: "text",
    structureScoreBefore: 25,
    structureScoreAfter: 80,
    tokens: 100 + index,
    provider: "test-provider",
    model: "test-model",
    latencyMs: 20 + index,
    saved: false,
  };
}

function createSequentialId(): () => string {
  let index = 0;

  return () => {
    index += 1;
    return `history-${index}`;
  };
}

function createSequentialClock(): () => Date {
  let offset = 0;

  return () => {
    offset += 1;
    return new Date(Date.UTC(2026, 5, 7, 0, 0, offset));
  };
}
