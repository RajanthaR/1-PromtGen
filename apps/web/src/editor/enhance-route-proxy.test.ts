import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/enhance/[mode]/route";

describe("enhance route proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns structured JSON when the upstream API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:4000");
      }),
    );

    const response = await POST(
      new Request("http://localhost:3000/enhance/enhance", {
        body: JSON.stringify({
          raw_prompt: "Improve this.",
          target_model: "auto",
          prompt_type: "text",
          options: {},
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }) as NextRequest,
      { params: Promise.resolve({ mode: "enhance" }) },
    );

    await expect(response.json()).resolves.toEqual({
      error: "gateway_error",
      message: "connect ECONNREFUSED 127.0.0.1:4000",
    });
    expect(response.status).toBe(502);
  });
});
