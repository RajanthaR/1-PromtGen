import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import type { RedisHealthProbe } from "./redis";
import { createInMemoryLlmObservabilityStore } from "./observability";
import {
  createHealthPayload,
  createApiRequestHandler,
  createServiceStatus,
  resolveApiPort,
} from "./server";

describe("api server", () => {
  it("reports a healthy foundation service status", () => {
    expect(createServiceStatus()).toEqual({
      name: "api",
      state: "ok",
      version: "0.0.0",
    });
  });

  it("resolves the API port through the shared env helper", () => {
    expect(resolveApiPort({ API_PORT: "4567" })).toBe(4567);
  });

  it("creates a health payload without requiring real secrets", async () => {
    const redis = {
      async check() {
        return {
          name: "redis",
          state: "not_configured",
          configured: false,
        };
      },
    } satisfies RedisHealthProbe;

    await expect(
      createHealthPayload(
        {
          apiPort: 4000,
          appUrl: "http://localhost:3000",
          authSessionTtlSeconds: 2_592_000,
          nodeEnv: "test",
          promptQualityJudgeEnabled: false,
        },
        { redis },
      ),
    ).resolves.toEqual({
      env: "test",
      port: 4000,
      service: {
        name: "api",
        state: "ok",
        version: "0.0.0",
      },
      dependencies: {
        redis: {
          name: "redis",
          state: "not_configured",
          configured: false,
        },
      },
    });
  });

  it("serves GET /health with dependency status", async () => {
    const redis = {
      async check() {
        return {
          name: "redis",
          state: "ok",
          configured: true,
        };
      },
    } satisfies RedisHealthProbe;
    const logged: string[] = [];
    const server = createServer(
      createApiRequestHandler({
        env: {
          apiPort: 0,
          appUrl: "http://localhost:3000",
          authSessionTtlSeconds: 2_592_000,
          nodeEnv: "test",
          promptQualityJudgeEnabled: false,
          redisUrl: "redis://localhost:6379",
        },
        logger: {
          info(event) {
            logged.push(event);
          },
          warn(event) {
            logged.push(event);
          },
          error(event) {
            logged.push(event);
          },
        },
        redis,
      }),
    );

    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    try {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        throw new Error("Expected TCP listener address.");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        env: "test",
        port: 0,
        service: {
          name: "api",
          state: "ok",
          version: "0.0.0",
        },
        dependencies: {
          redis: {
            name: "redis",
            state: "ok",
            configured: true,
          },
        },
      });
      expect(logged).toEqual(["api.request"]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("serves GET /observability/llm with aggregate dashboard metrics", async () => {
    const observability = createInMemoryLlmObservabilityStore({
      now: () => new Date("2026-06-09T10:05:00.000Z"),
    });
    observability.recordLlmCall({
      attempt: 1,
      cost_usd: 0.001,
      fellback: false,
      latency_ms: 120,
      mode: "enhance",
      model: "gemini-3.5-flash",
      prompt_type: "text",
      provider: "gemini",
      success: true,
      target_model: "auto",
      tokens: {
        cachedInputTokens: 0,
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
      },
    });
    const server = createServer(
      createApiRequestHandler({
        env: {
          apiPort: 0,
          appUrl: "http://localhost:3000",
          authSessionTtlSeconds: 2_592_000,
          nodeEnv: "test",
          promptQualityJudgeEnabled: false,
        },
        logger: {
          info() {
            return undefined;
          },
          warn() {
            return undefined;
          },
          error() {
            return undefined;
          },
        },
        observability,
      }),
    );

    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    try {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        throw new Error("Expected TCP listener address.");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/observability/llm`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        generated_at: "2026-06-09T10:05:00.000Z",
        totals: {
          calls: 1,
          cost_usd: 0.001,
          successes: 1,
        },
        latency: {
          p95_ms: 120,
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("keeps non-health routes out of the health contract", async () => {
    const server = createServer(
      createApiRequestHandler({
        env: {
          apiPort: 0,
          appUrl: "http://localhost:3000",
          authSessionTtlSeconds: 2_592_000,
          nodeEnv: "test",
          promptQualityJudgeEnabled: false,
        },
        logger: {
          info() {
            return undefined;
          },
          warn() {
            return undefined;
          },
          error() {
            return undefined;
          },
        },
      }),
    );

    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    try {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        throw new Error("Expected TCP listener address.");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/`);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "not_found" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});
