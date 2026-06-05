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
  return {
    async check() {
      if (!env.redisUrl) {
        return {
          name: "redis",
          state: "not_configured",
          configured: false,
        };
      }

      const client = clientFactory(env.redisUrl);

      try {
        await client.connect();
        await client.ping();

        return {
          name: "redis",
          state: "ok",
          configured: true,
        };
      } catch {
        return {
          name: "redis",
          state: "offline",
          configured: true,
        };
      } finally {
        await closeRedisClient(client);
      }
    },
  };
}

async function closeRedisClient(client: RedisHealthClient): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.destroy?.();
  }
}
