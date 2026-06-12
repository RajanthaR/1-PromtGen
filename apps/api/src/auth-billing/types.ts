export type UserPlan = "free" | "pro" | "advanced";

export type OAuthProvider = "google";
export type ByoKeyProvider = "gemini" | "openai";
export type QuotaEventKind = "prompt_enhancement";
export type QuotaPeriod = "day" | "month";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  plan: UserPlan;
  emailVerifiedAt?: Date;
  deletedAt?: Date | null;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface UserScopedRecord {
  id: string;
  userId: string;
  deletedAt?: Date | null;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  avatarUrl?: string;
  plan: UserPlan;
  emailVerifiedAt?: Date;
}

export interface UpdateUserProfileInput {
  name?: string;
  avatarUrl?: string;
  emailVerifiedAt?: Date;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthBillingStore {
  countUsageEvents(userId: string, kind: QuotaEventKind, since: Date, until: Date): Promise<number>;
  clearByoApiKey(userId: string, updatedAt: Date): Promise<BillingSettingsRecord>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  createUser(input: CreateUserInput): Promise<AuthUser>;
  deleteUserScopedData(userId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<boolean>;
  exportUserData(userId: string): Promise<UserDataExportPayload>;
  findBillingSettings(userId: string): Promise<BillingSettingsRecord | null>;
  findSessionById(sessionId: string): Promise<SessionRecord | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
  purgeExpiredDeletedData(cutoff: Date): Promise<PurgeResult>;
  recordUsageEvent(input: UsageEventRecordInput): Promise<void>;
  softDeleteUser(userId: string, input: SoftDeleteUserInput): Promise<AuthUser>;
  updateByoApiKey(userId: string, input: UpdateByoApiKeyInput): Promise<BillingSettingsRecord>;
  updateUserPlan(userId: string, plan: UserPlan): Promise<AuthUser>;
  updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AuthUser>;
}

export interface AuthSession {
  createdAt: Date;
  id: string;
  expiresAt: Date;
  user: AuthUser;
}

export interface AuthContext {
  session: SessionRecord;
  user: AuthUser;
}

export interface EmailLoginInput {
  /**
   * Caller must only invoke this after proving mailbox ownership, for example
   * from a magic-link verifier or trusted auth provider callback.
   */
  email: string;
  name?: string;
}

export interface GoogleOAuthLoginInput {
  provider: "google";
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}

export interface CurrentPlan {
  plan: UserPlan;
  userId: string;
}

export interface PlanPolicy {
  byoKeyAllowed: boolean;
  emailVerificationRequired: boolean;
  historyRetentionLimit: number | null;
  quota: {
    eventKind: QuotaEventKind;
    limit: number | null;
    period: QuotaPeriod;
  };
}

export interface BillingSettingsRecord {
  userId: string;
  byoKeyEnabled: boolean;
  byoKeyProvider: ByoKeyProvider | null;
  byoKeyCiphertext: string | null;
  byoKeyHint: string | null;
  byoKeyUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingSettingsSummary {
  byoKeyConfigured: boolean;
  byoKeyEnabled: boolean;
  byoKeyProvider?: ByoKeyProvider;
  byoKeyHint?: string;
  byoKeyUpdatedAt?: Date;
}

export interface QuotaUsageStatus {
  eventKind: QuotaEventKind;
  limit: number | null;
  period: QuotaPeriod;
  remaining: number | null;
  used: number;
  windowEnd: Date;
  windowStart: Date;
}

export type ProviderCredential =
  | {
      source: "platform";
    }
  | {
      source: "byo_key";
      provider: ByoKeyProvider;
      apiKey: string;
      keyHint?: string;
    };

export interface EnhancementBillingAuthorization {
  credential: ProviderCredential;
  plan: UserPlan;
  quota: QuotaUsageStatus;
  userId: string;
}

export interface UsageEventRecordInput {
  userId: string;
  kind: QuotaEventKind;
  quantity: number;
  createdAt: Date;
}

export interface UpdateByoApiKeyInput {
  provider: ByoKeyProvider;
  encryptedKey: string;
  keyHint: string;
  updatedAt: Date;
}

export interface SoftDeleteUserInput {
  deletedAt: Date;
  scrubbedEmail: string;
}

export interface PurgeResult {
  contextSnippets: number;
  prompts: number;
  users: number;
}

export interface UserDataExportPayload {
  billingSettings: BillingSettingsSummary;
  contextSnippets: Array<{
    id: string;
    title: string;
    body: string;
    kind: string;
    deletedAt?: Date | null;
    createdAt: Date;
  }>;
  folders: Array<{
    id: string;
    name: string;
    createdAt: Date;
  }>;
  operations: Array<{
    id: string;
    rawPrompt: string;
    enhancedPrompt?: string | null;
    mode: string;
    targetModel: string;
    promptType: string;
    structureScoreBefore?: number | null;
    structureScoreAfter?: number | null;
    tokens?: number | null;
    provider?: string | null;
    model?: string | null;
    latencyMs?: number | null;
    saved: boolean;
    feedback?: string | null;
    createdAt: Date;
  }>;
  promptTags: Array<{
    promptId: string;
    tagId: string;
  }>;
  promptVersions: Array<{
    id: string;
    promptId: string;
    body: string;
    sections: unknown;
    changeNote?: string | null;
    createdAt: Date;
  }>;
  prompts: Array<{
    id: string;
    title: string;
    currentVersionId?: string | null;
    folderId?: string | null;
    pinned: boolean;
    deletedAt?: Date | null;
    createdAt: Date;
  }>;
  sessions: SessionRecord[];
  tags: Array<{
    id: string;
    name: string;
    createdAt: Date;
  }>;
  usageEvents: Array<{
    id: string;
    kind: string;
    quantity: number;
    createdAt: Date;
  }>;
  user: AuthUser;
}

export interface UserDataExport {
  exportedAt: Date;
  planPolicy: PlanPolicy;
  payload: UserDataExportPayload;
}
