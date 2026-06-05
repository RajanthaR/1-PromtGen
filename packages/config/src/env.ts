export type PromptGenNodeEnv = "development" | "test" | "production";

export interface PromptGenEnv {
  apiPort: number;
  appUrl: string;
  authSessionTtlSeconds: number;
  databaseUrl?: string;
  googleOAuthClientId?: string;
  googleOAuthClientSecret?: string;
  llmProviderApiKey?: string;
  nodeEnv: PromptGenNodeEnv;
  redisUrl?: string;
}

type EnvSource = Record<string, string | undefined>;

const defaultEnv: PromptGenEnv = {
  apiPort: 4000,
  appUrl: "http://localhost:3000",
  authSessionTtlSeconds: 60 * 60 * 24 * 30,
  nodeEnv: "development",
};

export function loadPromptGenEnv(source: EnvSource = process.env): PromptGenEnv {
  const nodeEnv = parseNodeEnv(source.NODE_ENV);
  const appUrl = parseUrl(source.NEXT_PUBLIC_APP_URL ?? defaultEnv.appUrl, "NEXT_PUBLIC_APP_URL");
  const apiPort = parsePort(source.API_PORT ?? String(defaultEnv.apiPort));
  const authSessionTtlSeconds = parsePositiveInteger(
    source.AUTH_SESSION_TTL_SECONDS ?? String(defaultEnv.authSessionTtlSeconds),
    "AUTH_SESSION_TTL_SECONDS",
  );
  const databaseUrl = parseOptional(source.DATABASE_URL);
  const googleOAuthClientId = parseOptional(source.GOOGLE_OAUTH_CLIENT_ID);
  const googleOAuthClientSecret = parseOptionalSecret(source.GOOGLE_OAUTH_CLIENT_SECRET);
  const redisUrl = parseOptional(source.REDIS_URL);
  const llmProviderApiKey = parseOptionalSecret(source.LLM_PROVIDER_API_KEY);

  return {
    apiPort,
    appUrl,
    authSessionTtlSeconds,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(googleOAuthClientId ? { googleOAuthClientId } : {}),
    ...(googleOAuthClientSecret ? { googleOAuthClientSecret } : {}),
    ...(llmProviderApiKey ? { llmProviderApiKey } : {}),
    nodeEnv,
    ...(redisUrl ? { redisUrl } : {}),
  };
}

function parseNodeEnv(value: string | undefined): PromptGenNodeEnv {
  if (value === undefined) {
    return defaultEnv.nodeEnv;
  }

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new Error("NODE_ENV must be one of development, test, or production.");
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseUrl(value: string, name: string): string {
  try {
    const urlString = value.includes("://") ? value : `http://${value}`;
    return new URL(urlString).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function parseOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseOptionalSecret(value: string | undefined): string | undefined {
  const normalized = parseOptional(value);

  if (normalized === "replace-with-local-secret") {
    return undefined;
  }

  return normalized;
}
