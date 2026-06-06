import { describe, expect, it } from "vitest";

import { defaultLlmGatewayRegistry } from "./llm";

describe("defaultLlmGatewayRegistry", () => {
  it("keeps Gemini 3.5 Flash as the launch model with a same-provider fallback", () => {
    expect(defaultLlmGatewayRegistry.defaultModelId).toBe("gemini-3.5-flash");
    expect(defaultLlmGatewayRegistry.fallbackModelId).toBe("gemini-2.5-flash-lite");

    expect(defaultLlmGatewayRegistry.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          family: "gemini",
          id: "gemini-3.5-flash",
          provider: "gemini",
          role: "primary",
          supportsStructuredOutput: true,
        }),
        expect.objectContaining({
          enabled: true,
          family: "gemini",
          id: "gemini-2.5-flash-lite",
          provider: "gemini",
          role: "secondary",
          supportsStructuredOutput: true,
        }),
      ]),
    );
  });

  it("configures the optional judge as a separate OpenAI-family model", () => {
    expect(defaultLlmGatewayRegistry.judgeModelId).toBe("gpt-5.4");
    expect(defaultLlmGatewayRegistry.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          family: "openai",
          id: "gpt-5.4",
          provider: "openai",
          role: "judge",
          supportsStructuredOutput: true,
        }),
      ]),
    );
  });
});
