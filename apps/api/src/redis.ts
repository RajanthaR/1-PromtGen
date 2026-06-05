import { createClient } from "redis";

import type { PromptGenEnv } from "@promptgen/config/env";
import type { DependencyStatus } from "@promptgen/types";

export interface RedisHealthClient {
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
  destroy?(): void;
  on?(event: "error", listener: (error: Error) => void): unknown;
}

export type RedisHealthClientFactory = (url: string) => RedisHealthClient;

export interface RedisHealthProbe {
  check(): Promise<DependencyStatus>;
}

export function createRedisClient(url: string): RedisHealthClient {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
  });

  client.on("error", () => undefined);

  return client;
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
