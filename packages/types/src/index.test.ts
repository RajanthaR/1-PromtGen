import { describe, expect, it } from "vitest";

import { foundationSchemaVersion, type ServiceStatus } from "./index";

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
});
