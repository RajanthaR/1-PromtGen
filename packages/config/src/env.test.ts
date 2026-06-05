import { describe, expect, it } from "vitest";

import { loadPromptGenEnv } from "./env";

describe("loadPromptGenEnv", () => {
  it("loads safe defaults for Phase 0 placeholders", () => {
    expect(loadPromptGenEnv({})).toEqual({
      apiPort: 4000,
      appUrl: "http://localhost:3000",
      nodeEnv: "development",
    });
  });

  it("normalizes documented placeholders without treating them as secrets", () => {
    expect(
      loadPromptGenEnv({
        API_PORT: "4500",
        LLM_PROVIDER_API_KEY: "replace-with-local-secret",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
        NODE_ENV: "test",
      }),
    ).toEqual({
      apiPort: 4500,
      appUrl: "http://localhost:3000",
      nodeEnv: "test",
    });
  });

  it("rejects invalid ports early", () => {
    expect(() => loadPromptGenEnv({ API_PORT: "70000" })).toThrow(
      "API_PORT must be an integer between 1 and 65535.",
    );
  });
});
