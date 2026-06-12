import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { ContextPage } from "./context-page";
import { HistoryPage } from "./history-page";
import { LibraryPage } from "./library-page";
import { SettingsPage } from "./settings-page";
import type { SettingsBillingResponse } from "./settings-api-client";
import { TemplatesPage } from "./templates-page";

describe("reuse pages", () => {
  it("renders the Library page with filter, versioning, copy, and restore affordances", () => {
    const markup = renderToStaticMarkup(createElement(LibraryPage));

    expect(markup).toContain("Saved prompts");
    expect(markup).toContain("Search");
    expect(markup).toContain("Folder");
    expect(markup).toContain("Tag");
    expect(markup).toContain("Include deleted");
    expect(markup).toContain("Duplicate");
    expect(markup).toContain("Pin");
    expect(markup).toContain("Copy Markdown");
    expect(markup).toContain("Copy JSON");
    expect(markup).toContain("Restore as new version");
    expect(markup).toContain("Selected");
  });

  it("renders the History page with chronological operations, delete, and send-to-editor", () => {
    const markup = renderToStaticMarkup(createElement(HistoryPage));

    expect(markup).toContain("Prompt operations");
    expect(markup).toContain("Chronological history");
    expect(markup).toContain("Send to editor");
    expect(markup).toContain("Delete");
    expect(markup).toContain("Original");
    expect(markup).toContain("Enhanced");
    expect(markup).toContain("Selected");
  });

  it("renders the Context page with CRUD controls and explicit selected snippets", () => {
    const markup = renderToStaticMarkup(createElement(ContextPage));

    expect(markup).toContain("Reusable snippets");
    expect(markup).toContain("New snippet");
    expect(markup).toContain("Snippet editor");
    expect(markup).toContain("Selected snippets");
    expect(markup).toContain("No snippets selected.");
    expect(markup).toContain("Edit");
    expect(markup).toContain("Delete");
    expect(markup.toLowerCase()).not.toContain("auto-inject");
  });

  it("renders the Templates page with filters, required fields, generate, and editor send", () => {
    const markup = renderToStaticMarkup(createElement(TemplatesPage));

    expect(markup).toContain("Prompt templates");
    expect(markup).toContain("Recently used");
    expect(markup).toContain("Difficulty");
    expect(markup).toContain("Tool");
    expect(markup).toContain("Fill variables");
    expect(markup).toContain('required=""');
    expect(markup).toContain("Generate filled prompt");
    expect(markup).toContain("Selected");
  });

  it("renders Settings with API-backed plan, usage, BYO-key, export, delete, and privacy copy", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsPage, {
        initialBilling: createSettingsFixture(),
      }),
    );

    expect(markup).toContain("Settings and billing");
    expect(markup).toContain("Current plan: Pro");
    expect(markup).toContain("Current plan");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain("Bring your own key");
    expect(markup).toContain("Provider API key");
    expect(markup).toContain("Google Gemini");
    expect(markup).toContain("Prepare JSON export");
    expect(markup).toContain("Type DELETE to confirm");
    expect(markup).toContain("Request account deletion");
    expect(markup).toContain("Privacy and providers");
    expect(markup).toContain("does not train");
    expect(markup).toContain("Sub-processors");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
  });

  it("passes an axe accessibility check for Settings and Billing", async () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsPage, {
        initialBilling: createSettingsFixture(),
      }),
    );

    await expectNoA11yViolations(markup);
  });
});

function createSettingsFixture(): SettingsBillingResponse {
  return {
    billing: {
      byo_key_configured: true,
      byo_key_enabled: true,
      byo_key_hint: "1234",
      byo_key_provider: "gemini",
      byo_key_updated_at: "2026-06-09T10:00:00.000Z",
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
      context_selection: "Only context snippets explicitly selected for an enhancement are sent.",
      deletion:
        "Account deletion removes user-scoped data immediately and keeps only a scrubbed soft-deleted user marker until the purge grace period expires.",
      provider_subprocessors: ["Google Gemini API", "OpenAI API for optional quality judge"],
      training: "PromptForge does not train on user prompts or context without explicit opt-in.",
    },
    quota: {
      eventKind: "prompt_enhancement",
      limit: 500,
      period: "month",
      remaining: 458,
      used: 42,
      windowEnd: "2026-07-01T00:00:00.000Z",
      windowStart: "2026-06-01T00:00:00.000Z",
    },
    user_id: "user-pro",
  };
}

async function expectNoA11yViolations(markup: string): Promise<void> {
  const dom = new JSDOM(
    `<!doctype html><html lang="en"><head><title>Settings and billing</title></head><body>${markup}</body></html>`,
    {
      runScripts: "outside-only",
    },
  );

  dom.window.eval(axe.source);

  const results = await (
    dom.window as unknown as {
      axe: {
        run(context: Document): Promise<{ violations: unknown[] }>;
      };
    }
  ).axe.run(dom.window.document);

  expect(results.violations).toEqual([]);
}
