import { loadPromptGenEnv, type PromptGenEnv } from "@promptgen/config/env";
import { foundationSchemaVersion, type ServiceStatus } from "@promptgen/types";

export function createServiceStatus(): ServiceStatus {
  return {
    name: "api",
    state: "ok",
    version: foundationSchemaVersion,
  };
}

export function resolveApiPort(source?: Record<string, string | undefined>): number {
  return loadPromptGenEnv(source).apiPort;
}

export function createHealthPayload(env: PromptGenEnv = loadPromptGenEnv()): {
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
