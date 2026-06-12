import { describe, expect, it } from "vitest";

import {
  createRedisHealthProbe,
  createRedisRateLimiter,
  type RedisHealthClientFactory,
  type RedisLaunchClient,
  type RedisLaunchClientFactory,
} from "./redis";

describe("redis health probe", () => {
  it("reports Redis as not configured when REDIS_URL is absent", async () => {
    await expect(createRedisHealthProbe({}).check()).resolves.toEqual({
      name: "redis",
      state: "not_configured",
      configured: false,
    });
  });

  it("pings a configured Redis client", async () => {
    const calls: string[] = [];
    const factory: RedisHealthClientFactory = () => ({
      async connect() {
        calls.push("connect");
      },
      async ping() {
        calls.push("ping");
        return "PONG";
      },
      async quit() {
        calls.push("quit");
      },
    });
    const probe = createRedisHealthProbe({ redisUrl: "redis://localhost:6379" }, factory);

    await expect(probe.check()).resolves.toEqual({
      name: "redis",
      state: "ok",
      configured: true,
    });
    await expect(probe.check()).resolves.toEqual({
      name: "redis",
      state: "ok",
      configured: true,
    });
    expect(calls).toEqual(["connect", "ping", "ping"]);
  });

  it("reports configured Redis as offline when ping fails", async () => {
    const calls: string[] = [];
    const factory: RedisHealthClientFactory = () => ({
      async connect() {
        calls.push("connect");
        return undefined;
      },
      async ping() {
        calls.push("ping");
        throw new Error("Redis unavailable.");
      },
      async quit() {
        return undefined;
      },
      destroy() {
        calls.push("destroy");
      },
    });

    await expect(
      createRedisHealthProbe({ redisUrl: "redis://localhost:6379" }, factory).check(),
    ).resolves.toEqual({
      name: "redis",
      state: "offline",
      configured: true,
    });
    expect(calls).toEqual(["connect", "ping", "destroy"]);
  });
});

describe("redis rate limiter", () => {
  it("blocks a user after the fixed-window limit is reached", async () => {
    const clients: FakeRedisLaunchClient[] = [];
    const factory: RedisLaunchClientFactory = () => {
      const client = new FakeRedisLaunchClient();
      clients.push(client);
      return client;
    };
    const limiter = createRedisRateLimiter(
      { redisUrl: "redis://localhost:6379" },
      {
        clientFactory: factory,
        clock: () => new Date("2026-06-09T10:00:10.000Z"),
        limit: 2,
        windowSeconds: 60,
      },
    );

    if (!limiter) {
      throw new Error("Expected limiter when Redis URL is configured.");
    }

    await expect(
      limiter.check({ action: "prompt-enhancement", userId: "user-123@example.com" }),
    ).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
    });
    await expect(
      limiter.check({ action: "prompt-enhancement", userId: "user-123@example.com" }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(
      limiter.check({ action: "prompt-enhancement", userId: "user-123@example.com" }),
    ).resolves.toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
      reset_at: "2026-06-09T10:01:00.000Z",
      retry_after_seconds: 50,
    });

    expect(clients).toHaveLength(1);
    expect(clients[0]?.connectCalls).toBe(1);
    expect(clients[0]?.expireCalls).toEqual([{ seconds: 60, key: expect.any(String) }]);
    expect(clients[0]?.incrementedKeys[0]).toContain("prompt-enhancement");
    expect(clients[0]?.incrementedKeys[0]).not.toContain("user-123@example.com");
  });
});

class FakeRedisLaunchClient implements RedisLaunchClient {
  readonly counts = new Map<string, number>();
  readonly expireCalls: Array<{ key: string; seconds: number }> = [];
  readonly incrementedKeys: string[] = [];
  connectCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<void> {
    return undefined;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.expireCalls.push({ key, seconds });
    return true;
  }

  async get(_key: string): Promise<string | null> {
    return null;
  }

  async incr(key: string): Promise<number> {
    this.incrementedKeys.push(key);
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async set(_key: string, _value: string, _options: { EX: number }): Promise<string> {
    return "OK";
  }
}
