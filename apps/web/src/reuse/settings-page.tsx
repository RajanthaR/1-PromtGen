"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

import {
  createSettingsApiClient,
  type SettingsApiClientOptions,
  type SettingsBillingResponse,
  type SettingsBillingSummary,
  type SettingsByoProvider,
  type SettingsPlanId,
  type SettingsPrivacyDisclosures,
  type SettingsQuotaStatus,
} from "./settings-api-client";
import { ReusePageShell, reuseStyles } from "./reuse-page-shell";

interface SettingsPlan {
  id: SettingsPlanId;
  name: string;
  price: string;
  historyRetention: string;
  quotaLabel: string;
  byoKey: boolean;
}

export interface SettingsPageProps {
  clientOptions?: SettingsApiClientOptions;
  initialBilling?: SettingsBillingResponse;
}

const plans: SettingsPlan[] = [
  {
    byoKey: false,
    historyRetention: "50 history entries",
    id: "free",
    name: "Free",
    price: "$0",
    quotaLabel: "10 enhancements / day",
  },
  {
    byoKey: true,
    historyRetention: "500 history entries",
    id: "pro",
    name: "Pro",
    price: "$19",
    quotaLabel: "500 enhancements / month",
  },
  {
    byoKey: true,
    historyRetention: "Unlimited history",
    id: "advanced",
    name: "Advanced",
    price: "$49",
    quotaLabel: "Unlimited enhancements",
  },
];

const fallbackPrivacy: SettingsPrivacyDisclosures = {
  context_selection: "Only context snippets explicitly selected for an enhancement are sent.",
  deletion:
    "Account deletion removes user-scoped data immediately and keeps only a scrubbed soft-deleted user marker until the purge grace period expires.",
  provider_subprocessors: ["Google Gemini API", "OpenAI API for optional quality judge"],
  training: "PromptForge does not train on user prompts or context without explicit opt-in.",
};

export function SettingsPage({ clientOptions, initialBilling }: SettingsPageProps) {
  const client = useMemo(() => createSettingsApiClient(clientOptions), [clientOptions]);
  const [billingData, setBillingData] = useState<SettingsBillingResponse | null>(
    initialBilling ?? null,
  );
  const [isLoading, setIsLoading] = useState(!initialBilling);
  const [loadError, setLoadError] = useState("");
  const [byoProvider, setByoProvider] = useState<SettingsByoProvider>("gemini");
  const [byoKeyValue, setByoKeyValue] = useState("");
  const [byoKeyStatus, setByoKeyStatus] = useState("BYO key not configured.");
  const [exportStatus, setExportStatus] = useState("Data export ready.");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("Deletion requires confirmation.");
  const activePlan = plans.find((plan) => plan.id === (billingData?.plan ?? "free")) ?? plans[0]!;
  const billing = billingData?.billing;
  const privacy = billingData?.privacy ?? fallbackPrivacy;
  const quota = billingData?.quota ?? null;
  const byoAllowed = Boolean(billingData?.plan_policy.byoKeyAllowed);
  const deleteReady = deleteConfirmation.trim().toUpperCase() === "DELETE";

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setLoadError("");

    client
      .readBilling()
      .then((nextBilling) => {
        if (!active) {
          return;
        }

        setBillingData(nextBilling);
        setByoProvider(nextBilling.billing.byo_key_provider ?? "gemini");
        setByoKeyStatus(formatByoStatus(nextBilling.billing));
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Billing settings failed to load.");
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client]);

  async function saveByoKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!byoAllowed) {
      setByoKeyStatus("BYO key is available on paid plans.");
      return;
    }

    if (byoKeyValue.trim().length < 12) {
      setByoKeyStatus("Enter a complete provider key before saving.");
      return;
    }

    setByoKeyStatus("Saving provider key.");

    try {
      const result = await client.saveByoKey({
        apiKey: byoKeyValue,
        provider: byoProvider,
      });

      setBillingData((current) => (current ? { ...current, billing: result.billing } : current));
      setByoKeyValue("");
      setByoKeyStatus(formatByoStatus(result.billing));
    } catch (error) {
      setByoKeyStatus(error instanceof Error ? error.message : "Provider key could not be saved.");
    }
  }

  async function revokeByoKey() {
    if (!byoAllowed) {
      setByoKeyStatus("BYO key is available on paid plans.");
      return;
    }

    setByoKeyStatus("Revoking provider key.");

    try {
      const result = await client.revokeByoKey();

      setBillingData((current) => (current ? { ...current, billing: result.billing } : current));
      setByoKeyValue("");
      setByoKeyStatus(formatByoStatus(result.billing));
    } catch (error) {
      setByoKeyStatus(
        error instanceof Error ? error.message : "Provider key could not be revoked.",
      );
    }
  }

  async function prepareExport() {
    setExportStatus("Preparing export.");

    try {
      const exported = await client.exportData();
      downloadJson("promptforge-export.json", exported.export);
      setExportStatus("JSON export prepared for prompts, history, context, and usage records.");
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Data export failed.");
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!deleteReady) {
      setDeleteStatus("Type DELETE to enable account deletion.");
      return;
    }

    setDeleteStatus("Requesting account deletion.");

    try {
      const result = await client.requestDeletion();

      setDeleteStatus(
        `Account deletion requested. Purge is scheduled after ${formatDateTime(
          result.deletion.purgeAfter,
        )}.`,
      );
      setDeleteConfirmation("");
    } catch (error) {
      setDeleteStatus(error instanceof Error ? error.message : "Account deletion failed.");
    }
  }

  return (
    <ReusePageShell
      eyebrow="Settings"
      status={pageStatus({ activePlan, isLoading, loadError })}
      title="Settings and billing"
    >
      <div aria-live="polite" className="sr-only" role="status">
        {loadError} {byoKeyStatus} {exportStatus} {deleteStatus}
      </div>

      <section aria-labelledby="plan-title" style={{ ...reuseStyles.panel, marginBottom: "1rem" }}>
        <div style={rowBetweenStyle}>
          <div>
            <h2 id="plan-title" style={sectionTitleStyle}>
              Plan
            </h2>
            <p style={{ ...reuseStyles.muted, marginTop: "0.35rem" }}>
              Current plan: {activePlan.name}. {activePlan.quotaLabel}.
            </p>
            {loadError ? <p style={errorTextStyle}>{loadError}</p> : null}
          </div>
          <span style={currentPlanBadgeStyle}>Current: {activePlan.name}</span>
        </div>

        <ul style={planGridStyle}>
          {plans.map((plan) => {
            const isCurrent = plan.id === activePlan.id;

            return (
              <li
                aria-current={isCurrent ? "true" : undefined}
                key={plan.id}
                style={{
                  ...planCardStyle,
                  ...(isCurrent ? selectedCardStyle : {}),
                }}
              >
                <div style={rowBetweenStyle}>
                  <div>
                    <h3 style={itemTitleStyle}>{plan.name}</h3>
                    <p style={priceStyle}>{plan.price} / month</p>
                  </div>
                  {isCurrent ? <span style={selectedBadgeStyle}>Current plan</span> : null}
                </div>
                <ul style={featureListStyle}>
                  <li>{plan.quotaLabel}</li>
                  <li>{plan.historyRetention}</li>
                  <li>{plan.byoKey ? "BYO-key allowed" : "Platform key only"}</li>
                  <li>Manual export</li>
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      <div style={twoColumnStyle}>
        <section aria-labelledby="usage-title" style={reuseStyles.panel}>
          <h2 id="usage-title" style={sectionTitleStyle}>
            Usage
          </h2>
          {quota ? <QuotaUsage quota={quota} /> : <p style={reuseStyles.muted}>Loading usage.</p>}
          <p style={{ ...reuseStyles.muted, marginTop: "1rem" }}>
            Email verification: {billingData?.email_verified ? "verified" : "required for Free"}.
          </p>
        </section>

        <section aria-labelledby="byo-title" style={reuseStyles.panel}>
          <h2 id="byo-title" style={sectionTitleStyle}>
            Bring your own key
          </h2>
          <p id="byo-key-help" style={{ ...reuseStyles.muted, marginTop: "0.5rem" }}>
            Paid plans can use a provider key for enhancement calls. Secrets are encrypted at rest
            and never returned in settings or exports.
          </p>
          <form onSubmit={saveByoKey} style={formStackStyle}>
            <label style={reuseStyles.label}>
              Provider
              <select
                disabled={!byoAllowed}
                onChange={(event) => setByoProvider(event.currentTarget.value as SettingsByoProvider)}
                style={reuseStyles.input}
                value={byoProvider}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label style={reuseStyles.label}>
              Provider API key
              <input
                aria-describedby="byo-key-help byo-key-status"
                autoComplete="off"
                disabled={!byoAllowed}
                onChange={(event) => setByoKeyValue(event.currentTarget.value)}
                placeholder={byoAllowed ? "Paste provider key" : "Upgrade to enable BYO key"}
                style={reuseStyles.input}
                type="password"
                value={byoKeyValue}
              />
            </label>
            <p aria-live="polite" id="byo-key-status" role="status" style={reuseStyles.muted}>
              {byoKeyStatus}
            </p>
            <div style={reuseStyles.actionRow}>
              <button
                disabled={!byoAllowed}
                style={byoAllowed ? reuseStyles.primaryButton : disabledButtonStyle}
                type="submit"
              >
                Save key
              </button>
              <button
                disabled={!byoAllowed || !billing?.byo_key_configured}
                onClick={revokeByoKey}
                style={
                  byoAllowed && billing?.byo_key_configured
                    ? reuseStyles.button
                    : disabledButtonStyle
                }
                type="button"
              >
                Revoke key
              </button>
            </div>
          </form>
        </section>
      </div>

      <div style={{ ...twoColumnStyle, marginTop: "1rem" }}>
        <section aria-labelledby="export-title" style={reuseStyles.panel}>
          <h2 id="export-title" style={sectionTitleStyle}>
            Data export
          </h2>
          <p style={{ ...reuseStyles.muted, marginTop: "0.5rem" }}>
            Export includes saved prompts, prompt versions, history, selected context snippets, and
            usage records. BYO provider secrets are excluded.
          </p>
          <button onClick={prepareExport} style={{ ...reuseStyles.button, marginTop: "1rem" }} type="button">
            Prepare JSON export
          </button>
          <p aria-live="polite" role="status" style={{ ...reuseStyles.muted, marginTop: "1rem" }}>
            {exportStatus}
          </p>
        </section>

        <section aria-labelledby="delete-title" style={dangerPanelStyle}>
          <h2 id="delete-title" style={sectionTitleStyle}>
            Delete account
          </h2>
          <p id="delete-help" style={{ ...reuseStyles.muted, marginTop: "0.5rem" }}>
            This removes user-scoped data immediately and starts the soft-delete purge grace period.
          </p>
          <form onSubmit={requestDeletion} style={formStackStyle}>
            <label style={reuseStyles.label}>
              Type DELETE to confirm
              <input
                aria-describedby="delete-help delete-status"
                onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
                style={reuseStyles.input}
                value={deleteConfirmation}
              />
            </label>
            <button disabled={!deleteReady} style={deleteReady ? reuseStyles.dangerButton : disabledButtonStyle} type="submit">
              Request account deletion
            </button>
            <p aria-live="polite" id="delete-status" role="status" style={reuseStyles.muted}>
              {deleteStatus}
            </p>
          </form>
        </section>
      </div>

      <section aria-labelledby="privacy-title" style={{ ...reuseStyles.panel, marginTop: "1rem" }}>
        <h2 id="privacy-title" style={sectionTitleStyle}>
          Privacy and providers
        </h2>
        <ul style={{ ...featureListStyle, marginTop: "0.75rem" }}>
          <li>{privacy.context_selection}</li>
          <li>{privacy.training}</li>
          <li>Sub-processors: {privacy.provider_subprocessors.join(", ")}.</li>
          <li>{privacy.deletion}</li>
        </ul>
      </section>
    </ReusePageShell>
  );
}

function QuotaUsage({ quota }: { quota: SettingsQuotaStatus }) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
      <div style={rowBetweenStyle}>
        <strong>{quota.period === "day" ? "Enhancements today" : "Enhancements this month"}</strong>
        <span style={metricTextStyle}>{usageText(quota)}</span>
      </div>
      {quota.limit ? (
        <div
          aria-label={`Enhancement quota: ${usageText(quota)}`}
          aria-valuemax={quota.limit}
          aria-valuemin={0}
          aria-valuenow={quota.used}
          role="progressbar"
          style={progressTrackStyle}
        >
          <span style={{ ...progressFillStyle, width: `${usagePercent(quota)}%` }} />
        </div>
      ) : (
        <p style={reuseStyles.muted}>No enhancement quota limit for this plan.</p>
      )}
      <p style={reuseStyles.muted}>Window resets {formatDateTime(quota.windowEnd)}.</p>
    </div>
  );
}

function pageStatus(input: {
  activePlan: SettingsPlan;
  isLoading: boolean;
  loadError: string;
}): string {
  if (input.isLoading) {
    return "Loading billing settings.";
  }

  if (input.loadError) {
    return "Billing settings need attention.";
  }

  return `${input.activePlan.name} plan active. Usage and billing controls ready.`;
}

function formatByoStatus(settings: SettingsBillingSummary): string {
  if (!settings.byo_key_configured) {
    return "BYO key not configured.";
  }

  return `BYO ${settings.byo_key_provider ?? "provider"} key saved ending in ${
    settings.byo_key_hint ?? "configured"
  }.`;
}

function usagePercent(quota: SettingsQuotaStatus): number {
  if (!quota.limit) {
    return 0;
  }

  return Math.min(100, Math.round((quota.used / quota.limit) * 100));
}

function usageText(quota: SettingsQuotaStatus): string {
  return quota.limit ? `${quota.used} of ${quota.limit} used` : `${quota.used} used`;
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function downloadJson(filename: string, payload: unknown): void {
  if (typeof window === "undefined" || typeof URL === "undefined") {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const currentPlanBadgeStyle = {
  border: "1px solid #173f35",
  borderRadius: "999px",
  color: "#173f35",
  display: "inline-flex",
  fontSize: "0.8125rem",
  fontWeight: 800,
  padding: "0.3rem 0.65rem",
} satisfies CSSProperties;

const dangerPanelStyle = {
  ...reuseStyles.panel,
  border: "1px solid #b91c1c",
} satisfies CSSProperties;

const disabledButtonStyle = {
  ...reuseStyles.button,
  cursor: "not-allowed",
  opacity: 0.62,
} satisfies CSSProperties;

const errorTextStyle = {
  color: "#991b1b",
  fontSize: "0.875rem",
  lineHeight: 1.5,
  margin: "0.5rem 0 0",
} satisfies CSSProperties;

const featureListStyle = {
  color: "#1f2933",
  display: "grid",
  gap: "0.4rem",
  margin: 0,
  paddingLeft: "1.25rem",
} satisfies CSSProperties;

const formStackStyle = {
  display: "grid",
  gap: "1rem",
  marginTop: "1rem",
} satisfies CSSProperties;

const itemTitleStyle = {
  fontSize: "1.125rem",
  lineHeight: 1.3,
  margin: 0,
} satisfies CSSProperties;

const metricTextStyle = {
  color: "#1f2933",
  fontSize: "0.875rem",
  fontWeight: 800,
} satisfies CSSProperties;

const planCardStyle = {
  border: "1px solid #d6d3ca",
  borderRadius: "0.5rem",
  display: "grid",
  gap: "1rem",
  padding: "1rem",
} satisfies CSSProperties;

const planGridStyle = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
  listStyle: "none",
  margin: "1rem 0 0",
  padding: 0,
} satisfies CSSProperties;

const priceStyle = {
  color: "#4b5563",
  fontSize: "0.95rem",
  fontWeight: 700,
  margin: "0.35rem 0 0",
} satisfies CSSProperties;

const progressFillStyle = {
  background: "#173f35",
  borderRadius: "999px",
  display: "block",
  height: "100%",
} satisfies CSSProperties;

const progressTrackStyle = {
  background: "#edf1ed",
  border: "1px solid #9ca3af",
  borderRadius: "999px",
  height: "0.75rem",
  overflow: "hidden",
} satisfies CSSProperties;

const rowBetweenStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  justifyContent: "space-between",
} satisfies CSSProperties;

const sectionTitleStyle = {
  fontSize: "1.125rem",
  lineHeight: 1.3,
  margin: 0,
} satisfies CSSProperties;

const selectedBadgeStyle = {
  background: "#e7f0eb",
  border: "1px solid #173f35",
  borderRadius: "999px",
  color: "#173f35",
  display: "inline-flex",
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "0.25rem 0.6rem",
} satisfies CSSProperties;

const selectedCardStyle = {
  border: "2px solid #173f35",
  boxShadow: "inset 0 0 0 2px #173f35",
} satisfies CSSProperties;

const twoColumnStyle = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
} satisfies CSSProperties;
