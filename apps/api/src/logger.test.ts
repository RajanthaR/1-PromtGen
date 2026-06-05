import { describe, expect, it } from "vitest";

import { createJsonLogger, createLogEvent, redactLogDetails } from "./logger";

describe("structured logging", () => {
  it("creates a stable JSON log event shape", () => {
    expect(createLogEvent("info", "api.health_check", { statusCode: 200 })).toEqual({
      event: "api.health_check",
      level: "info",
      service: "api",
      timestamp: expect.any(String),
      details: {
        statusCode: 200,
      },
    });
  });

  it("redacts secrets and raw prompt fields from details", () => {
    expect(
      redactLogDetails({
        apiKey: "sk-test",
        rawPrompt: "Write using my private token.",
        promptType: "email",
        nested: {
          token: "secret-token",
          mode: "enhance",
        },
      }),
    ).toEqual({
      apiKey: "[REDACTED]",
      rawPrompt: "[REDACTED]",
      promptType: "email",
      nested: {
        token: "[REDACTED]",
        mode: "enhance",
      },
    });
  });

  it("writes one JSON object per log call", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));

    logger.info("api.started", { port: 4000 });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      event: "api.started",
      level: "info",
      service: "api",
      details: {
        port: 4000,
      },
    });
  });
});
