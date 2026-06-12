import { createHash } from "node:crypto";

import { createClient } from "redis";

import type { PromptGenEnv } from "@promptgen/config/env";
import type { DependencyStatus } from "@promptgen/types";

import type { LlmResultCache } from "./llm-gateway/cache";

export interface RedisHealthClient {
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
  destroy?(): void;
  on?(event: "error", listener: (error: Error) => void): unknown;
}

export type RedisHealthClientFactory = (url: string) => RedisHealthClient;

export interface RedisLaunchClient extends RedisHealthClient {
  expire(key: string, seconds: number): Promise<boolean | number>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export type RedisLaunchClientFactory = (url: string) => RedisLaunchClient;

export interface RedisHealthProbe {
  check(): Promise<DependencyStatus>;
}

export interface RateLimitCheckInput {
  action: string;
  userId: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset_at: string;
  retry_after_seconds: number;
}

export interface RateLimiter {
  check(input: RateLimitCheckInput): Promise<RateLimitCheckResult>;
}

export const defaultEnhancementRateLimit = {
  limit: 30,
  windowSeconds: 60,
} as const;

export function createRedisClient(url: string): RedisLaunchClient {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
  });

  client.on("error", () => undefined);

  return client as RedisLaunchClient;
}

export function createRedisHealthProbe(
  env: Pick<PromptGenEnv, "redisUrl">,
  clientFactory: RedisHealthClientFactory = createRedisClient,
): RedisHealthProbe {
  let client: RedisHealthClient | null = null;
  let connectPromise: Promise<unknown> | null = null;

  return {
    async check() {
      if (!env.redisUrl) {
        return {
          name: "redis",
          state: "not_configured",
          configured: false,
        };
      }

      client ??= clientFactory(env.redisUrl);
      connectPromise ??= client.connect();

      try {
        await connectPromise;
        await client.ping();

        return {
          name: "redis",
          state: "ok",
          configured: true,
        };
      } catch {
        client.destroy?.();
        client = null;
        connectPromise = null;

        return {
          name: "redis",
          state: "offline",
          configured: true,
        };
      }
    },
  };
}

export function createRedisLlmResultCache(
  env: Pick<PromptGenEnv, "redisUrl">,
  options: {
    clientFactory?: RedisLaunchClientFactory;
    keyPrefix?: string;
  } = {},
): LlmResultCache | undefined {
  if (!env.redisUrl) {
    return undefined;
  }

  const client = createLazyRedisLaunchClient(
    env.redisUrl,
    options.clientFactory ?? createRedisClient,
  );
  const keyPrefix = options.keyPrefix ?? "promptgen";

  return {
    async get(key) {
      const rawValue = await (await client()).get(`${keyPrefix}:${key}`);

      if (!rawValue) {
        return null;
      }

      try {
        return JSON.parse(rawValue) as Awaited<ReturnType<LlmResultCache["get"]>>;
      } catch {
        return null;
      }
    },
    async set(key, output, ttlSeconds) {
      await (await client()).set(`${keyPrefix}:${key}`, JSON.stringify(output), { EX: ttlSeconds });
    },
  };
}

export function createRedisRateLimiter(
  env: Pick<PromptGenEnv, "redisUrl">,
  options: {
    clientFactory?: RedisLaunchClientFactory;
    clock?: () => Date;
    keyPrefix?: string;
    limit?: number;
    windowSeconds?: number;
  } = {},
): RateLimiter | undefined {
  if (!env.redisUrl) {
    return undefined;
  }

  const client = createLazyRedisLaunchClient(
    env.redisUrl,
    options.clientFactory ?? createRedisClient,
  );
  const clock = options.clock ?? (() => new Date());
  const keyPrefix = options.keyPrefix ?? "promptgen";
  const limit = options.limit ?? defaultEnhancementRateLimit.limit;
  const windowSeconds = options.windowSeconds ?? defaultEnhancementRateLimit.windowSeconds;
  const windowMs = windowSeconds * 1_000;

  return {
    async check(input) {
      const nowMs = clock().getTime();
      const windowId = Math.floor(nowMs / windowMs);
      const resetAtMs = (windowId + 1) * windowMs;
      const key = [
        keyPrefix,
        "rate-limit",
        sanitizeRedisKeyPart(input.action),
        hashRedisKeyPart(input.userId),
        String(windowId),
      ].join(":");
      const count = await (await client()).incr(key);

      if (count === 1) {
        await (await client()).expire(key, windowSeconds);
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1_000));

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        reset_at: new Date(resetAtMs).toISOString(),
        retry_after_seconds: retryAfterSeconds,
      };
    },
  };
}

function createLazyRedisLaunchClient(
  url: string,
  clientFactory: RedisLaunchClientFactory,
): () => Promise<RedisLaunchClient> {
  let client: RedisLaunchClient | null = null;
  let connectPromise: Promise<unknown> | null = null;

  return async () => {
    client ??= clientFactory(url);
    connectPromise ??= client.connect();
    try {
      await connectPromise;
      return client;
    } catch (error) {
      client.destroy?.();
      client = null;
      connectPromise = null;
      throw error;
    }
  };
}

function hashRedisKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function sanitizeRedisKeyPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  return normalized || "default";
}
