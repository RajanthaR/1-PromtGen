import { describe, expect, it } from "vitest";

import type { LlmTraceEvent } from "./llm-gateway";
import { createInMemoryLlmObservabilityStore } from "./observability";

describe("LLM observability dashboard", () => {
  it("aggregates trace cost, latency, cache hits, and structure quality", () => {
    const observability = createInMemoryLlmObservabilityStore({
      now: () => new Date("2026-06-09T10:05:00.000Z"),
    });

    observability.recordLlmCall(
      trace({
        cache: {
          cached_input_tokens: 20,
          input_tokens: 100,
          input_tokens_saved: 20,
          provider_cache_hit: true,
          result_cache_hit: false,
        },
        cost_usd: 0.001,
        latency_ms: 100,
        tokens: {
          cachedInputTokens: 20,
          inputTokens: 100,
          outputTokens: 30,
          totalTokens: 130,
        },
      }),
    );
    observability.recordLlmCall(
      trace({
        attempt: 0,
        cache: {
          cached_input_tokens: 0,
          input_tokens: 0,
          input_tokens_saved: 100,
          provider_cache_hit: false,
          result_cache_hit: true,
        },
        cost_usd: 0,
        latency_ms: 0,
        tokens: {
          cachedInputTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      }),
    );
    observability.recordLlmCall(
      trace({
        cost_usd: 0.002,
        error_code: "provider_down",
        latency_ms: 400,
        mode: "quality_judge",
        model: "gpt-5.4",
        provider: "openai",
        success: false,
        tokens: {
          cachedInputTokens: 0,
          inputTokens: 50,
          outputTokens: 10,
          totalTokens: 60,
        },
      }),
    );
    observability.recordLlmQuality({
      judge_status: "completed",
      mode: "enhance",
      model: "gemini-3.5-flash",
      prompt_type: "text",
      provider: "gemini",
      structure_score_after: 80,
      structure_score_before: 40,
      target_model: "auto",
    });
    observability.recordLlmQuality({
      judge_status: "disabled",
      mode: "enhance",
      model: "gemini-3.5-flash",
      prompt_type: "text",
      provider: "gemini",
      structure_score_after: 90,
      structure_score_before: 60,
      target_model: "auto",
    });

    expect(observability.getDashboard()).toEqual({
      generated_at: "2026-06-09T10:05:00.000Z",
      totals: {
        cached_input_tokens: 20,
        calls: 3,
        cost_usd: 0.003,
        failures: 1,
        input_tokens: 150,
        output_tokens: 40,
        provider_cache_hits: 1,
        result_cache_hits: 1,
        successes: 2,
        total_tokens: 190,
      },
      latency: {
        average_ms: 166.67,
        p95_ms: 400,
      },
      cost_by_model: [
        {
          calls: 1,
          cost_usd: 0.002,
          key: "openai:gpt-5.4",
          model: "gpt-5.4",
          provider: "openai",
          total_tokens: 60,
        },
        {
          calls: 2,
          cost_usd: 0.001,
          key: "gemini:gemini-3.5-flash",
          model: "gemini-3.5-flash",
          provider: "gemini",
          total_tokens: 130,
        },
      ],
      latency_by_mode: [
        {
          average_ms: 50,
          calls: 2,
          mode: "enhance",
          p95_ms: 100,
        },
        {
          average_ms: 400,
          calls: 1,
          mode: "quality_judge",
          p95_ms: 400,
        },
      ],
      structure_quality: {
        average_after: 85,
        average_before: 50,
        average_delta: 35,
        by_mode: [
          {
            average_after: 85,
            average_before: 50,
            average_delta: 35,
            mode: "enhance",
            samples: 2,
          },
        ],
        samples: 2,
      },
    });
  });
});

function trace(overrides: Partial<LlmTraceEvent> = {}): LlmTraceEvent {
  return {
    attempt: 1,
    cost_usd: 0,
    fellback: false,
    latency_ms: 0,
    mode: "enhance",
    model: "gemini-3.5-flash",
    prompt_type: "text",
    provider: "gemini",
    success: true,
    target_model: "auto",
    tokens: {
      cachedInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    ...overrides,
  };
}
