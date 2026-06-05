import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createHealthPayload, resolveApiPort } from "./server";

export function startPlaceholderApi(): ReturnType<typeof createServer> {
  const port = resolveApiPort();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(createHealthPayload()));
  });

  server.on("error", (error) => {
    console.error(`Failed to start API server: ${error.message}`);
  });

  server.listen(port, () => {
    console.info(`PromptForge API placeholder listening on port ${port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPlaceholderApi();
}
