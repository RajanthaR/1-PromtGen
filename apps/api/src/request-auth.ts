import type { IncomingMessage } from "node:http";

export function resolveSessionId(request: IncomingMessage, url?: URL): string | null {
  const headerSessionId = readSingleHeader(request.headers["x-session-id"]);

  if (headerSessionId) {
    return headerSessionId;
  }

  const authorization = readSingleHeader(request.headers.authorization);
  const bearerMatch = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;

  if (bearerMatch?.[1]?.trim()) {
    return bearerMatch[1].trim();
  }

  const querySessionId = url?.searchParams.get("session_id")?.trim();

  return querySessionId || null;
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((entry) => entry.trim());
    return firstValue?.trim() ?? null;
  }

  return null;
}
