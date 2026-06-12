import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import type { PromptGenDatabase } from "@promptgen/db";
import {
  contextSnippets,
  folders,
  operations,
  prompts,
  promptTags,
  promptVersions,
  sessions,
  tags,
  usageEvents,
  userBillingSettings,
  users,
} from "@promptgen/db/schema";

import type {
  AuthBillingStore,
  AuthUser,
  BillingSettingsRecord,
  BillingSettingsSummary,
  ByoKeyProvider,
  CreateSessionInput,
  CreateUserInput,
  PurgeResult,
  QuotaEventKind,
  SessionRecord,
  SoftDeleteUserInput,
  UpdateByoApiKeyInput,
  UpdateUserProfileInput,
  UsageEventRecordInput,
  UserDataExportPayload,
  UserPlan,
} from "./types";

export class PostgresAuthBillingStore implements AuthBillingStore {
  constructor(private readonly db: PromptGenDatabase) {}

  async countUsageEvents(
    userId: string,
    kind: QuotaEventKind,
    since: Date,
    until: Date,
  ): Promise<number> {
    const rows = await this.db
      .select({ quantity: usageEvents.quantity })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.kind, kind),
          gte(usageEvents.createdAt, since),
          lt(usageEvents.createdAt, until),
        ),
      );

    return rows.reduce((total, row) => total + row.quantity, 0);
  }

  async clearByoApiKey(userId: string, updatedAt: Date): Promise<BillingSettingsRecord> {
    const [settings] = await this.db
      .insert(userBillingSettings)
      .values({
        byoKeyCiphertext: null,
        byoKeyEnabled: false,
        byoKeyHint: null,
        byoKeyProvider: null,
        byoKeyUpdatedAt: null,
        updatedAt,
        userId,
      })
      .onConflictDoUpdate({
        set: {
          byoKeyCiphertext: null,
          byoKeyEnabled: false,
          byoKeyHint: null,
          byoKeyProvider: null,
          byoKeyUpdatedAt: null,
          updatedAt,
        },
        target: userBillingSettings.userId,
      })
      .returning();

    if (!settings) {
      throw new Error("Failed to clear BYO provider key settings.");
    }

    return mapBillingSettings(settings);
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const [session] = await this.db
      .insert(sessions)
      .values({
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        id: input.id,
        userId: input.userId,
      })
      .returning({
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        id: sessions.id,
        userId: sessions.userId,
      });

    if (!session) {
      throw new Error("Failed to create auth session.");
    }

    return session;
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const [user] = await this.db
      .insert(users)
      .values({
        avatarUrl: input.avatarUrl,
        email: input.email,
        emailVerifiedAt: input.emailVerifiedAt,
        name: input.name,
        plan: input.plan,
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create auth user.");
    }

    return mapUser(user);
  }

  async deleteUserScopedData(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('promptgen.allow_prompt_version_purge', 'on', true)`);
      await deleteUserScopedRows(tx, userId);
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id });

    return deleted.length > 0;
  }

  async exportUserData(userId: string): Promise<UserDataExportPayload> {
    const user = await this.findUserById(userId);

    if (!user) {
      throw new Error(`User ${userId} does not exist.`);
    }

    const promptRows = await this.db
      .select({
        createdAt: prompts.createdAt,
        currentVersionId: prompts.currentVersionId,
        deletedAt: prompts.deletedAt,
        folderId: prompts.folderId,
        id: prompts.id,
        pinned: prompts.pinned,
        title: prompts.title,
      })
      .from(prompts)
      .where(eq(prompts.userId, userId));
    const promptIds = promptRows.map((prompt) => prompt.id);
    const tagRows = await this.db
      .select({
        createdAt: tags.createdAt,
        id: tags.id,
        name: tags.name,
      })
      .from(tags)
      .where(eq(tags.userId, userId));
    const tagIds = tagRows.map((tag) => tag.id);

    const [billingSettings, sessionRows, folderRows, contextRows, operationRows, usageRows] =
      await Promise.all([
        this.findBillingSettings(userId),
        this.db
          .select({
            createdAt: sessions.createdAt,
            expiresAt: sessions.expiresAt,
            id: sessions.id,
            userId: sessions.userId,
          })
          .from(sessions)
          .where(eq(sessions.userId, userId)),
        this.db
          .select({
            createdAt: folders.createdAt,
            id: folders.id,
            name: folders.name,
          })
          .from(folders)
          .where(eq(folders.userId, userId)),
        this.db
          .select({
            body: contextSnippets.body,
            createdAt: contextSnippets.createdAt,
            deletedAt: contextSnippets.deletedAt,
            id: contextSnippets.id,
            kind: contextSnippets.kind,
            title: contextSnippets.title,
          })
          .from(contextSnippets)
          .where(eq(contextSnippets.userId, userId)),
        this.db
          .select({
            createdAt: operations.createdAt,
            enhancedPrompt: operations.enhancedPrompt,
            feedback: operations.feedback,
            id: operations.id,
            latencyMs: operations.latencyMs,
            mode: operations.mode,
            model: operations.model,
            promptType: operations.promptType,
            provider: operations.provider,
            rawPrompt: operations.rawPrompt,
            saved: operations.saved,
            structureScoreAfter: operations.structureScoreAfter,
            structureScoreBefore: operations.structureScoreBefore,
            targetModel: operations.targetModel,
            tokens: operations.tokens,
          })
          .from(operations)
          .where(eq(operations.userId, userId)),
        this.db
          .select({
            createdAt: usageEvents.createdAt,
            id: usageEvents.id,
            kind: usageEvents.kind,
            quantity: usageEvents.quantity,
          })
          .from(usageEvents)
          .where(eq(usageEvents.userId, userId)),
      ]);
    const promptVersionRows =
      promptIds.length === 0
        ? []
        : await this.db
            .select({
              body: promptVersions.body,
              changeNote: promptVersions.changeNote,
              createdAt: promptVersions.createdAt,
              id: promptVersions.id,
              promptId: promptVersions.promptId,
              sections: promptVersions.sections,
            })
            .from(promptVersions)
            .where(inArray(promptVersions.promptId, promptIds));
    const promptTagRows =
      promptIds.length === 0 || tagIds.length === 0
        ? []
        : await this.db
            .select({
              promptId: promptTags.promptId,
              tagId: promptTags.tagId,
            })
            .from(promptTags)
            .where(and(inArray(promptTags.promptId, promptIds), inArray(promptTags.tagId, tagIds)));

    return {
      billingSettings: summarizeBillingSettings(billingSettings),
      contextSnippets: contextRows,
      folders: folderRows,
      operations: operationRows,
      prompts: promptRows,
      promptTags: promptTagRows,
      promptVersions: promptVersionRows,
      sessions: sessionRows,
      tags: tagRows,
      usageEvents: usageRows,
      user,
    };
  }

  async findBillingSettings(userId: string): Promise<BillingSettingsRecord | null> {
    const [settings] = await this.db
      .select()
      .from(userBillingSettings)
      .where(eq(userBillingSettings.userId, userId));

    return settings ? mapBillingSettings(settings) : null;
  }

  async findSessionById(sessionId: string): Promise<SessionRecord | null> {
    const [session] = await this.db
      .select({
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        id: sessions.id,
        userId: sessions.userId,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    return session ?? null;
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));

    return user ? mapUser(user) : null;
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    return user ? mapUser(user) : null;
  }

  async purgeExpiredDeletedData(cutoff: Date): Promise<PurgeResult> {
    const [expiredContextRows, expiredPromptRows, expiredUserRows] = await Promise.all([
      this.db
        .select({ id: contextSnippets.id })
        .from(contextSnippets)
        .where(and(isNotNull(contextSnippets.deletedAt), lte(contextSnippets.deletedAt, cutoff))),
      this.db
        .select({ id: prompts.id })
        .from(prompts)
        .where(and(isNotNull(prompts.deletedAt), lte(prompts.deletedAt, cutoff))),
      this.db
        .select({ id: users.id })
        .from(users)
        .where(and(isNotNull(users.deletedAt), lte(users.deletedAt, cutoff))),
    ]);
    const expiredPromptIds = expiredPromptRows.map((row) => row.id);
    const expiredUserIds = expiredUserRows.map((row) => row.id);

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('promptgen.allow_prompt_version_purge', 'on', true)`);

      if (expiredContextRows.length > 0) {
        await tx.delete(contextSnippets).where(
          inArray(
            contextSnippets.id,
            expiredContextRows.map((row) => row.id),
          ),
        );
      }

      if (expiredPromptIds.length > 0) {
        await tx.delete(promptTags).where(inArray(promptTags.promptId, expiredPromptIds));
        await tx.delete(prompts).where(inArray(prompts.id, expiredPromptIds));
      }

      for (const userId of expiredUserIds) {
        await deleteUserScopedRows(tx, userId);
        await tx.delete(users).where(eq(users.id, userId));
      }
    });

    return {
      contextSnippets: expiredContextRows.length,
      prompts: expiredPromptRows.length,
      users: expiredUserRows.length,
    };
  }

  async recordUsageEvent(input: UsageEventRecordInput): Promise<void> {
    await this.db.insert(usageEvents).values({
      createdAt: input.createdAt,
      kind: input.kind,
      quantity: input.quantity,
      userId: input.userId,
    });
  }

  async softDeleteUser(userId: string, input: SoftDeleteUserInput): Promise<AuthUser> {
    const [user] = await this.db
      .update(users)
      .set({
        avatarUrl: null,
        deletedAt: input.deletedAt,
        email: input.scrubbedEmail,
        emailVerifiedAt: null,
        name: null,
        plan: "free",
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new Error(`User ${userId} does not exist.`);
    }

    return mapUser(user);
  }

  async updateByoApiKey(
    userId: string,
    input: UpdateByoApiKeyInput,
  ): Promise<BillingSettingsRecord> {
    const [settings] = await this.db
      .insert(userBillingSettings)
      .values({
        byoKeyCiphertext: input.encryptedKey,
        byoKeyEnabled: true,
        byoKeyHint: input.keyHint,
        byoKeyProvider: input.provider,
        byoKeyUpdatedAt: input.updatedAt,
        updatedAt: input.updatedAt,
        userId,
      })
      .onConflictDoUpdate({
        set: {
          byoKeyCiphertext: input.encryptedKey,
          byoKeyEnabled: true,
          byoKeyHint: input.keyHint,
          byoKeyProvider: input.provider,
          byoKeyUpdatedAt: input.updatedAt,
          updatedAt: input.updatedAt,
        },
        target: userBillingSettings.userId,
      })
      .returning();

    if (!settings) {
      throw new Error("Failed to update BYO provider key settings.");
    }

    return mapBillingSettings(settings);
  }

  async updateUserPlan(userId: string, plan: UserPlan): Promise<AuthUser> {
    const [user] = await this.db
      .update(users)
      .set({ plan })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!user) {
      throw new Error(`User ${userId} does not exist.`);
    }

    return mapUser(user);
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AuthUser> {
    const updateFields: Partial<typeof users.$inferInsert> = {};

    if (input.avatarUrl !== undefined) {
      updateFields.avatarUrl = input.avatarUrl;
    }

    if (input.name !== undefined) {
      updateFields.name = input.name;
    }

    if (input.emailVerifiedAt !== undefined) {
      updateFields.emailVerifiedAt = input.emailVerifiedAt;
    }

    if (Object.keys(updateFields).length === 0) {
      const user = await this.findUserById(userId);

      if (!user) {
        throw new Error(`User ${userId} does not exist.`);
      }

      return user;
    }

    const [user] = await this.db
      .update(users)
      .set(updateFields)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!user) {
      throw new Error(`User ${userId} does not exist.`);
    }

    return mapUser(user);
  }
}

function mapUser(user: {
  avatarUrl: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  email: string;
  emailVerifiedAt: Date | null;
  id: string;
  name: string | null;
  plan: UserPlan;
}): AuthUser {
  return {
    createdAt: user.createdAt,
    email: user.email,
    id: user.id,
    plan: user.plan,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.deletedAt ? { deletedAt: user.deletedAt } : {}),
    ...(user.emailVerifiedAt ? { emailVerifiedAt: user.emailVerifiedAt } : {}),
    ...(user.name ? { name: user.name } : {}),
  };
}

function mapBillingSettings(settings: {
  byoKeyCiphertext: string | null;
  byoKeyEnabled: boolean;
  byoKeyHint: string | null;
  byoKeyProvider: string | null;
  byoKeyUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}): BillingSettingsRecord {
  return {
    byoKeyCiphertext: settings.byoKeyCiphertext,
    byoKeyEnabled: settings.byoKeyEnabled,
    byoKeyHint: settings.byoKeyHint,
    byoKeyProvider: parseByoKeyProvider(settings.byoKeyProvider),
    byoKeyUpdatedAt: settings.byoKeyUpdatedAt,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    userId: settings.userId,
  };
}

function summarizeBillingSettings(settings: BillingSettingsRecord | null): BillingSettingsSummary {
  return {
    byoKeyConfigured:
      settings?.byoKeyEnabled === true &&
      settings.byoKeyProvider !== null &&
      settings.byoKeyCiphertext !== null,
    byoKeyEnabled: settings?.byoKeyEnabled ?? false,
    ...(settings?.byoKeyProvider ? { byoKeyProvider: settings.byoKeyProvider } : {}),
    ...(settings?.byoKeyHint ? { byoKeyHint: settings.byoKeyHint } : {}),
    ...(settings?.byoKeyUpdatedAt ? { byoKeyUpdatedAt: settings.byoKeyUpdatedAt } : {}),
  };
}

function parseByoKeyProvider(provider: string | null): ByoKeyProvider | null {
  if (provider === "gemini" || provider === "openai") {
    return provider;
  }

  return null;
}

async function deleteUserScopedRows(
  db: Pick<PromptGenDatabase, "delete" | "select">,
  userId: string,
): Promise<void> {
  const promptRows = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(eq(prompts.userId, userId));
  const promptIds = promptRows.map((prompt) => prompt.id);

  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(usageEvents).where(eq(usageEvents.userId, userId));
  await db.delete(operations).where(eq(operations.userId, userId));
  await db.delete(contextSnippets).where(eq(contextSnippets.userId, userId));
  await db.delete(userBillingSettings).where(eq(userBillingSettings.userId, userId));

  if (promptIds.length > 0) {
    await db.delete(promptTags).where(inArray(promptTags.promptId, promptIds));
    await db.delete(prompts).where(inArray(prompts.id, promptIds));
  }

  await db.delete(tags).where(eq(tags.userId, userId));
  await db.delete(folders).where(eq(folders.userId, userId));
}
