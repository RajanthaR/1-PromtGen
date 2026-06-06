import { describe, expect, it } from "vitest";

import {
  buildEnhancementHttpRequest,
  createEnhancementClient,
  enhancementProgressText,
  getFallbackModelLabel,
} from "./enhancement-client";
import type { EnhancementClientError } from "./enhancement-client";
import type { EnhancementResponse } from "./types";

describe("enhancement client", () => {
  it("builds POST body with tone and exactly selected context snippets", () => {
    expect(
      buildEnhancementHttpRequest({
        mode: "enhance",
        rawPrompt: "Write a launch email.",
        targetModel: "gemini",
        tone: "persuasive",
        selectedContextSnippets: [
          {
            id: "ctx_1",
            title: "Audience",
            body: "Trial users who teach online.",
          },
        ],
        userId: "user_123",
      }),
    ).toEqual({
      raw_prompt: "Write a launch email.",
      target_model: "gemini",
      prompt_type: "text",
      options: {
        tone: "persuasive",
        context_ids: ["ctx_1"],
        context_snippets: ["Trial users who teach online."],
      },
      user_id: "user_123",
    });
  });

  it("posts to the mode endpoint and labels fallback model results", async () => {
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const response = createEnhancementResponse({
      meta: {
        provider: "openai",
        model: "gpt-fallback",
        tokens: 42,
        latency_ms: 1200,
        fellback: true,
      },
    });
    const client = createEnhancementClient({
      baseUrl: "https://api.test/",
      fetchImpl: async (input, init) => {
        calls.push({ input: String(input), init: init ?? {} });
        return jsonResponse(response);
      },
    });

    const result = await client.enhance({
      mode: "shorten",
      rawPrompt: "Shorten this prompt for support agents.",
      targetModel: "auto",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://api.test/enhance/shorten");
    expect(calls[0]?.init.method).toBe("POST");
    expect(getFallbackModelLabel(result)).toBe("gpt-fallback");
  });

  it("emits honest progress before the non-streaming response without faking content", async () => {
    const client = createEnhancementClient({
      fetchImpl: async () => jsonResponse(createEnhancementResponse()),
    });
    const events = [];

    for await (const event of client.stream({
      mode: "enhance",
      rawPrompt: "Write a better prompt.",
      targetModel: "auto",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "progress",
        statusText: enhancementProgressText,
      },
      {
        type: "success",
        response: createEnhancementResponse(),
      },
    ]);
  });

  it("turns API errors into typed errors that preserve the prompt", async () => {
    const client = createEnhancementClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            error: "gateway_error",
            message: "Provider request failed.",
            raw_prompt: "Write a launch email.",
          },
          502,
        ),
    });

    await expect(
      client.enhance({
        mode: "enhance",
        rawPrompt: "Write a launch email.",
        targetModel: "auto",
      }),
    ).rejects.toMatchObject({
      code: "gateway_error",
      message: "Provider request failed.",
      rawPrompt: "Write a launch email.",
      status: 502,
    } satisfies Partial<EnhancementClientError>);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

function createEnhancementResponse(
  overrides: Partial<EnhancementResponse> = {},
): EnhancementResponse {
  return {
    result: {
      title: "Launch email",
      needs_clarification: false,
      questions: [],
      enhanced_prompt: "Write a launch email with a subject line and three benefit bullets.",
      role: "Lifecycle marketer",
      task: "Write a launch email.",
      context: "For trial users.",
      constraints: ["Keep it concise."],
      format: "Subject line and body.",
      tone: "professional",
      success_criteria: ["Clear CTA."],
      explanation: ["Added audience and output format."],
      added: ["Audience"],
      removed: [],
      changed: ["Expanded the task."],
    },
    quality_checklist: {
      before: {
        structure_score: 40,
        items: [],
      },
      after: {
        structure_score: 85,
        items: [],
      },
    },
    meta: {
      provider: "gemini",
      model: "gemini-3.5-flash",
      tokens: 30,
      latency_ms: 800,
      fellback: false,
    },
    ...overrides,
  };
}
