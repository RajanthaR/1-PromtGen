import type { LlmTraceEvent, LlmTraceReporter, PromptEnhancementMode } from "./llm-gateway";

export interface LlmQualitySample {
  mode: PromptEnhancementMode;
  model: string;
  provider: string;
  prompt_type: "text";
  structure_score_after: number;
  structure_score_before: number;
  target_model: string;
  judge_status?: "disabled" | "completed" | "failed" | "unavailable";
}

export interface LlmObservabilityDashboard {
  generated_at: string;
  totals: {
    calls: number;
    successes: number;
    failures: number;
    result_cache_hits: number;
    provider_cache_hits: number;
    cost_usd: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  latency: {
    average_ms: number;
    p95_ms: number;
  };
  cost_by_model: LlmMetricBucket[];
  latency_by_mode: LlmLatencyBucket[];
  structure_quality: {
    samples: number;
    average_before: number;
    average_after: number;
    average_delta: number;
    by_mode: LlmQualityBucket[];
  };
}

export interface LlmMetricBucket {
  key: string;
  provider: string;
  model: string;
  calls: number;
  cost_usd: number;
  total_tokens: number;
}

export interface LlmLatencyBucket {
  mode: PromptEnhancementMode | "quality_judge";
  calls: number;
  average_ms: number;
  p95_ms: number;
}

export interface LlmQualityBucket {
  mode: PromptEnhancementMode;
  samples: number;
  average_before: number;
  average_after: number;
  average_delta: number;
}

export interface LlmObservabilityStore extends LlmTraceReporter {
  getDashboard(): LlmObservabilityDashboard;
  recordLlmQuality(sample: LlmQualitySample): Promise<void> | void;
}

export function createInMemoryLlmObservabilityStore(
  options: { maxEvents?: number; now?: () => Date } = {},
): LlmObservabilityStore {
  const maxEvents = options.maxEvents ?? 1_000;
  const now = options.now ?? (() => new Date());
  const traces: LlmTraceEvent[] = [];
  const qualitySamples: LlmQualitySample[] = [];

  return {
    recordLlmCall(event) {
      traces.push(cloneTraceEvent(event));
      trimToMaxEvents(traces, maxEvents);
    },
    recordLlmQuality(sample) {
      qualitySamples.push({ ...sample });
      trimToMaxEvents(qualitySamples, maxEvents);
    },
    getDashboard() {
      return buildDashboard({
        generatedAt: now().toISOString(),
        qualitySamples,
        traces,
      });
    },
  };
}

export function createCompositeLlmTraceReporter(
  ...reporters: Array<LlmTraceReporter | undefined>
): LlmTraceReporter {
  const activeReporters = reporters.filter((reporter): reporter is LlmTraceReporter =>
    Boolean(reporter),
  );

  return {
    async recordLlmCall(event) {
      await Promise.all(activeReporters.map((reporter) => reporter.recordLlmCall(event)));
    },
  };
}

function buildDashboard(input: {
  generatedAt: string;
  qualitySamples: LlmQualitySample[];
  traces: LlmTraceEvent[];
}): LlmObservabilityDashboard {
  const successes = input.traces.filter((trace) => trace.success).length;
  const failures = input.traces.length - successes;
  const latencyValues = input.traces.map((trace) => trace.latency_ms);
  const qualityRollup = rollUpQuality(input.qualitySamples);

  return {
    generated_at: input.generatedAt,
    totals: {
      cached_input_tokens: sum(input.traces, (trace) => trace.tokens.cachedInputTokens),
      calls: input.traces.length,
      cost_usd: roundMoney(sum(input.traces, (trace) => trace.cost_usd)),
      failures,
      input_tokens: sum(input.traces, (trace) => trace.tokens.inputTokens),
      output_tokens: sum(input.traces, (trace) => trace.tokens.outputTokens),
      provider_cache_hits: input.traces.filter((trace) => trace.cache?.provider_cache_hit).length,
      result_cache_hits: input.traces.filter((trace) => trace.cache?.result_cache_hit).length,
      successes,
      total_tokens: sum(input.traces, (trace) => trace.tokens.totalTokens),
    },
    latency: {
      average_ms: average(latencyValues),
      p95_ms: percentile(latencyValues, 95),
    },
    cost_by_model: rollUpCostByModel(input.traces),
    latency_by_mode: rollUpLatencyByMode(input.traces),
    structure_quality: qualityRollup,
  };
}

function rollUpCostByModel(traces: LlmTraceEvent[]): LlmMetricBucket[] {
  const buckets = new Map<string, LlmMetricBucket>();

  for (const trace of traces) {
    const key = `${trace.provider}:${trace.model}`;
    const bucket =
      buckets.get(key) ??
      ({
        calls: 0,
        cost_usd: 0,
        key,
        model: trace.model,
        provider: trace.provider,
        total_tokens: 0,
      } satisfies LlmMetricBucket);

    bucket.calls += 1;
    bucket.cost_usd += trace.cost_usd;
    bucket.total_tokens += trace.tokens.totalTokens;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      cost_usd: roundMoney(bucket.cost_usd),
    }))
    .sort((left, right) => right.cost_usd - left.cost_usd || left.key.localeCompare(right.key));
}

function rollUpLatencyByMode(traces: LlmTraceEvent[]): LlmLatencyBucket[] {
  const valuesByMode = new Map<PromptEnhancementMode | "quality_judge", number[]>();

  for (const trace of traces) {
    const values = valuesByMode.get(trace.mode) ?? [];
    values.push(trace.latency_ms);
    valuesByMode.set(trace.mode, values);
  }

  return Array.from(valuesByMode.entries())
    .map(([mode, values]) => ({
      average_ms: average(values),
      calls: values.length,
      mode,
      p95_ms: percentile(values, 95),
    }))
    .sort((left, right) => left.mode.localeCompare(right.mode));
}

function rollUpQuality(
  samples: LlmQualitySample[],
): LlmObservabilityDashboard["structure_quality"] {
  const beforeScores = samples.map((sample) => sample.structure_score_before);
  const afterScores = samples.map((sample) => sample.structure_score_after);
  const samplesByMode = new Map<PromptEnhancementMode, LlmQualitySample[]>();

  for (const sample of samples) {
    const values = samplesByMode.get(sample.mode) ?? [];
    values.push(sample);
    samplesByMode.set(sample.mode, values);
  }

  return {
    average_after: average(afterScores),
    average_before: average(beforeScores),
    average_delta: average(
      samples.map((sample) => sample.structure_score_after - sample.structure_score_before),
    ),
    by_mode: Array.from(samplesByMode.entries())
      .map(([mode, values]) => ({
        average_after: average(values.map((sample) => sample.structure_score_after)),
        average_before: average(values.map((sample) => sample.structure_score_before)),
        average_delta: average(
          values.map((sample) => sample.structure_score_after - sample.structure_score_before),
        ),
        mode,
        samples: values.length,
      }))
      .sort((left, right) => left.mode.localeCompare(right.mode)),
    samples: samples.length,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(sum(values, (value) => value) / values.length);
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
}

function sum<T>(values: T[], readValue: (value: T) => number): number {
  return values.reduce((total, value) => total + readValue(value), 0);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function cloneTraceEvent(event: LlmTraceEvent): LlmTraceEvent {
  return JSON.parse(JSON.stringify(event)) as LlmTraceEvent;
}

function trimToMaxEvents<T>(items: T[], maxEvents: number): void {
  if (items.length > maxEvents) {
    items.splice(0, items.length - maxEvents);
  }
}
