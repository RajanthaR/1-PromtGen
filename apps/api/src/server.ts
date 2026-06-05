import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { foundationSchemaVersion, type ServiceStatus } from "@promptgen/types";

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

export function createHealthPayload(env: PromptGenEnv = defaultEnv): {
  env: PromptGenEnv["nodeEnv"];
  port: number;
  service: ServiceStatus;
} {
  return {
    env: env.nodeEnv,
    port: env.apiPort,
    service: createServiceStatus(),
  };
}
