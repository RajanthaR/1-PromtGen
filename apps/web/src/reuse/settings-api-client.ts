export type SettingsPlanId = "free" | "pro" | "advanced";
export type SettingsByoProvider = "gemini" | "openai";

export interface SettingsBillingSummary {
  byo_key_configured: boolean;
  byo_key_enabled: boolean;
  byo_key_hint?: string;
  byo_key_provider?: SettingsByoProvider;
  byo_key_updated_at?: string;
}

export interface SettingsQuotaStatus {
  eventKind: string;
  limit: number | null;
  period: "day" | "month";
  remaining: number | null;
  used: number;
  windowEnd: string;
  windowStart: string;
}

export interface SettingsPlanPolicy {
  byoKeyAllowed: boolean;
  emailVerificationRequired: boolean;
  historyRetentionLimit: number | null;
  quota: {
    eventKind: string;
    limit: number | null;
    period: "day" | "month";
  };
}

export interface SettingsPrivacyDisclosures {
  context_selection: string;
  deletion: string;
  provider_subprocessors: string[];
  training: string;
}

export interface SettingsBillingResponse {
  billing: SettingsBillingSummary;
  email_verified: boolean;
  plan: SettingsPlanId;
  plan_policy: SettingsPlanPolicy;
  privacy: SettingsPrivacyDisclosures;
  quota: SettingsQuotaStatus;
  user_id: string;
}

export interface SettingsExportResponse {
  export: unknown;
  privacy: SettingsPrivacyDisclosures;
}

export interface SettingsDeletionResponse {
  deletion: {
    deletedAt: string;
    purgeAfter: string;
    userId: string;
  };
}

export interface SettingsApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sessionId?: string | null;
}

type SettingsRequestInit = RequestInit & {
  sessionId?: string | null | undefined;
};

export function createSettingsApiClient(options: SettingsApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    readBilling(): Promise<SettingsBillingResponse> {
      return requestJson<SettingsBillingResponse>(fetchImpl, `${baseUrl}/settings/billing`, {
        sessionId: options.sessionId,
      });
    },
    saveByoKey(input: {
      apiKey: string;
      provider: SettingsByoProvider;
    }): Promise<{ billing: SettingsBillingSummary }> {
      return requestJson<{ billing: SettingsBillingSummary }>(
        fetchImpl,
        `${baseUrl}/settings/billing/byo-key`,
        {
          body: JSON.stringify({
            api_key: input.apiKey,
            provider: input.provider,
          }),
          method: "PUT",
          sessionId: options.sessionId,
        },
      );
    },
    revokeByoKey(): Promise<{ billing: SettingsBillingSummary }> {
      return requestJson<{ billing: SettingsBillingSummary }>(
        fetchImpl,
        `${baseUrl}/settings/billing/byo-key`,
        {
          method: "DELETE",
          sessionId: options.sessionId,
        },
      );
    },
    exportData(): Promise<SettingsExportResponse> {
      return requestJson<SettingsExportResponse>(fetchImpl, `${baseUrl}/settings/export`, {
        sessionId: options.sessionId,
      });
    },
    requestDeletion(): Promise<SettingsDeletionResponse> {
      return requestJson<SettingsDeletionResponse>(
        fetchImpl,
        `${baseUrl}/settings/delete-account`,
        {
          method: "POST",
          sessionId: options.sessionId,
        },
      );
    },
  };
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  input: string,
  init: SettingsRequestInit = {},
): Promise<T> {
  const { sessionId: explicitSessionId, ...requestInit } = init;
  const sessionId = explicitSessionId ?? readBrowserSessionId();
  const headers = new Headers(requestInit.headers);

  headers.set("content-type", "application/json");

  if (sessionId) {
    headers.set("x-session-id", sessionId);
  }

  const response = await fetchImpl(input, {
    ...requestInit,
    headers,
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(body, response.status));
  }

  return body as T;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Settings API returned invalid JSON.");
  }
}

function readErrorMessage(body: unknown, status: number): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return `Settings API request failed with status ${status}.`;
}

function readBrowserSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("promptgen_session_id");
}
