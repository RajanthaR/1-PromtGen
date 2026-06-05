import { describe, expect, it } from "vitest";

import { getWebPlaceholderStatus } from "./placeholder";

describe("web placeholder", () => {
  it("exposes only foundation status", () => {
    expect(getWebPlaceholderStatus()).toEqual({
      service: {
        name: "web",
        state: "ok",
        version: "0.0.0",
      },
      state: "Phase 0 foundation",
      title: "PromptForge Studio",
    });
  });
});
