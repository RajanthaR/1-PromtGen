import { describe, expect, it } from "vitest";

import { createHealthPayload, createServiceStatus, resolveApiPort } from "./server";

describe("api placeholder", () => {
  it("reports a healthy foundation service status", () => {
    expect(createServiceStatus()).toEqual({
      name: "api",
      state: "ok",
      version: "0.0.0",
    });
  });

  it("resolves the API port through the shared env helper", () => {
    expect(resolveApiPort({ API_PORT: "4567" })).toBe(4567);
  });

  it("creates a health payload without requiring real secrets", () => {
    expect(
      createHealthPayload({
        apiPort: 4000,
        appUrl: "http://localhost:3000",
        nodeEnv: "test",
      }),
    ).toEqual({
      env: "test",
      port: 4000,
      service: {
        name: "api",
        state: "ok",
        version: "0.0.0",
      },
    });
  });
});
