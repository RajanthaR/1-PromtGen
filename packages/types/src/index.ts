export type ServiceName = "api" | "web";

export type ServiceState = "ok" | "degraded" | "offline";

export interface ServiceStatus {
  name: ServiceName;
  state: ServiceState;
  version: string;
}

export type DependencyName = "redis";

export type DependencyState = ServiceState | "not_configured";

export interface DependencyStatus {
  name: DependencyName;
  state: DependencyState;
  configured: boolean;
}

export interface HealthPayload {
  env: "development" | "test" | "production";
  port: number;
  service: ServiceStatus;
  dependencies: {
    redis: DependencyStatus;
  };
}

export const foundationSchemaVersion = "0.0.0";
