import { describe, expect, it } from "vitest";

import { createRedisHealthProbe, type RedisHealthClientFactory } from "./redis";

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
