import { createHash } from "node:crypto";

import type { LlmGatewayMeta, PromptEnhancementInput, PromptEnhancementResult } from "./types";

export const defaultLlmResultCacheTtlSeconds = 60;

export interface CachedPromptEnhancementOutput {
  result: PromptEnhancementResult;
  meta: LlmGatewayMeta;
}

export interface LlmResultCache {
  get(
    key: string,
  ): Promise<CachedPromptEnhancementOutput | null> | CachedPromptEnhancementOutput | null;
  set(key: string, output: CachedPromptEnhancementOutput, ttlSeconds: number): Promise<void> | void;
}

export function createInMemoryLlmResultCache(
  options: { clock?: () => number } = {},
): LlmResultCache {
  const clock = options.clock ?? Date.now;
  const entries = new Map<
    string,
    {
      expiresAtMs: number;
      output: CachedPromptEnhancementOutput;
    }
  >();

  return {
    get(key) {
      const entry = entries.get(key);

      if (!entry) {
        return null;
      }

      if (entry.expiresAtMs <= clock()) {
        entries.delete(key);
        return null;
      }

      return cloneCachedOutput(entry.output);
    },
    set(key, output, ttlSeconds) {
      entries.set(key, {
        expiresAtMs: clock() + ttlSeconds * 1_000,
        output: cloneCachedOutput(output),
      });
    },
  };
}

export function createLlmResultCacheKey(input: {
  input: PromptEnhancementInput;
  modelId: string;
}): string {
  const payload = stableStringify({
    cache_scope: input.input.cache_scope ?? "platform",
    mode: input.input.mode,
    modelId: input.modelId,
    options: input.input.options ?? {},
    prompt_type: input.input.prompt_type,
    raw_prompt: input.input.raw_prompt,
    target_model: input.input.target_model,
  });

  return `llm-result:${createHash("sha256").update(payload).digest("hex")}`;
}

export function cloneCachedOutput(
  output: CachedPromptEnhancementOutput,
): CachedPromptEnhancementOutput {
  return JSON.parse(JSON.stringify(output)) as CachedPromptEnhancementOutput;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}
