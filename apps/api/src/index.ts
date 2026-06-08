import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { createDb, createSqlClient } from "@promptgen/db";
import { createPostgresHistoryUsageStore } from "@promptgen/history-usage";

import { createDefaultLlmGateway, type LlmTraceEvent } from "./llm-gateway";
import { createJsonLogger, type JsonLogger } from "./logger";
import { createApiRequestHandler } from "./server";

export * from "./llm-gateway";

export function startApi(
  options: { env?: PromptGenEnv; logger?: JsonLogger } = {},
): ReturnType<typeof createServer> {
  const env = options.env ?? loadPromptGenEnv();
  const logger = options.logger ?? createJsonLogger();
  const gateway = createDefaultLlmGateway({
    env,
    reporter: createLoggerLlmReporter(logger),
  });
  const sql = env.databaseUrl ? createSqlClient(env.databaseUrl) : null;
  const history = sql ? createPostgresHistoryUsageStore(createDb(sql)) : undefined;
  const server = createServer(
    createApiRequestHandler({ env, gateway, logger, ...(history ? { history } : {}) }),
  );

  server.on("error", (error) => {
    logger.error("api.server_error", {
      errorName: error.name,
      errorMessage: error.message,
    });
  });
  server.on("close", () => {
    if (sql) {
      void sql.end();
    }
  });

  server.listen(env.apiPort, () => {
    logger.info("api.started", {
      port: env.apiPort,
    });
  });

  return server;
}

export const startPlaceholderApi = startApi;

function createLoggerLlmReporter(logger: JsonLogger): {
  recordLlmCall(event: LlmTraceEvent): void;
} {
  return {
    recordLlmCall(event) {
      logger.info("llm.call", {
        attempt: event.attempt,
        costUsd: event.cost_usd,
        errorCode: event.error_code,
        fellback: event.fellback,
        latencyMs: event.latency_ms,
        mode: event.mode,
        model: event.model,
        promptType: event.prompt_type,
        provider: event.provider,
        success: event.success,
        targetModel: event.target_model,
        tokens: event.tokens.totalTokens,
        cachedInputTokens: event.tokens.cachedInputTokens,
        inputTokens: event.tokens.inputTokens,
        outputTokens: event.tokens.outputTokens,
      });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApi();
}
