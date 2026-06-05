export type ServiceName = "api" | "web";

export type ServiceState = "ok" | "degraded" | "offline";

export interface ServiceStatus {
  name: ServiceName;
  state: ServiceState;
  version: string;
}

export const foundationSchemaVersion = "0.0.0";
