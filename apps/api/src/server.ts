import type { IncomingMessage, ServerResponse } from "node:http";

import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import type { HistoryUsagePort } from "@promptgen/history-usage";
import { foundationSchemaVersion, type HealthPayload, type ServiceStatus } from "@promptgen/types";

import {
  handleEnhancementRequest,
  isEnhancementMode,
  type EnhancementGateway,
} from "./enhancement";
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
  gateway?: EnhancementGateway;
  history?: HistoryUsagePort;
  logger?: JsonLogger;
  redis?: RedisHealthProbe;
}): (request: IncomingMessage, response: ServerResponse) => void {
  const env = options.env ?? defaultEnv;
  const gateway = options.gateway ?? createUnconfiguredGateway();
  const history = options.history;
  const logger = options.logger ?? createJsonLogger();
  const redis = options.redis ?? createRedisHealthProbe(env);

  return (request, response) => {
    void handleApiRequest(request, response, env, logger, redis, gateway, history);
  };
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  env: PromptGenEnv,
  logger: JsonLogger,
  redis?: RedisHealthProbe,
  gateway?: EnhancementGateway,
  history?: HistoryUsagePort,
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

  const enhancementMatch = /^\/enhance\/([^/]+)$/.exec(url.pathname);

  if (enhancementMatch) {
    const mode = enhancementMatch[1] ?? "";

    if (isEnhancementMode(mode) && gateway) {
      await handleEnhancementRequest(request, response, mode, {
        gateway,
        logger,
        llmJudgeEnabled: env.promptQualityJudgeEnabled,
        ...(history ? { history } : {}),
      });
      return;
    }
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

function createUnconfiguredGateway(): EnhancementGateway {
  return {
    async enhance() {
      throw new Error("Enhancement gateway is not configured.");
    },
  };
}
