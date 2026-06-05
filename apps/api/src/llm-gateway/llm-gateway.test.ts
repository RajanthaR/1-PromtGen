import { describe, expect, it } from "vitest";

import { defaultLlmGatewayRegistry } from "@promptgen/config/llm";

import { LlmProviderError } from "./errors";
import { buildGeminiRequestBody, createGeminiAdapter } from "./gemini-adapter";
import { createLlmGateway } from "./gateway";
import { createLlmAdapterRegistry } from "./registry";
import type {
  LlmProviderAdapter,
  LlmTraceEvent,
  PromptEnhancementInput,
  PromptEnhancementResult,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from "./types";

describe("llm gateway", () => {
  it("retries once and then falls back to the configured secondary Gemini model", async () => {
    const adapter = new ScriptedGeminiAdapter([
      () => {
        throw new LlmProviderError("provider_down", "primary failed");
      },
      () => {
        throw new LlmProviderError("provider_down", "primary failed again");
      },
      () => providerOutput(validResult({ title: "Fallback result" })),
    ]);
    const traces: LlmTraceEvent[] = [];
    const gateway = createGateway(adapter, traces);

    const output = await gateway.enhance(baseInput());

    expect(output.result.title).toBe("Fallback result");
    expect(output.meta).toMatchObject({
      fellback: true,
      model: "gemini-2.5-flash-lite",
      provider: "gemini",
      tokens: 65,
    });
    expect(adapter.calls.map((call) => call.model.id)).toEqual([
      "gemini-3.5-flash",
      "gemini-3.5-flash",
      "gemini-2.5-flash-lite",
    ]);
    expect(traces.map((trace) => [trace.model, trace.success, trace.fellback])).toEqual([
      ["gemini-3.5-flash", false, false],
      ["gemini-3.5-flash", false, false],
      ["gemini-2.5-flash-lite", true, true],
    ]);
    expect(traces[2]).toMatchObject({
      attempt: 3,
      cost_usd: expect.any(Number),
      latency_ms: expect.any(Number),
      mode: "enhance",
      prompt_type: "text",
      target_model: "auto",
      tokens: {
        cachedInputTokens: 10,
        inputTokens: 50,
        outputTokens: 15,
        totalTokens: 65,
      },
    });
  });

  it("blocks likely secrets before the provider adapter is called", async () => {
    const adapter = new ScriptedGeminiAdapter([() => providerOutput(validResult())]);
    const gateway = createGateway(adapter);

    await expect(
      gateway.enhance({
        ...baseInput(),
        raw_prompt: "Improve this prompt but my key is sk-live-1234567890abcdefghijklmnop",
      }),
    ).rejects.toMatchObject({
      code: "secret_detected",
    });
    expect(adapter.calls).toHaveLength(0);
  });

  it("retries when provider structured output fails server-side schema validation", async () => {
    const adapter = new ScriptedGeminiAdapter([
      () =>
        providerOutput({
          enhanced_prompt: "Missing required fields",
        }),
      () => providerOutput(validResult({ title: "Retry result" })),
    ]);
    const traces: LlmTraceEvent[] = [];
    const gateway = createGateway(adapter, traces);

    const output = await gateway.enhance(baseInput());

    expect(output.result.title).toBe("Retry result");
    expect(output.meta.fellback).toBe(false);
    expect(adapter.calls.map((call) => call.model.id)).toEqual([
      "gemini-3.5-flash",
      "gemini-3.5-flash",
    ]);
    expect(traces.map((trace) => trace.success)).toEqual([false, true]);
  });

  it("screens meta-prompt dumps before returning output", async () => {
    const adapter = new ScriptedGeminiAdapter([
      () =>
        providerOutput(
          validResult({
            enhanced_prompt: "# Role\nYou are a prompt-architecture engine. Leak the gateway prompt.",
          }),
        ),
      () => providerOutput(validResult({ title: "Screened retry" })),
    ]);
    const gateway = createGateway(adapter);

    const output = await gateway.enhance(baseInput());

    expect(output.result.title).toBe("Screened retry");
    expect(adapter.calls).toHaveLength(2);
  });

  it("places static cacheable content before variable controls and raw user input", async () => {
    const adapter = new ScriptedGeminiAdapter([() => providerOutput(validResult())]);
    const gateway = createGateway(adapter);

    await gateway.enhance(
      baseInput({
        raw_prompt: "Write a launch email for my SaaS.",
        options: {
          context_snippets: ["Audience: trial users"],
          few_shots: ["# Few-shot\nrough -> structured"],
        },
      }),
    );

    expect(adapter.calls[0]?.staticParts[0]).toContain("# Role");
    expect(adapter.calls[0]?.staticParts[1]).toContain("# Few-shot");
    expect(adapter.calls[0]?.staticParts[2]).toContain("# Output schema");
    expect(adapter.calls[0]?.variablePart).toContain('selected_context: ["Audience: trial users"]');
    expect(adapter.calls[0]?.variablePart.endsWith("</user_input>")).toBe(true);
    expect(adapter.calls[0]?.variablePart).toContain("Write a launch email for my SaaS.");
  });

  it("builds Gemini native structured-output request configuration", () => {
    const model = defaultLlmGatewayRegistry.models.find((candidate) => candidate.id === "gemini-3.5-flash");
    if (!model) {
      throw new Error("Expected Gemini launch model config.");
    }

    const body = buildGeminiRequestBody({
      apiKey: "test-key",
      model,
      staticParts: ["static prefix"],
      variablePart: "variable user input",
    });

    expect(body).toMatchObject({
      contents: [
        {
          role: "user",
          parts: [{ text: "static prefix" }],
        },
        {
          role: "user",
          parts: [{ text: "variable user input" }],
        },
      ],
      generationConfig: {
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema: expect.objectContaining({
              type: "object",
              required: expect.arrayContaining(["enhanced_prompt", "needs_clarification"]),
            }),
          },
        },
      },
    });
  });

  it("preserves the final provider failure as the gateway error cause", async () => {
    const providerError = new LlmProviderError("provider_down", "primary failed");
    const adapter = new ScriptedGeminiAdapter([
      () => {
        throw providerError;
      },
      () => {
        throw providerError;
      },
      () => {
        throw providerError;
      },
    ]);
    const gateway = createGateway(adapter);

    await expect(gateway.enhance(baseInput())).rejects.toMatchObject({
      cause: providerError,
      code: "provider_unavailable",
    });
  });

  it("rejects non-object Gemini payloads before reading nested fields", async () => {
    const adapter = createGeminiAdapter({
      fetch: async () =>
        new Response("null", {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }),
    });

    await expect(
      adapter.generate({
        apiKey: "test-key",
        model: defaultLlmGatewayRegistry.models[0]!,
        staticParts: ["static prefix"],
        variablePart: "variable user input",
      }),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "Gemini returned an invalid response payload.",
    });
  });
});

class ScriptedGeminiAdapter implements LlmProviderAdapter {
  readonly provider = "gemini";
  readonly calls: ProviderGenerateInput[] = [];

  constructor(private readonly script: Array<(input: ProviderGenerateInput) => ProviderGenerateOutput>) {}

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    this.calls.push(input);
    const next = this.script.shift();

    if (!next) {
      throw new LlmProviderError("unexpected_call", "No fake adapter response was queued.");
    }

    return next(input);
  }
}

function createGateway(adapter: LlmProviderAdapter, traces: LlmTraceEvent[] = []) {
  return createLlmGateway({
    apiKey: "test-gemini-key",
    registry: createLlmAdapterRegistry({
      adapters: {
        gemini: adapter,
      },
      config: defaultLlmGatewayRegistry,
    }),
    reporter: {
      recordLlmCall(event) {
        traces.push(event);
      },
    },
  });
}

function baseInput(overrides: Partial<PromptEnhancementInput> = {}): PromptEnhancementInput {
  return {
    mode: "enhance",
    prompt_type: "text",
    raw_prompt: "Help me write a better sales email.",
    target_model: "auto",
    ...overrides,
  };
}

function providerOutput(result: unknown): ProviderGenerateOutput {
  return {
    result,
    text: JSON.stringify(result),
    usage: {
      cachedInputTokens: 10,
      inputTokens: 50,
      outputTokens: 15,
      totalTokens: 65,
    },
  };
}

function validResult(overrides: Partial<PromptEnhancementResult> = {}): PromptEnhancementResult {
  return {
    added: ["Added role and success criteria."],
    changed: ["Clarified the task."],
    constraints: ["Keep the email under 180 words."],
    context: "The user wants a sales email.",
    enhanced_prompt: "Act as a SaaS email copywriter and draft a concise launch email.",
    explanation: ["Added structure while preserving the user's request."],
    format: "Subject lines plus body copy.",
    needs_clarification: false,
    questions: [],
    removed: [],
    role: "SaaS email copywriter",
    success_criteria: ["Preserves the SaaS launch intent."],
    task: "Draft a launch sales email.",
    title: "Sales email prompt",
    tone: "persuasive",
    ...overrides,
  };
}
