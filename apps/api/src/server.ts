import type { IncomingMessage, ServerResponse } from "node:http";

import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { foundationSchemaVersion, type HealthPayload, type ServiceStatus } from "@promptgen/types";

import type { JsonLogger } from "./logger";
import { createJsonLogger } from "./logger";
import { createRedisHealthProbe, type RedisHealthProbe } from "./redis";

const defaultEnv = loadPromptGenEnv();

export function createServiceStatus(): ServiceStatus {
  return {
    name: "api",
    state: "ok",
    version: foundationSchemaVersion,
  };
}

export function resolveApiPort(source?: Record<string, string | undefined>): number {
  return source ? loadPromptGenEnv(source).apiPort : defaultEnv.apiPort;
}

export async function createHealthPayload(
  env: PromptGenEnv = defaultEnv,
  dependencies: { redis?: RedisHealthProbe } = {},
): Promise<HealthPayload> {
  const redis = await (dependencies.redis ?? createRedisHealthProbe(env)).check();

  return {
    env: env.nodeEnv,
    port: env.apiPort,
    service: createServiceStatus(),
    dependencies: {
      redis,
    },
  };
}

export function createApiRequestHandler(options: {
  env?: PromptGenEnv;
  logger?: JsonLogger;
  redis?: RedisHealthProbe;
}): (request: IncomingMessage, response: ServerResponse) => void {
  const env = options.env ?? defaultEnv;
  const logger = options.logger ?? createJsonLogger();

  return (request, response) => {
    void handleApiRequest(request, response, env, logger, options.redis);
  };
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  env: PromptGenEnv,
  logger: JsonLogger,
  redis?: RedisHealthProbe,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    const payload = await createHealthPayload(env, redis ? { redis } : {});
    writeJson(response, 200, payload);
    logger.info("api.request", {
      method,
      path: url.pathname,
      statusCode: 200,
    });
    return;
  }

  writeJson(response, 404, { error: "not_found" });
  logger.warn("api.request", {
    method,
    path: url.pathname,
    statusCode: 404,
  });
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
