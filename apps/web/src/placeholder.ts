import { foundationSchemaVersion, type ServiceStatus } from "@promptgen/types";

export interface WebPlaceholderStatus {
  service: ServiceStatus;
  state: "Phase 0 foundation";
  title: "PromptForge Studio";
}

export function getWebPlaceholderStatus(): WebPlaceholderStatus {
  return {
    service: {
      name: "web",
      state: "ok",
      version: foundationSchemaVersion,
    },
    state: "Phase 0 foundation",
    title: "PromptForge Studio",
  };
}
