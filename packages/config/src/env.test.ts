import { describe, expect, it } from "vitest";

import { loadPromptGenEnv } from "./env";

describe("loadPromptGenEnv", () => {
  it("loads safe defaults for Phase 0 placeholders", () => {
    expect(loadPromptGenEnv({})).toEqual({
      apiPort: 4000,
      appUrl: "http://localhost:3000",
      authSessionTtlSeconds: 2_592_000,
      nodeEnv: "development",
      promptQualityJudgeEnabled: false,
    });
  });

  it("normalizes documented placeholders without treating them as secrets", () => {
    expect(
      loadPromptGenEnv({
        API_PORT: "4500",
        AUTH_SESSION_TTL_SECONDS: "3600",
        GOOGLE_OAUTH_CLIENT_ID: "local-google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "replace-with-local-secret",
        LLM_JUDGE_PROVIDER_API_KEY: "replace-with-local-secret",
        LLM_PROVIDER_API_KEY: "replace-with-local-secret",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
        NODE_ENV: "test",
        PROMPTGEN_LLM_JUDGE_ENABLED: "false",
      }),
    ).toEqual({
      apiPort: 4500,
      appUrl: "http://localhost:3000",
      authSessionTtlSeconds: 3600,
      googleOAuthClientId: "local-google-client-id",
      nodeEnv: "test",
      promptQualityJudgeEnabled: false,
    });
  });

  it("loads the optional LLM judge feature flag and provider key", () => {
    expect(
      loadPromptGenEnv({
        LLM_JUDGE_PROVIDER_API_KEY: "test-openai-key",
        PROMPTGEN_LLM_JUDGE_ENABLED: "1",
      }),
    ).toMatchObject({
      llmJudgeProviderApiKey: "test-openai-key",
      promptQualityJudgeEnabled: true,
    });
  });

  it("adds a default protocol when local app URLs omit one", () => {
    expect(
      loadPromptGenEnv({
        NEXT_PUBLIC_APP_URL: "localhost:3000",
      }).appUrl,
    ).toBe("http://localhost:3000");
  });

  it("rejects invalid ports early", () => {
    expect(() => loadPromptGenEnv({ API_PORT: "70000" })).toThrow(
      "API_PORT must be an integer between 1 and 65535.",
    );
  });

  it("rejects invalid auth session TTL values early", () => {
    expect(() => loadPromptGenEnv({ AUTH_SESSION_TTL_SECONDS: "0" })).toThrow(
      "AUTH_SESSION_TTL_SECONDS must be a positive integer.",
    );
  });

  it("rejects invalid LLM judge feature flag values early", () => {
    expect(() => loadPromptGenEnv({ PROMPTGEN_LLM_JUDGE_ENABLED: "yes" })).toThrow(
      "PROMPTGEN_LLM_JUDGE_ENABLED must be true, false, 1, or 0.",
    );
  });
});
