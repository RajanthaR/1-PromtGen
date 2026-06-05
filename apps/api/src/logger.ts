type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogEvent {
  event: string;
  level: LogLevel;
  service: "api";
  timestamp: string;
  requestId?: string;
  details?: Record<string, JsonValue>;
}

export interface JsonLogger {
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
}

const sensitiveDetailNames = new Set([
  "authorization",
  "apiKey",
  "api_key",
  "body",
  "enhanced",
  "enhancedPrompt",
  "llmProviderApiKey",
  "original",
  "password",
  "prompt",
  "rawPrompt",
  "secret",
  "token",
]);

export function createLogEvent(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>,
): StructuredLogEvent {
  return {
    event,
    level,
    service: "api",
    timestamp: new Date().toISOString(),
    ...(details ? { details: redactLogDetails(details) } : {}),
  };
}

export function createJsonLogger(write: (line: string) => void = console.log): JsonLogger {
  return {
    info(event, details) {
      write(JSON.stringify(createLogEvent("info", event, details)));
    },
    warn(event, details) {
      write(JSON.stringify(createLogEvent("warn", event, details)));
    },
    error(event, details) {
      write(JSON.stringify(createLogEvent("error", event, details)));
    },
  };
}

export function redactLogDetails(details: Record<string, unknown>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      sensitiveDetailNames.has(key) ? "[REDACTED]" : normalizeLogValue(value),
    ]),
  );
}

function normalizeLogValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeLogValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return redactLogDetails(value as Record<string, unknown>);
  }

  return String(value);
}
