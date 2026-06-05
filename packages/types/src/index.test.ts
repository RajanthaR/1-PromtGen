import { describe, expect, it } from "vitest";

import { foundationSchemaVersion, type DependencyStatus, type ServiceStatus } from "./index";

describe("shared type stubs", () => {
  it("exports a stable foundation schema version", () => {
    const status = {
      name: "api",
      state: "ok",
      version: foundationSchemaVersion,
    } satisfies ServiceStatus;

    expect(status).toEqual({
      name: "api",
      state: "ok",
      version: "0.0.0",
    });
  });

  it("exports dependency status shape for health checks", () => {
    const redis = {
      name: "redis",
      state: "not_configured",
      configured: false,
    } satisfies DependencyStatus;

    expect(redis).toEqual({
      name: "redis",
      state: "not_configured",
      configured: false,
    });
  });
});
