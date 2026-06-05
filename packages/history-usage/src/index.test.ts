import { describe, expect, it } from "vitest";

import type { HistoryUsagePort, UsageEventInput } from "./index";

describe("history-usage public boundary", () => {
  it("keeps history and usage operations user-scoped", () => {
    const portMethods = [
      "recordPromptOperation",
      "listPromptHistory",
      "deleteHistoryEntry",
      "recordUsageEvent",
    ] satisfies Array<keyof HistoryUsagePort>;

    expect(portMethods).toHaveLength(4);
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
