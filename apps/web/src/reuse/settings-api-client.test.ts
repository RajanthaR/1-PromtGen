import { describe, expect, it } from "vitest";

import { createSettingsApiClient } from "./settings-api-client";

describe("settings API client", () => {
  it("calls Settings and Billing routes with the active session header", async () => {
    const calls: Array<{ body?: string; input: string; method: string; sessionId: string | null }> =
      [];
    const client = createSettingsApiClient({
      baseUrl: "/api",
      fetchImpl: async (input, init = {}) => {
        const headers = new Headers(init.headers);
        const call: { body?: string; input: string; method: string; sessionId: string | null } = {
          input: String(input),
          method: init.method ?? "GET",
          sessionId: headers.get("x-session-id"),
        };

        if (typeof init.body === "string") {
          call.body = init.body;
        }

        calls.push(call);

        if (String(input).endsWith("/settings/billing/byo-key")) {
          return jsonResponse({
            billing: {
              byo_key_configured: init.method !== "DELETE",
              byo_key_enabled: init.method !== "DELETE",
              ...(init.method === "DELETE"
                ? {}
                : { byo_key_hint: "1234", byo_key_provider: "gemini" }),
            },
          });
        }

        if (String(input).endsWith("/settings/export")) {
          return jsonResponse({
            export: {
              payload: {
                prompts: [],
              },
            },
            privacy: {
              context_selection: "selected only",
              deletion: "grace period",
              provider_subprocessors: ["Google Gemini API"],
              training: "no training without opt-in",
            },
          });
        }

        if (String(input).endsWith("/settings/delete-account")) {
          return jsonResponse({
            deletion: {
              deletedAt: "2026-06-09T10:00:00.000Z",
              purgeAfter: "2026-07-09T10:00:00.000Z",
              userId: "user-pro",
            },
          });
        }

        return jsonResponse({
          billing: {
            byo_key_configured: false,
            byo_key_enabled: false,
          },
          email_verified: true,
          plan: "pro",
          plan_policy: {
            byoKeyAllowed: true,
            emailVerificationRequired: false,
            historyRetentionLimit: 500,
            quota: {
              eventKind: "prompt_enhancement",
              limit: 500,
              period: "month",
            },
          },
          privacy: {
            context_selection: "selected only",
            deletion: "grace period",
            provider_subprocessors: ["Google Gemini API"],
            training: "no training without opt-in",
          },
          quota: {
            eventKind: "prompt_enhancement",
            limit: 500,
            period: "month",
            remaining: 499,
            used: 1,
            windowEnd: "2026-07-01T00:00:00.000Z",
            windowStart: "2026-06-01T00:00:00.000Z",
          },
          user_id: "user-pro",
        });
      },
      sessionId: "session-pro",
    });

    await expect(client.readBilling()).resolves.toMatchObject({ plan: "pro" });
    await expect(
      client.saveByoKey({ apiKey: "gemini-client-secret-1234", provider: "gemini" }),
    ).resolves.toMatchObject({
      billing: {
        byo_key_configured: true,
      },
    });
    await expect(client.exportData()).resolves.toMatchObject({
      export: {
        payload: {
          prompts: [],
        },
      },
    });
    await expect(client.requestDeletion()).resolves.toMatchObject({
      deletion: {
        userId: "user-pro",
      },
    });
    await expect(client.revokeByoKey()).resolves.toMatchObject({
      billing: {
        byo_key_configured: false,
      },
    });

    expect(calls.map((call) => [call.method, call.input, call.sessionId])).toEqual([
      ["GET", "/api/settings/billing", "session-pro"],
      ["PUT", "/api/settings/billing/byo-key", "session-pro"],
      ["GET", "/api/settings/export", "session-pro"],
      ["POST", "/api/settings/delete-account", "session-pro"],
      ["DELETE", "/api/settings/billing/byo-key", "session-pro"],
    ]);
    expect(calls[1]?.body).toBe(
      JSON.stringify({
        api_key: "gemini-client-secret-1234",
        provider: "gemini",
      }),
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });
}
