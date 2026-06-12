import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { createDb, createSqlClient } from "@promptgen/db";
import { createPostgresHistoryUsageStore } from "@promptgen/history-usage";

import {
  createAesGcmByoKeyCipher,
  createAuthBillingService,
  PostgresAuthBillingStore,
} from "./auth-billing";
import { createDefaultLlmGateway, type LlmTraceEvent } from "./llm-gateway";
import { createJsonLogger, type JsonLogger } from "./logger";
import {
  createCompositeLlmTraceReporter,
  createInMemoryLlmObservabilityStore,
} from "./observability";
import { createRedisLlmResultCache } from "./redis";
import { createApiRequestHandler } from "./server";

export * from "./llm-gateway";

export function startApi(
  options: { env?: PromptGenEnv; logger?: JsonLogger } = {},
): ReturnType<typeof createServer> {
  const env = options.env ?? loadPromptGenEnv();
  const logger = options.logger ?? createJsonLogger();
  const observability = createInMemoryLlmObservabilityStore();
  const resultCache = createRedisLlmResultCache(env);
  const gateway = createDefaultLlmGateway({
    env,
    reporter: createCompositeLlmTraceReporter(createLoggerLlmReporter(logger), observability),
    ...(resultCache ? { resultCache } : {}),
  });
  const sql = env.databaseUrl ? createSqlClient(env.databaseUrl) : null;
  const db = sql ? createDb(sql) : null;
  const history = db ? createPostgresHistoryUsageStore(db) : undefined;
  const billing = db
    ? createAuthBillingService(new PostgresAuthBillingStore(db), {
        ...(env.byoKeyEncryptionSecret
          ? { byoKeyCipher: createAesGcmByoKeyCipher(env.byoKeyEncryptionSecret) }
          : {}),
        sessionTtlSeconds: env.authSessionTtlSeconds,
      })
    : undefined;
  const server = createServer(
    createApiRequestHandler({
      env,
      gateway,
      logger,
      observability,
      ...(billing ? { billing } : {}),
      ...(history ? { history } : {}),
    }),
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
        providerCacheHit: event.cache?.provider_cache_hit ?? false,
        resultCacheHit: event.cache?.result_cache_hit ?? false,
        inputTokensSaved: event.cache?.input_tokens_saved ?? 0,
      });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApi();
}
