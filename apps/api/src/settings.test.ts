import { createServer, type Server } from "node:http";

import { describe, expect, it } from "vitest";

import {
  createAesGcmByoKeyCipher,
  createAuthBillingService,
  InMemoryAuthBillingStore,
} from "./auth-billing";
import type { JsonLogger } from "./logger";
import { createApiRequestHandler } from "./server";
import type { SettingsBillingPort } from "./settings";

const testEnv = {
  apiPort: 0,
  appUrl: "http://localhost:3000",
  authSessionTtlSeconds: 2_592_000,
  nodeEnv: "test",
  promptQualityJudgeEnabled: false,
} as const;

describe("settings routes", () => {
  it("returns billing plan, usage, BYO status, and privacy disclosures", async () => {
    const { billing } = createBillingFixture({ plan: "free", sessionId: "session-free" });
    const server = await listen(billing);

    try {
      const response = await requestJson(server, "/settings/billing", {
        headers: { "x-session-id": "session-free" },
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        billing: {
          byo_key_configured: false,
          byo_key_enabled: false,
        },
        email_verified: true,
        plan: "free",
        plan_policy: {
          byoKeyAllowed: false,
          emailVerificationRequired: true,
        },
        privacy: {
          context_selection: expect.stringContaining("explicitly selected"),
          training: expect.stringContaining("does not train"),
        },
        quota: {
          limit: 10,
          remaining: 10,
          used: 0,
        },
        user_id: "user-free",
      });
    } finally {
      await close(server);
    }
  });

  it("saves, exports, and revokes BYO keys without returning raw secrets", async () => {
    const { billing } = createBillingFixture({ plan: "pro", sessionId: "session-pro" });
    const server = await listen(billing);

    try {
      const saveResponse = await requestJson(server, "/settings/billing/byo-key", {
        body: {
          api_key: "gemini-settings-secret-1234",
          provider: "gemini",
        },
        headers: { "x-session-id": "session-pro" },
        method: "PUT",
      });

      expect(saveResponse.status).toBe(200);
      expect(saveResponse.body).toMatchObject({
        billing: {
          byo_key_configured: true,
          byo_key_enabled: true,
          byo_key_hint: "1234",
          byo_key_provider: "gemini",
        },
      });
      expect(JSON.stringify(saveResponse.body)).not.toContain("gemini-settings-secret-1234");

      const exportResponse = await requestJson(server, "/settings/export", {
        headers: { "x-session-id": "session-pro" },
      });

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body).toMatchObject({
        export: {
          payload: {
            billingSettings: {
              byoKeyConfigured: true,
              byoKeyHint: "1234",
              byoKeyProvider: "gemini",
            },
          },
        },
      });
      expect(JSON.stringify(exportResponse.body)).not.toContain("gemini-settings-secret-1234");

      const revokeResponse = await requestJson(server, "/settings/billing/byo-key", {
        headers: { "x-session-id": "session-pro" },
        method: "DELETE",
      });

      expect(revokeResponse.status).toBe(200);
      expect(revokeResponse.body).toEqual({
        billing: {
          byo_key_configured: false,
          byo_key_enabled: false,
        },
      });
    } finally {
      await close(server);
    }
  });

  it("requests account deletion through the settings route", async () => {
    const { billing } = createBillingFixture({ plan: "free", sessionId: "session-delete" });
    const server = await listen(billing);

    try {
      const response = await requestJson(server, "/settings/delete-account", {
        headers: { "x-session-id": "session-delete" },
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        deletion: {
          deletedAt: "2026-06-09T10:00:00.000Z",
          purgeAfter: "2026-07-09T10:00:00.000Z",
          userId: "user-free",
        },
      });
    } finally {
      await close(server);
    }
  });
});

function createBillingFixture(input: { plan: "free" | "pro" | "advanced"; sessionId: string }) {
  const store = new InMemoryAuthBillingStore();
  const billing = createAuthBillingService(store, {
    byoKeyCipher: createAesGcmByoKeyCipher("test-byo-key-encryption-secret"),
    clock: () => new Date("2026-06-09T10:00:00.000Z"),
  });
  const userId = input.plan === "free" ? "user-free" : `user-${input.plan}`;

  store.seedUser({
    createdAt: new Date("2026-06-08T00:00:00.000Z"),
    email: `${input.plan}@example.com`,
    emailVerifiedAt: new Date("2026-06-08T00:05:00.000Z"),
    id: userId,
    plan: input.plan,
  });
  store.seedSession({
    createdAt: new Date("2026-06-09T00:00:00.000Z"),
    expiresAt: new Date("2026-06-10T00:00:00.000Z"),
    id: input.sessionId,
    userId,
  });

  return { billing, store, userId };
}

async function listen(billing: SettingsBillingPort): Promise<Server> {
  const logger = {
    info() {
      return undefined;
    },
    warn() {
      return undefined;
    },
    error() {
      return undefined;
    },
  } satisfies JsonLogger;
  const server = createServer(
    createApiRequestHandler({
      billing,
      env: testEnv,
      logger,
    }),
  );

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  return server;
}

async function requestJson(
  server: Server,
  path: string,
  input: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: "DELETE" | "GET" | "POST" | "PUT";
  } = {},
): Promise<{ body: unknown; status: number }> {
  const address = server.address();

  if (typeof address === "string" || address === null) {
    throw new Error("Expected TCP listener address.");
  }

  const requestInit: RequestInit = {
    headers: {
      "content-type": "application/json",
      ...input.headers,
    },
    method: input.method ?? "GET",
  };

  if (input.body !== undefined) {
    requestInit.body = JSON.stringify(input.body);
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, requestInit);

  return {
    body: (await response.json()) as unknown,
    status: response.status,
  };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
