import { describe, expect, it } from "vitest";

import { applyMigrations, createDb, createSqlClient, resetPublicSchema } from "@promptgen/db";

import { InMemoryAuthBillingStore, InMemoryUserScopedStore } from "./in-memory-store";
import { PostgresAuthBillingStore } from "./postgres-store";
import { AuthBillingError, createAesGcmByoKeyCipher, createAuthBillingService } from "./service";
import type { UserScopedRecord } from "./types";

interface PromptRow extends UserScopedRecord {
  title: string;
}

describe("auth-billing service", () => {
  it("creates and validates an email login session, then logs it out", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      clock: () => new Date("2026-06-05T00:00:00.000Z"),
      sessionIdGenerator: () => "session-email",
    });

    const session = await service.loginWithEmail({
      email: " USER@example.COM ",
      name: "User Example",
    });

    expect(session).toMatchObject({
      id: "session-email",
      user: {
        email: "user@example.com",
        name: "User Example",
        plan: "free",
      },
    });

    await expect(service.validateSession("session-email")).resolves.toMatchObject({
      id: "session-email",
      user: {
        email: "user@example.com",
      },
    });

    await expect(service.logout("session-email")).resolves.toBe(true);
    await expect(service.validateSession("session-email")).resolves.toBeNull();
  });

  it("returns null for blank or expired sessions without deleting during validation", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      clock: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      email: "expired@example.com",
      id: "user-expired",
      plan: "free",
    });
    store.seedSession({
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      expiresAt: new Date("2026-06-04T01:00:00.000Z"),
      id: "session-expired",
      userId: "user-expired",
    });

    await expect(service.validateSession("   ")).resolves.toBeNull();
    await expect(service.validateSession("session-expired")).resolves.toBeNull();
    await expect(store.findSessionById("session-expired")).resolves.toMatchObject({
      id: "session-expired",
    });
  });

  it("creates a Google OAuth login session for a verified profile", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      sessionIdGenerator: () => "session-google",
    });

    const session = await service.loginWithGoogle({
      provider: "google",
      providerUserId: "google-subject-1",
      email: "google-user@example.com",
      emailVerified: true,
      name: "Google User",
      avatarUrl: "https://example.com/avatar.png",
    });

    expect(session).toMatchObject({
      id: "session-google",
      user: {
        email: "google-user@example.com",
        name: "Google User",
        avatarUrl: "https://example.com/avatar.png",
        plan: "free",
      },
    });
  });

  it("rejects Google OAuth profiles without verified email", async () => {
    const service = createAuthBillingService(new InMemoryAuthBillingStore());

    await expect(
      service.loginWithGoogle({
        provider: "google",
        providerUserId: "google-subject-1",
        email: "google-user@example.com",
        emailVerified: false,
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("reads the current plan from the authenticated user without billing logic", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      sessionIdGenerator: () => "session-plan",
    });

    await service.loginWithEmail({ email: "plan@example.com" });

    await expect(service.readCurrentPlan("session-plan")).resolves.toEqual({
      plan: "free",
      userId: "user-1",
    });
  });

  it("requires verified free-tier email and blocks platform quota at the launch limit", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      clock: () => new Date("2026-06-09T10:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      email: "unverified@example.com",
      id: "user-unverified",
      plan: "free",
    });
    store.seedSession({
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      id: "session-unverified",
      userId: "user-unverified",
    });

    await expect(service.authorizeEnhancement("session-unverified")).rejects.toMatchObject({
      code: "email_verification_required",
    });

    store.seedUser({
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      email: "verified@example.com",
      emailVerifiedAt: new Date("2026-06-08T00:05:00.000Z"),
      id: "user-verified",
      plan: "free",
    });
    store.seedSession({
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      id: "session-verified",
      userId: "user-verified",
    });

    for (let index = 0; index < 10; index += 1) {
      const authorization = await service.authorizeEnhancement("session-verified");

      expect(authorization.credential).toEqual({ source: "platform" });
    }

    await expect(service.authorizeEnhancement("session-verified")).rejects.toMatchObject({
      code: "quota_exceeded",
    });
    await expect(
      store.countUsageEvents(
        "user-verified",
        "prompt_enhancement",
        new Date("2026-06-09T00:00:00.000Z"),
        new Date("2026-06-10T00:00:00.000Z"),
      ),
    ).resolves.toBe(10);
  });

  it("uses paid-tier BYO provider keys without consuming platform quota", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      byoKeyCipher: createAesGcmByoKeyCipher("test-byo-key-encryption-secret"),
      clock: () => new Date("2026-06-09T10:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      email: "pro@example.com",
      id: "user-pro",
      plan: "pro",
    });
    store.seedSession({
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      id: "session-pro",
      userId: "user-pro",
    });

    await expect(
      service.saveByoApiKey("session-pro", {
        provider: "gemini",
        apiKey: "gemini-secret-1234",
      }),
    ).resolves.toMatchObject({
      byoKeyConfigured: true,
      byoKeyEnabled: true,
      byoKeyHint: "1234",
      byoKeyProvider: "gemini",
    });

    const settings = await service.readBillingSettings("session-pro");
    const authorization = await service.authorizeEnhancement("session-pro");

    expect(JSON.stringify(settings)).not.toContain("gemini-secret-1234");
    expect(authorization).toMatchObject({
      credential: {
        source: "byo_key",
        provider: "gemini",
        apiKey: "gemini-secret-1234",
        keyHint: "1234",
      },
      plan: "pro",
      quota: {
        used: 0,
      },
      userId: "user-pro",
    });
    await expect(
      store.countUsageEvents(
        "user-pro",
        "prompt_enhancement",
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-07-01T00:00:00.000Z"),
      ),
    ).resolves.toBe(0);
  });

  it("revokes paid-tier BYO provider keys without returning stored ciphertext", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      byoKeyCipher: createAesGcmByoKeyCipher("test-byo-key-encryption-secret"),
      clock: () => new Date("2026-06-09T10:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      email: "pro-revoke@example.com",
      id: "user-pro-revoke",
      plan: "pro",
    });
    store.seedSession({
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      id: "session-pro-revoke",
      userId: "user-pro-revoke",
    });

    await service.saveByoApiKey("session-pro-revoke", {
      provider: "gemini",
      apiKey: "gemini-secret-1234",
    });
    const settings = await service.revokeByoApiKey("session-pro-revoke");

    expect(settings).toEqual({
      byoKeyConfigured: false,
      byoKeyEnabled: false,
    });
    await expect(store.findBillingSettings("user-pro-revoke")).resolves.toMatchObject({
      byoKeyEnabled: false,
      byoKeyCiphertext: null,
      byoKeyHint: null,
      byoKeyProvider: null,
    });
  });

  it("exports complete user-scoped billing, history, library, context, and usage data", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      byoKeyCipher: createAesGcmByoKeyCipher("test-byo-key-encryption-secret"),
      clock: () => new Date("2026-06-09T10:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      email: "export@example.com",
      id: "user-export",
      plan: "pro",
    });
    store.seedSession({
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      id: "session-export",
      userId: "user-export",
    });
    await service.saveByoApiKey("session-export", {
      provider: "gemini",
      apiKey: "gemini-export-secret",
    });
    store.seedUserData("user-export", {
      contextSnippets: [
        {
          body: "Use a direct operations voice.",
          createdAt: new Date("2026-06-08T01:00:00.000Z"),
          id: "ctx-export",
          kind: "brand_voice",
          title: "Voice",
        },
      ],
      folders: [
        {
          createdAt: new Date("2026-06-08T02:00:00.000Z"),
          id: "folder-export",
          name: "Launch",
        },
      ],
      operations: [
        {
          createdAt: new Date("2026-06-08T03:00:00.000Z"),
          enhancedPrompt: "Enhanced export prompt",
          id: "operation-export",
          mode: "enhance",
          promptType: "text",
          rawPrompt: "Raw export prompt",
          saved: true,
          targetModel: "auto",
          tokens: 120,
        },
      ],
      prompts: [
        {
          createdAt: new Date("2026-06-08T04:00:00.000Z"),
          currentVersionId: "version-export",
          folderId: "folder-export",
          id: "prompt-export",
          pinned: false,
          title: "Export prompt",
        },
      ],
      promptTags: [{ promptId: "prompt-export", tagId: "tag-export" }],
      promptVersions: [
        {
          body: "Saved prompt body",
          changeNote: "Initial",
          createdAt: new Date("2026-06-08T04:05:00.000Z"),
          id: "version-export",
          promptId: "prompt-export",
          sections: { role: "writer" },
        },
      ],
      tags: [
        {
          createdAt: new Date("2026-06-08T05:00:00.000Z"),
          id: "tag-export",
          name: "launch",
        },
      ],
      usageEvents: [
        {
          createdAt: new Date("2026-06-08T06:00:00.000Z"),
          id: "usage-export",
          kind: "prompt_enhancement",
          quantity: 1,
        },
      ],
    });

    const exported = await service.exportUserData("session-export");

    expect(exported.exportedAt).toEqual(new Date("2026-06-09T10:00:00.000Z"));
    expect(exported.payload).toMatchObject({
      billingSettings: {
        byoKeyConfigured: true,
        byoKeyHint: "cret",
        byoKeyProvider: "gemini",
      },
      contextSnippets: [{ id: "ctx-export" }],
      folders: [{ id: "folder-export" }],
      operations: [{ id: "operation-export", rawPrompt: "Raw export prompt" }],
      prompts: [{ id: "prompt-export" }],
      promptTags: [{ promptId: "prompt-export", tagId: "tag-export" }],
      promptVersions: [{ id: "version-export", body: "Saved prompt body" }],
      sessions: [{ id: "session-export" }],
      tags: [{ id: "tag-export" }],
      usageEvents: [{ id: "usage-export" }],
      user: {
        id: "user-export",
        email: "export@example.com",
      },
    });
    expect(JSON.stringify(exported)).not.toContain("gemini-export-secret");
  });

  it("deletes account-scoped data and invalidates sessions before the purge grace expires", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      clock: () => new Date("2026-06-09T10:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      email: "delete@example.com",
      id: "user-delete",
      plan: "free",
      emailVerifiedAt: new Date("2026-06-08T00:05:00.000Z"),
    });
    store.seedSession({
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      id: "session-delete",
      userId: "user-delete",
    });
    store.seedUserData("user-delete", {
      operations: [
        {
          createdAt: new Date("2026-06-08T03:00:00.000Z"),
          id: "operation-delete",
          mode: "enhance",
          promptType: "text",
          rawPrompt: "Remove me",
          saved: false,
          targetModel: "auto",
        },
      ],
      usageEvents: [
        {
          createdAt: new Date("2026-06-08T06:00:00.000Z"),
          id: "usage-delete",
          kind: "prompt_enhancement",
          quantity: 1,
        },
      ],
    });

    await expect(service.requestAccountDeletion("session-delete")).resolves.toEqual({
      deletedAt: new Date("2026-06-09T10:00:00.000Z"),
      purgeAfter: new Date("2026-07-09T10:00:00.000Z"),
      userId: "user-delete",
    });

    await expect(service.validateSession("session-delete")).resolves.toBeNull();
    await expect(store.findUserByEmail("delete@example.com")).resolves.toBeNull();
    await expect(
      store.countUsageEvents(
        "user-delete",
        "prompt_enhancement",
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-07-01T00:00:00.000Z"),
      ),
    ).resolves.toBe(0);
  });

  it("purges expired soft-deleted accounts and recoverable rows after the grace period", async () => {
    const store = new InMemoryAuthBillingStore();
    const service = createAuthBillingService(store, {
      clock: () => new Date("2026-07-10T00:00:00.000Z"),
    });

    store.seedUser({
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      deletedAt: new Date("2026-06-01T00:00:00.000Z"),
      email: "deleted+old@deleted.promptgen.local",
      id: "user-old-delete",
      plan: "free",
    });
    store.seedUser({
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      email: "active-purge@example.com",
      id: "user-active-purge",
      plan: "free",
    });
    store.seedUserData("user-active-purge", {
      contextSnippets: [
        {
          body: "Expired context",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          deletedAt: new Date("2026-06-01T00:00:00.000Z"),
          id: "ctx-expired",
          kind: "brand_voice",
          title: "Expired",
        },
      ],
      prompts: [
        {
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          currentVersionId: "version-expired",
          deletedAt: new Date("2026-06-01T00:00:00.000Z"),
          id: "prompt-expired",
          pinned: false,
          title: "Expired prompt",
        },
      ],
      promptVersions: [
        {
          body: "Expired body",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          id: "version-expired",
          promptId: "prompt-expired",
          sections: {},
        },
      ],
    });

    await expect(service.purgeExpiredSoftDeletedData()).resolves.toEqual({
      contextSnippets: 1,
      prompts: 1,
      users: 1,
    });
    await expect(store.exportUserData("user-active-purge")).resolves.toMatchObject({
      contextSnippets: [],
      prompts: [],
      promptVersions: [],
    });
  });

  it("prevents user A from reading user B rows", async () => {
    const authStore = new InMemoryAuthBillingStore();
    const promptStore = new InMemoryUserScopedStore<PromptRow>();
    const service = createAuthBillingService(authStore, {
      sessionIdGenerator: (() => {
        const ids = ["session-a", "session-b"];
        return () => ids.shift() ?? "session-extra";
      })(),
    });

    const userASession = await service.loginWithEmail({ email: "a@example.com" });
    const userBSession = await service.loginWithEmail({ email: "b@example.com" });

    promptStore.seed({
      id: "prompt-b",
      userId: userBSession.user.id,
      title: "User B private prompt",
    });

    await expect(
      service.readUserScopedRow(userASession.id, "prompt-b", (rowId) =>
        promptStore.findById(rowId),
      ),
    ).rejects.toBeInstanceOf(AuthBillingError);

    await expect(
      service.readUserScopedRow(userASession.id, "prompt-b", (rowId) =>
        promptStore.findById(rowId),
      ),
    ).rejects.toMatchObject({
      code: "not_found",
    });

    await expect(
      service.readUserScopedRow(userBSession.id, "prompt-b", (rowId) =>
        promptStore.findById(rowId),
      ),
    ).resolves.toEqual({
      id: "prompt-b",
      userId: userBSession.user.id,
      title: "User B private prompt",
    });
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("auth-billing Postgres store", () => {
  it("persists email login sessions in the canonical users and sessions tables", async () => {
    const sql = createSqlClient(requireDatabaseUrl());
    const db = createDb(sql);

    try {
      await resetPublicSchema(sql);
      await applyMigrations(sql);

      const service = createAuthBillingService(new PostgresAuthBillingStore(db), {
        clock: () => new Date("2026-06-05T00:00:00.000Z"),
        sessionIdGenerator: () => "11111111-1111-4111-8111-111111111111",
      });

      const session = await service.loginWithEmail({
        email: " DB-USER@example.COM ",
        name: "DB User",
      });

      expect(session).toMatchObject({
        id: "11111111-1111-4111-8111-111111111111",
        user: {
          email: "db-user@example.com",
          name: "DB User",
          plan: "free",
        },
      });

      await expect(service.validateSession(session.id)).resolves.toMatchObject({
        id: session.id,
        user: {
          email: "db-user@example.com",
        },
      });

      await expect(
        new PostgresAuthBillingStore(db).updateUserProfile(session.user.id, {}),
      ).resolves.toMatchObject({
        email: "db-user@example.com",
        id: session.user.id,
      });

      await expect(service.logout(session.id)).resolves.toBe(true);
      await expect(service.validateSession(session.id)).resolves.toBeNull();
    } finally {
      await sql.end();
    }
  });
});

function requireDatabaseUrl(): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database-backed auth tests.");
  }

  return databaseUrl;
}
