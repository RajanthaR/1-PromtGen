import type {
  AuthBillingStore,
  AuthUser,
  BillingSettingsRecord,
  BillingSettingsSummary,
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
  UserScopedRecord,
} from "./types";

export class InMemoryAuthBillingStore implements AuthBillingStore {
  private readonly billingSettings = new Map<string, BillingSettingsRecord>();
  private readonly contextSnippets: Array<
    UserDataExportPayload["contextSnippets"][number] & { userId: string }
  > = [];
  private readonly folders: Array<UserDataExportPayload["folders"][number] & { userId: string }> =
    [];
  private readonly operations: Array<
    UserDataExportPayload["operations"][number] & { userId: string }
  > = [];
  private readonly prompts: Array<UserDataExportPayload["prompts"][number] & { userId: string }> =
    [];
  private readonly promptTags: UserDataExportPayload["promptTags"] = [];
  private readonly promptVersions: UserDataExportPayload["promptVersions"] = [];
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly tags: Array<UserDataExportPayload["tags"][number] & { userId: string }> = [];
  private readonly usageEvents: Array<
    UserDataExportPayload["usageEvents"][number] & { userId: string }
  > = [];
  private readonly users = new Map<string, AuthUser>();
  private usageEventSequence = 0;
  private userSequence = 0;

  async countUsageEvents(
    userId: string,
    kind: QuotaEventKind,
    since: Date,
    until: Date,
  ): Promise<number> {
    return this.usageEvents
      .filter(
        (event) =>
          event.userId === userId &&
          event.kind === kind &&
          event.createdAt >= since &&
          event.createdAt < until,
      )
      .reduce((total, event) => total + event.quantity, 0);
  }

  async clearByoApiKey(userId: string, updatedAt: Date): Promise<BillingSettingsRecord> {
    const now = new Date(updatedAt);
    const existing = this.billingSettings.get(userId);
    const settings: BillingSettingsRecord = {
      userId,
      byoKeyEnabled: false,
      byoKeyProvider: null,
      byoKeyCiphertext: null,
      byoKeyHint: null,
      byoKeyUpdatedAt: null,
      createdAt: existing?.createdAt ? new Date(existing.createdAt) : now,
      updatedAt: now,
    };

    this.billingSettings.set(userId, cloneBillingSettings(settings));
    return cloneBillingSettings(settings);
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session = cloneSession(input);
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const id = `user-${++this.userSequence}`;
    const user: AuthUser = {
      id,
      email: input.email,
      plan: input.plan,
      createdAt: new Date(),
      ...(input.name ? { name: input.name } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.emailVerifiedAt ? { emailVerifiedAt: new Date(input.emailVerifiedAt) } : {}),
    };

    this.users.set(user.id, cloneUser(user));
    return cloneUser(user);
  }

  async deleteUserScopedData(userId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }

    this.billingSettings.delete(userId);
    removeWhere(this.usageEvents, (event) => event.userId === userId);
    removeWhere(this.operations, (operation) => operation.userId === userId);
    removeWhere(this.contextSnippets, (snippet) => snippet.userId === userId);
    removeWhere(this.folders, (folder) => folder.userId === userId);
    removeWhere(this.tags, (tag) => tag.userId === userId);

    const promptIds = new Set(
      this.prompts.filter((prompt) => prompt.userId === userId).map((prompt) => prompt.id),
    );

    removeWhere(this.promptTags, (promptTag) => promptIds.has(promptTag.promptId));
    removeWhere(this.promptVersions, (version) => promptIds.has(version.promptId));
    removeWhere(this.prompts, (prompt) => prompt.userId === userId);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async exportUserData(userId: string): Promise<UserDataExportPayload> {
    const user = this.users.get(userId);

    if (!user || user.deletedAt) {
      throw new Error(`User ${userId} does not exist.`);
    }

    const promptIds = new Set(
      this.prompts.filter((prompt) => prompt.userId === userId).map((prompt) => prompt.id),
    );
    const tagIds = new Set(this.tags.filter((tag) => tag.userId === userId).map((tag) => tag.id));

    return {
      billingSettings: summarizeBillingSettings(this.billingSettings.get(userId) ?? null),
      contextSnippets: this.contextSnippets
        .filter((snippet) => snippet.userId === userId)
        .map(stripUserId),
      folders: this.folders.filter((folder) => folder.userId === userId).map(stripUserId),
      operations: this.operations
        .filter((operation) => operation.userId === userId)
        .map(stripUserId),
      prompts: this.prompts.filter((prompt) => prompt.userId === userId).map(stripUserId),
      promptTags: this.promptTags.filter(
        (promptTag) => promptIds.has(promptTag.promptId) && tagIds.has(promptTag.tagId),
      ),
      promptVersions: this.promptVersions.filter((version) => promptIds.has(version.promptId)),
      sessions: Array.from(this.sessions.values())
        .filter((session) => session.userId === userId)
        .map(cloneSession),
      tags: this.tags.filter((tag) => tag.userId === userId).map(stripUserId),
      usageEvents: this.usageEvents.filter((event) => event.userId === userId).map(stripUserId),
      user: cloneUser(user),
    };
  }

  async findBillingSettings(userId: string): Promise<BillingSettingsRecord | null> {
    const settings = this.billingSettings.get(userId);

    return settings ? cloneBillingSettings(settings) : null;
  }

  async findSessionById(sessionId: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId);

    return session ? cloneSession(session) : null;
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const normalized = email.toLowerCase();

    for (const user of this.users.values()) {
      if (user.email === normalized && !user.deletedAt) {
        return cloneUser(user);
      }
    }

    return null;
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const user = this.users.get(userId);

    return user && !user.deletedAt ? cloneUser(user) : null;
  }

  async purgeExpiredDeletedData(cutoff: Date): Promise<PurgeResult> {
    const expiredPromptIds = new Set(
      this.prompts
        .filter((prompt) => prompt.deletedAt && prompt.deletedAt <= cutoff)
        .map((prompt) => prompt.id),
    );
    const contextSnippets = removeWhere(
      this.contextSnippets,
      (snippet) =>
        snippet.deletedAt !== null &&
        snippet.deletedAt !== undefined &&
        snippet.deletedAt <= cutoff,
    );
    const prompts = removeWhere(
      this.prompts,
      (prompt) =>
        prompt.deletedAt !== null && prompt.deletedAt !== undefined && prompt.deletedAt <= cutoff,
    );

    removeWhere(this.promptTags, (promptTag) => expiredPromptIds.has(promptTag.promptId));
    removeWhere(this.promptVersions, (version) => expiredPromptIds.has(version.promptId));

    let users = 0;

    for (const [userId, user] of Array.from(this.users.entries())) {
      if (user.deletedAt && user.deletedAt <= cutoff) {
        await this.deleteUserScopedData(userId);
        this.users.delete(userId);
        users += 1;
      }
    }

    return { contextSnippets, prompts, users };
  }

  async recordUsageEvent(input: UsageEventRecordInput): Promise<void> {
    this.usageEventSequence += 1;
    this.usageEvents.push({
      id: `usage-${this.usageEventSequence}`,
      userId: input.userId,
      kind: input.kind,
      quantity: input.quantity,
      createdAt: new Date(input.createdAt),
    });
  }

  async softDeleteUser(userId: string, input: SoftDeleteUserInput): Promise<AuthUser> {
    const existing = this.users.get(userId);

    if (!existing) {
      throw new Error(`User ${userId} does not exist.`);
    }

    const updated: AuthUser = {
      id: existing.id,
      email: input.scrubbedEmail,
      plan: "free",
      createdAt: new Date(existing.createdAt),
      deletedAt: new Date(input.deletedAt),
    };

    this.users.set(userId, cloneUser(updated));
    return cloneUser(updated);
  }

  async updateByoApiKey(
    userId: string,
    input: UpdateByoApiKeyInput,
  ): Promise<BillingSettingsRecord> {
    const now = new Date(input.updatedAt);
    const existing = this.billingSettings.get(userId);
    const settings: BillingSettingsRecord = {
      userId,
      byoKeyEnabled: true,
      byoKeyProvider: input.provider,
      byoKeyCiphertext: input.encryptedKey,
      byoKeyHint: input.keyHint,
      byoKeyUpdatedAt: now,
      createdAt: existing?.createdAt ? new Date(existing.createdAt) : now,
      updatedAt: now,
    };

    this.billingSettings.set(userId, cloneBillingSettings(settings));
    return cloneBillingSettings(settings);
  }

  async updateUserPlan(userId: string, plan: AuthUser["plan"]): Promise<AuthUser> {
    const existing = this.users.get(userId);

    if (!existing || existing.deletedAt) {
      throw new Error(`User ${userId} does not exist.`);
    }

    const updated = {
      ...existing,
      plan,
    };

    this.users.set(userId, cloneUser(updated));
    return cloneUser(updated);
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AuthUser> {
    const existing = this.users.get(userId);

    if (!existing) {
      throw new Error(`User ${userId} does not exist.`);
    }

    const updated: AuthUser = {
      ...existing,
      ...(input.name ? { name: input.name } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.emailVerifiedAt ? { emailVerifiedAt: new Date(input.emailVerifiedAt) } : {}),
    };

    this.users.set(userId, cloneUser(updated));
    return cloneUser(updated);
  }

  seedUser(user: AuthUser): void {
    this.users.set(user.id, cloneUser(user));
  }

  seedSession(session: SessionRecord): void {
    this.sessions.set(session.id, cloneSession(session));
  }

  seedUserData(
    userId: string,
    data: Partial<
      Pick<
        UserDataExportPayload,
        | "contextSnippets"
        | "folders"
        | "operations"
        | "prompts"
        | "promptTags"
        | "promptVersions"
        | "tags"
        | "usageEvents"
      >
    >,
  ): void {
    this.contextSnippets.push(...(data.contextSnippets ?? []).map((row) => ({ ...row, userId })));
    this.folders.push(...(data.folders ?? []).map((row) => ({ ...row, userId })));
    this.operations.push(...(data.operations ?? []).map((row) => ({ ...row, userId })));
    this.prompts.push(...(data.prompts ?? []).map((row) => ({ ...row, userId })));
    this.promptTags.push(...(data.promptTags ?? []));
    this.promptVersions.push(...(data.promptVersions ?? []));
    this.tags.push(...(data.tags ?? []).map((row) => ({ ...row, userId })));
    this.usageEvents.push(...(data.usageEvents ?? []).map((row) => ({ ...row, userId })));
  }
}

export class InMemoryUserScopedStore<TRecord extends UserScopedRecord> {
  private readonly rows = new Map<string, TRecord>();

  async findById(rowId: string): Promise<TRecord | null> {
    return this.rows.get(rowId) ?? null;
  }

  seed(row: TRecord): void {
    this.rows.set(row.id, row);
  }
}

function cloneUser(user: AuthUser): AuthUser {
  return {
    ...user,
    createdAt: new Date(user.createdAt),
    ...(user.deletedAt ? { deletedAt: new Date(user.deletedAt) } : {}),
    ...(user.emailVerifiedAt ? { emailVerifiedAt: new Date(user.emailVerifiedAt) } : {}),
  };
}

function cloneSession(session: SessionRecord): SessionRecord {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
  };
}

function cloneBillingSettings(settings: BillingSettingsRecord): BillingSettingsRecord {
  return {
    ...settings,
    createdAt: new Date(settings.createdAt),
    updatedAt: new Date(settings.updatedAt),
    byoKeyUpdatedAt: settings.byoKeyUpdatedAt ? new Date(settings.byoKeyUpdatedAt) : null,
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
    ...(settings?.byoKeyUpdatedAt ? { byoKeyUpdatedAt: new Date(settings.byoKeyUpdatedAt) } : {}),
  };
}

function stripUserId<TRow extends { userId: string }>(row: TRow): Omit<TRow, "userId"> {
  const { userId: _userId, ...rest } = row;
  return rest;
}

function removeWhere<TItem>(items: TItem[], predicate: (item: TItem) => boolean): number {
  let removed = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item && predicate(item)) {
      items.splice(index, 1);
      removed += 1;
    }
  }

  return removed;
}
