import type { IncomingMessage, ServerResponse } from "node:http";

import {
  AuthBillingError,
  type AuthBillingErrorCode,
  type BillingSettingsSummary,
  type ByoKeyProvider,
  type createAuthBillingService,
} from "./auth-billing";
import type { JsonLogger } from "./logger";
import { resolveSessionId } from "./request-auth";

export type SettingsBillingPort = Pick<
  ReturnType<typeof createAuthBillingService>,
  | "authorizeEnhancement"
  | "exportUserData"
  | "readBillingSettings"
  | "requestAccountDeletion"
  | "revokeByoApiKey"
  | "saveByoApiKey"
>;

type SettingsRoute =
  | { action: "readBilling" }
  | { action: "saveByoKey" }
  | { action: "revokeByoKey" }
  | { action: "exportData" }
  | { action: "deleteAccount" };

const maxSettingsBodyBytes = 128 * 1024;

export async function handleSettingsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: { billing?: SettingsBillingPort; logger: JsonLogger },
): Promise<boolean> {
  const route = parseSettingsRoute(request.method ?? "GET", url.pathname);

  if (!route) {
    return false;
  }

  if ("error" in route) {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: route.error,
    });
    dependencies.logger.warn("api.settings_request", {
      statusCode: 405,
      error: "method_not_allowed",
    });
    return true;
  }

  if (!dependencies.billing) {
    writeJson(response, 503, {
      error: "settings_not_configured",
      message: "Settings and billing storage is not configured.",
    });
    dependencies.logger.warn("api.settings_request", {
      statusCode: 503,
      error: "settings_not_configured",
    });
    return true;
  }

  const sessionId = resolveSessionId(request, url);

  if (!sessionId) {
    writeJson(response, 401, {
      error: "session_required",
      message: "x-session-id header or Bearer token is required.",
    });
    dependencies.logger.warn("api.settings_request", {
      statusCode: 401,
      error: "session_required",
    });
    return true;
  }

  try {
    if (route.action === "readBilling") {
      const settings = await dependencies.billing.readBillingSettings(sessionId);

      writeJson(response, 200, {
        billing: serializeBillingSettings(settings.billingSettings),
        email_verified: settings.emailVerified,
        plan: settings.plan,
        plan_policy: settings.planPolicy,
        privacy: launchPrivacyDisclosures,
        quota: settings.quota,
        user_id: settings.userId,
      });
      dependencies.logger.info("api.settings_request", {
        action: route.action,
        statusCode: 200,
      });
      return true;
    }

    if (route.action === "saveByoKey") {
      const parsed = await readJsonBody(request);

      if ("error" in parsed) {
        writeJson(response, 400, parsed);
        dependencies.logger.warn("api.settings_request", {
          action: route.action,
          statusCode: 400,
          error: parsed.error,
        });
        return true;
      }

      const provider = parseByoKeyProvider(parsed.body.provider);
      const apiKey = parseString(parsed.body.api_key);

      if (!provider || !apiKey) {
        writeJson(response, 400, {
          error: "invalid_request",
          message: "provider and api_key are required.",
        });
        dependencies.logger.warn("api.settings_request", {
          action: route.action,
          statusCode: 400,
          error: "invalid_request",
        });
        return true;
      }

      const billingSettings = await dependencies.billing.saveByoApiKey(sessionId, {
        provider,
        apiKey,
      });

      writeJson(response, 200, {
        billing: serializeBillingSettings(billingSettings),
      });
      dependencies.logger.info("api.settings_request", {
        action: route.action,
        statusCode: 200,
      });
      return true;
    }

    if (route.action === "revokeByoKey") {
      const billingSettings = await dependencies.billing.revokeByoApiKey(sessionId);

      writeJson(response, 200, {
        billing: serializeBillingSettings(billingSettings),
      });
      dependencies.logger.info("api.settings_request", {
        action: route.action,
        statusCode: 200,
      });
      return true;
    }

    if (route.action === "exportData") {
      const exported = await dependencies.billing.exportUserData(sessionId);

      writeJson(response, 200, {
        export: exported,
        privacy: launchPrivacyDisclosures,
      });
      dependencies.logger.info("api.settings_request", {
        action: route.action,
        statusCode: 200,
      });
      return true;
    }

    if (route.action === "deleteAccount") {
      const deletion = await dependencies.billing.requestAccountDeletion(sessionId);

      writeJson(response, 200, {
        deletion,
      });
      dependencies.logger.info("api.settings_request", {
        action: route.action,
        statusCode: 200,
      });
      return true;
    }

    return false;
  } catch (error) {
    const mapped = mapSettingsError(error);

    writeJson(response, mapped.statusCode, mapped.body);
    dependencies.logger.warn("api.settings_request", {
      action: route.action,
      statusCode: mapped.statusCode,
      error: mapped.body.error,
    });
    return true;
  }
}

const launchPrivacyDisclosures = {
  context_selection: "Only context snippets explicitly selected for an enhancement are sent.",
  provider_subprocessors: ["Google Gemini API", "OpenAI API for optional quality judge"],
  training: "PromptForge does not train on user prompts or context without explicit opt-in.",
  deletion: "Account deletion removes user-scoped data immediately and keeps only a scrubbed soft-deleted user marker until the purge grace period expires.",
};

function parseSettingsRoute(
  method: string,
  pathname: string,
): SettingsRoute | { error: string } | null {
  if (pathname === "/settings/billing") {
    return method === "GET"
      ? { action: "readBilling" }
      : { error: "GET is required for reading billing settings." };
  }

  if (pathname === "/settings/billing/byo-key") {
    if (method === "PUT") {
      return { action: "saveByoKey" };
    }

    if (method === "DELETE") {
      return { action: "revokeByoKey" };
    }

    return { error: "PUT or DELETE is required for BYO provider keys." };
  }

  if (pathname === "/settings/export") {
    return method === "GET"
      ? { action: "exportData" }
      : { error: "GET is required for exporting user data." };
  }

  if (pathname === "/settings/delete-account") {
    return method === "POST"
      ? { action: "deleteAccount" }
      : { error: "POST is required for requesting account deletion." };
  }

  return null;
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<{ body: Record<string, unknown> } | { error: string; message: string }> {
  try {
    const rawBody = await readRequestBody(request, maxSettingsBodyBytes);
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : {};

    if (!isRecord(parsed)) {
      return {
        error: "invalid_request",
        message: "Request body must be a JSON object.",
      };
    }

    return { body: parsed };
  } catch (error) {
    return {
      error: "invalid_request",
      message: error instanceof Error ? error.message : "Request body is invalid.",
    };
  }
}

function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      totalBytes += buffer.length;

      if (totalBytes > maxBytes) {
        reject(new Error("Request body exceeds maximum size limit of 128KB."));
        request.destroy();
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function parseByoKeyProvider(value: unknown): ByoKeyProvider | null {
  return value === "gemini" || value === "openai" ? value : null;
}

function parseString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function serializeBillingSettings(settings: BillingSettingsSummary): Record<string, unknown> {
  return {
    byo_key_configured: settings.byoKeyConfigured,
    byo_key_enabled: settings.byoKeyEnabled,
    ...(settings.byoKeyProvider ? { byo_key_provider: settings.byoKeyProvider } : {}),
    ...(settings.byoKeyHint ? { byo_key_hint: settings.byoKeyHint } : {}),
    ...(settings.byoKeyUpdatedAt
      ? { byo_key_updated_at: settings.byoKeyUpdatedAt.toISOString() }
      : {}),
  };
}

function mapSettingsError(error: unknown): {
  body: { error: string; message: string };
  statusCode: number;
} {
  if (error instanceof AuthBillingError) {
    const statusCodeByError: Record<AuthBillingErrorCode, number> = {
      byo_key_not_allowed: 403,
      configuration_error: 503,
      email_verification_required: 403,
      invalid_input: 400,
      not_found: 404,
      quota_exceeded: 402,
      unauthenticated: 401,
    };

    return {
      body: {
        error: error.code,
        message: error.message,
      },
      statusCode: statusCodeByError[error.code],
    };
  }

  return {
    body: {
      error: "settings_error",
      message: "Settings request failed.",
    },
    statusCode: 500,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
