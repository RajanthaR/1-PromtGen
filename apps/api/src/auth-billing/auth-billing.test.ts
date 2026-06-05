import { describe, expect, it } from "vitest";

import { applyMigrations, createDb, createSqlClient, resetPublicSchema } from "@promptgen/db";

import { InMemoryAuthBillingStore, InMemoryUserScopedStore } from "./in-memory-store";
import { PostgresAuthBillingStore } from "./postgres-store";
import { AuthBillingError, createAuthBillingService } from "./service";
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
