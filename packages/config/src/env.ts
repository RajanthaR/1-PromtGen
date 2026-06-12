export type PromptGenNodeEnv = "development" | "test" | "production";

export interface PromptGenEnv {
  apiPort: number;
  appUrl: string;
  authSessionTtlSeconds: number;
  byoKeyEncryptionSecret?: string;
  databaseUrl?: string;
  googleOAuthClientId?: string;
  googleOAuthClientSecret?: string;
  llmJudgeProviderApiKey?: string;
  llmProviderApiKey?: string;
  nodeEnv: PromptGenNodeEnv;
  promptQualityJudgeEnabled: boolean;
  redisUrl?: string;
}

type EnvSource = Record<string, string | undefined>;

const defaultEnv: PromptGenEnv = {
  apiPort: 4000,
  appUrl: "http://localhost:3000",
  authSessionTtlSeconds: 60 * 60 * 24 * 30,
  nodeEnv: "development",
  promptQualityJudgeEnabled: false,
};

export function loadPromptGenEnv(source: EnvSource = process.env): PromptGenEnv {
  const nodeEnv = parseNodeEnv(source.NODE_ENV);
  const appUrl = parseUrl(source.NEXT_PUBLIC_APP_URL ?? defaultEnv.appUrl, "NEXT_PUBLIC_APP_URL");
  const apiPort = parsePort(source.API_PORT ?? String(defaultEnv.apiPort));
  const authSessionTtlSeconds = parsePositiveInteger(
    source.AUTH_SESSION_TTL_SECONDS ?? String(defaultEnv.authSessionTtlSeconds),
    "AUTH_SESSION_TTL_SECONDS",
  );
  const byoKeyEncryptionSecret = parseOptionalSecret(source.BYO_KEY_ENCRYPTION_SECRET);
  const databaseUrl = parseOptional(source.DATABASE_URL);
  const googleOAuthClientId = parseOptional(source.GOOGLE_OAUTH_CLIENT_ID);
  const googleOAuthClientSecret = parseOptionalSecret(source.GOOGLE_OAUTH_CLIENT_SECRET);
  const redisUrl = parseOptional(source.REDIS_URL);
  const llmJudgeProviderApiKey = parseOptionalSecret(source.LLM_JUDGE_PROVIDER_API_KEY);
  const llmProviderApiKey = parseOptionalSecret(source.LLM_PROVIDER_API_KEY);
  const promptQualityJudgeEnabled = parseBooleanFlag(
    source.PROMPTGEN_LLM_JUDGE_ENABLED,
    "PROMPTGEN_LLM_JUDGE_ENABLED",
  );

  return {
    apiPort,
    appUrl,
    authSessionTtlSeconds,
    ...(byoKeyEncryptionSecret ? { byoKeyEncryptionSecret } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(googleOAuthClientId ? { googleOAuthClientId } : {}),
    ...(googleOAuthClientSecret ? { googleOAuthClientSecret } : {}),
    ...(llmJudgeProviderApiKey ? { llmJudgeProviderApiKey } : {}),
    ...(llmProviderApiKey ? { llmProviderApiKey } : {}),
    nodeEnv,
    promptQualityJudgeEnabled,
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

function parseBooleanFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value.trim() === "") {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`${name} must be true, false, 1, or 0.`);
}
