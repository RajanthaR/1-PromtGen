import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";

import { createJsonLogger, type JsonLogger } from "./logger";
import { createApiRequestHandler } from "./server";

export function startApi(
  options: { env?: PromptGenEnv; logger?: JsonLogger } = {},
): ReturnType<typeof createServer> {
  const env = options.env ?? loadPromptGenEnv();
  const logger = options.logger ?? createJsonLogger();
  const server = createServer(createApiRequestHandler({ env, logger }));

  server.on("error", (error) => {
    logger.error("api.server_error", {
      errorName: error.name,
      errorMessage: error.message,
    });
  });

  server.listen(env.apiPort, () => {
    logger.info("api.started", {
      port: env.apiPort,
    });
  });

  return server;
}

export const startPlaceholderApi = startApi;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApi();
}
