import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  AuthBillingStore,
  AuthContext,
  AuthSession,
  AuthUser,
  BillingSettingsRecord,
  BillingSettingsSummary,
  ByoKeyProvider,
  CurrentPlan,
  EnhancementBillingAuthorization,
  EmailLoginInput,
  GoogleOAuthLoginInput,
  PlanPolicy,
  QuotaUsageStatus,
  UserScopedRecord,
  UserDataExport,
  UserPlan,
} from "./types";

export type AuthBillingErrorCode =
  | "byo_key_not_allowed"
  | "configuration_error"
  | "email_verification_required"
  | "invalid_input"
  | "not_found"
  | "quota_exceeded"
  | "unauthenticated";

export class AuthBillingError extends Error {
  constructor(
    public readonly code: AuthBillingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthBillingError";
  }
}

export interface AuthBillingServiceOptions {
  byoKeyCipher?: ByoKeyCipher;
  clock?: () => Date;
  sessionIdGenerator?: () => string;
  sessionTtlSeconds?: number;
}

export interface ByoKeyCipher {
  decrypt(ciphertext: string): string;
  encrypt(plaintext: string): string;
}

export interface SaveByoApiKeyInput {
  apiKey: string;
  provider: ByoKeyProvider;
}

export interface ReadBillingSettingsResult {
  billingSettings: BillingSettingsSummary;
  emailVerified: boolean;
  plan: UserPlan;
  planPolicy: PlanPolicy;
  quota: QuotaUsageStatus;
  userId: string;
}

export interface AccountDeletionResult {
  deletedAt: Date;
  purgeAfter: Date;
  userId: string;
}

export const launchPlanPolicies: Record<UserPlan, PlanPolicy> = {
  free: {
    byoKeyAllowed: false,
    emailVerificationRequired: true,
    historyRetentionLimit: 50,
    quota: {
      eventKind: "prompt_enhancement",
      limit: 10,
      period: "day",
    },
  },
  pro: {
    byoKeyAllowed: true,
    emailVerificationRequired: false,
    historyRetentionLimit: 500,
    quota: {
      eventKind: "prompt_enhancement",
      limit: 500,
      period: "month",
    },
  },
  advanced: {
    byoKeyAllowed: true,
    emailVerificationRequired: false,
    historyRetentionLimit: null,
    quota: {
      eventKind: "prompt_enhancement",
      limit: null,
      period: "month",
    },
  },
};

const defaultSessionTtlSeconds = 60 * 60 * 24 * 30;
const defaultDeletionGraceDays = 30;

export function createAuthBillingService(
  store: AuthBillingStore,
  options: AuthBillingServiceOptions = {},
) {
  const byoKeyCipher = options.byoKeyCipher;
  const clock = options.clock ?? (() => new Date());
  const sessionIdGenerator = options.sessionIdGenerator ?? randomUUID;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? defaultSessionTtlSeconds;

  async function loginWithEmail(input: EmailLoginInput): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const user = await findOrCreateUser(email, {
      emailVerifiedAt: clock(),
      ...(input.name ? { name: input.name } : {}),
    });

    return createSessionForUser(user);
  }

  async function loginWithGoogle(input: GoogleOAuthLoginInput): Promise<AuthSession> {
    if (input.provider !== "google") {
      throw new AuthBillingError("invalid_input", "Only Google OAuth is supported in Phase 1.");
    }

    if (!input.providerUserId.trim()) {
      throw new AuthBillingError("invalid_input", "Google OAuth subject is required.");
    }

    if (!input.emailVerified) {
      throw new AuthBillingError("invalid_input", "Google OAuth email must be verified.");
    }

    const email = normalizeEmail(input.email);
    const user = await findOrCreateUser(email, {
      emailVerifiedAt: clock(),
      ...(input.name ? { name: input.name } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    });

    return createSessionForUser(user);
  }

  async function validateSession(sessionId: string): Promise<AuthSession | null> {
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      return null;
    }

    const session = await store.findSessionById(normalizedSessionId);

    if (!session) {
      return null;
    }

    if (session.expiresAt <= clock()) {
      return null;
    }

    const user = await store.findUserById(session.userId);

    if (!user) {
      return null;
    }

    return {
      createdAt: session.createdAt,
      id: session.id,
      expiresAt: session.expiresAt,
      user,
    };
  }

  async function requireAuth(sessionId: string): Promise<AuthContext> {
    const authSession = await validateSession(sessionId);

    if (!authSession) {
      throw new AuthBillingError("unauthenticated", "A valid session is required.");
    }

    return {
      session: {
        id: authSession.id,
        userId: authSession.user.id,
        expiresAt: authSession.expiresAt,
        createdAt: authSession.createdAt,
      },
      user: authSession.user,
    };
  }

  async function logout(sessionId: string): Promise<boolean> {
    return store.deleteSession(normalizeSessionId(sessionId));
  }

  async function readCurrentPlan(sessionId: string): Promise<CurrentPlan> {
    const { user } = await requireAuth(sessionId);

    return {
      plan: user.plan,
      userId: user.id,
    };
  }

  async function readBillingSettings(sessionId: string): Promise<ReadBillingSettingsResult> {
    const { user } = await requireAuth(sessionId);
    const billingSettings = await store.findBillingSettings(user.id);

    return {
      billingSettings: toBillingSettingsSummary(billingSettings),
      emailVerified: Boolean(user.emailVerifiedAt),
      plan: user.plan,
      planPolicy: getPlanPolicy(user.plan),
      quota: await readQuotaStatusForUser(user),
      userId: user.id,
    };
  }

  async function authorizeEnhancement(
    sessionId: string,
    input: { preferByoKey?: boolean } = {},
  ): Promise<EnhancementBillingAuthorization> {
    const { user } = await requireAuth(sessionId);
    const policy = getPlanPolicy(user.plan);

    assertEmailVerificationSatisfied(user, policy);

    const billingSettings = await store.findBillingSettings(user.id);
    const byoKeyCiphertext = billingSettings?.byoKeyCiphertext ?? null;
    const byoKeyProvider = billingSettings?.byoKeyProvider ?? null;
    const shouldUseByoKey =
      input.preferByoKey !== false &&
      policy.byoKeyAllowed &&
      billingSettings?.byoKeyEnabled === true &&
      byoKeyProvider !== null &&
      byoKeyCiphertext !== null;

    if (shouldUseByoKey) {
      return {
        credential: {
          source: "byo_key",
          provider: byoKeyProvider,
          apiKey: decryptByoApiKey(byoKeyCiphertext),
          ...(billingSettings.byoKeyHint ? { keyHint: billingSettings.byoKeyHint } : {}),
        },
        plan: user.plan,
        quota: await readQuotaStatusForUser(user),
        userId: user.id,
      };
    }

    return {
      credential: {
        source: "platform",
      },
      plan: user.plan,
      quota: await consumeEnhancementQuotaForUser(user),
      userId: user.id,
    };
  }

  async function saveByoApiKey(
    sessionId: string,
    input: SaveByoApiKeyInput,
  ): Promise<BillingSettingsSummary> {
    const { user } = await requireAuth(sessionId);
    const policy = getPlanPolicy(user.plan);

    if (!policy.byoKeyAllowed) {
      throw new AuthBillingError(
        "byo_key_not_allowed",
        "BYO provider keys are only available on paid plans.",
      );
    }

    const provider = normalizeByoKeyProvider(input.provider);
    const apiKey = normalizeSecret(input.apiKey);
    const settings = await store.updateByoApiKey(user.id, {
      encryptedKey: encryptByoApiKey(apiKey),
      keyHint: apiKey.slice(-4),
      provider,
      updatedAt: clock(),
    });

    return toBillingSettingsSummary(settings);
  }

  async function revokeByoApiKey(sessionId: string): Promise<BillingSettingsSummary> {
    const { user } = await requireAuth(sessionId);
    const settings = await store.clearByoApiKey(user.id, clock());

    return toBillingSettingsSummary(settings);
  }

  async function exportUserData(sessionId: string): Promise<UserDataExport> {
    const { user } = await requireAuth(sessionId);

    return {
      exportedAt: clock(),
      planPolicy: getPlanPolicy(user.plan),
      payload: await store.exportUserData(user.id),
    };
  }

  async function requestAccountDeletion(sessionId: string): Promise<AccountDeletionResult> {
    const { user } = await requireAuth(sessionId);
    const deletedAt = clock();

    await store.deleteUserScopedData(user.id);
    await store.softDeleteUser(user.id, {
      deletedAt,
      scrubbedEmail: createScrubbedDeletedEmail(user.id),
    });

    return {
      deletedAt,
      purgeAfter: addDays(deletedAt, defaultDeletionGraceDays),
      userId: user.id,
    };
  }

  async function purgeExpiredSoftDeletedData() {
    return store.purgeExpiredDeletedData(addDays(clock(), -defaultDeletionGraceDays));
  }

  async function readUserScopedRow<TRecord extends UserScopedRecord>(
    sessionId: string,
    rowId: string,
    loadRow: (rowId: string) => Promise<TRecord | null>,
  ): Promise<TRecord> {
    const { user } = await requireAuth(sessionId);
    const row = await loadRow(rowId);

    return assertUserOwnsRecord(user.id, row);
  }

  async function findOrCreateUser(
    email: string,
    profile: {
      emailVerifiedAt?: Date;
      name?: string;
      avatarUrl?: string;
    },
  ): Promise<AuthUser> {
    const existing = await store.findUserByEmail(email);

    if (existing) {
      if (profile.name || profile.avatarUrl || profile.emailVerifiedAt) {
        return store.updateUserProfile(existing.id, profile);
      }

      return existing;
    }

    return store.createUser({
      email,
      plan: "free",
      ...profile,
    });
  }

  async function createSessionForUser(user: AuthUser): Promise<AuthSession> {
    const createdAt = clock();
    const expiresAt = new Date(createdAt.getTime() + sessionTtlSeconds * 1000);
    const session = await store.createSession({
      id: sessionIdGenerator(),
      userId: user.id,
      createdAt,
      expiresAt,
    });

    return {
      createdAt: session.createdAt,
      id: session.id,
      expiresAt: session.expiresAt,
      user,
    };
  }

  async function readQuotaStatusForUser(user: AuthUser): Promise<QuotaUsageStatus> {
    const policy = getPlanPolicy(user.plan);
    const window = getQuotaWindow(clock(), policy.quota.period);
    const used = await store.countUsageEvents(
      user.id,
      policy.quota.eventKind,
      window.start,
      window.end,
    );

    return buildQuotaStatus(policy, used, window.start, window.end);
  }

  async function consumeEnhancementQuotaForUser(user: AuthUser): Promise<QuotaUsageStatus> {
    const policy = getPlanPolicy(user.plan);
    const now = clock();
    const window = getQuotaWindow(now, policy.quota.period);
    const used = await store.countUsageEvents(
      user.id,
      policy.quota.eventKind,
      window.start,
      window.end,
    );

    if (policy.quota.limit !== null && used >= policy.quota.limit) {
      throw new AuthBillingError(
        "quota_exceeded",
        "Plan quota reached for the current billing period.",
      );
    }

    await store.recordUsageEvent({
      createdAt: now,
      kind: policy.quota.eventKind,
      quantity: 1,
      userId: user.id,
    });

    return buildQuotaStatus(policy, used + 1, window.start, window.end);
  }

  function encryptByoApiKey(apiKey: string): string {
    if (!byoKeyCipher) {
      throw new AuthBillingError(
        "configuration_error",
        "BYO provider key encryption is not configured.",
      );
    }

    return byoKeyCipher.encrypt(apiKey);
  }

  function decryptByoApiKey(ciphertext: string): string {
    if (!byoKeyCipher) {
      throw new AuthBillingError(
        "configuration_error",
        "BYO provider key encryption is not configured.",
      );
    }

    try {
      return byoKeyCipher.decrypt(ciphertext);
    } catch (error) {
      if (error instanceof AuthBillingError) {
        throw error;
      }

      throw new AuthBillingError("configuration_error", "BYO provider key storage is invalid.");
    }
  }

  return {
    loginWithEmail,
    loginWithGoogle,
    logout,
    authorizeEnhancement,
    exportUserData,
    purgeExpiredSoftDeletedData,
    readCurrentPlan,
    readBillingSettings,
    readUserScopedRow,
    requireAuth,
    requestAccountDeletion,
    revokeByoApiKey,
    saveByoApiKey,
    validateSession,
  };
}

export function assertUserOwnsRecord<TRecord extends UserScopedRecord>(
  userId: string,
  row: TRecord | null,
): TRecord {
  if (!row || row.userId !== userId || row.deletedAt) {
    throw new AuthBillingError("not_found", "Resource was not found for the current user.");
  }

  return row;
}

export function getPlanPolicy(plan: UserPlan): PlanPolicy {
  return launchPlanPolicies[plan];
}

export function createAesGcmByoKeyCipher(secret: string | Buffer): ByoKeyCipher {
  const key = normalizeCipherKey(secret);

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();

      return [
        "v1",
        iv.toString("base64url"),
        tag.toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(":");
    },
    decrypt(ciphertext) {
      const [version, encodedIv, encodedTag, encodedCiphertext] = ciphertext.split(":");

      if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
        throw new AuthBillingError("configuration_error", "BYO provider key storage is invalid.");
      }

      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

function assertEmailVerificationSatisfied(user: AuthUser, policy: PlanPolicy): void {
  if (policy.emailVerificationRequired && !user.emailVerifiedAt) {
    throw new AuthBillingError(
      "email_verification_required",
      "Free-tier usage requires a verified email address.",
    );
  }
}

function toBillingSettingsSummary(settings: BillingSettingsRecord | null): BillingSettingsSummary {
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

function buildQuotaStatus(
  policy: PlanPolicy,
  used: number,
  windowStart: Date,
  windowEnd: Date,
): QuotaUsageStatus {
  return {
    eventKind: policy.quota.eventKind,
    limit: policy.quota.limit,
    period: policy.quota.period,
    remaining: policy.quota.limit === null ? null : Math.max(0, policy.quota.limit - used),
    used,
    windowEnd,
    windowStart,
  };
}

function getQuotaWindow(
  now: Date,
  period: PlanPolicy["quota"]["period"],
): {
  start: Date;
  end: Date;
} {
  if (period === "day") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return {
      start,
      end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1)),
    };
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    start,
    end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
  };
}

function normalizeByoKeyProvider(provider: ByoKeyProvider): ByoKeyProvider {
  if (provider !== "gemini" && provider !== "openai") {
    throw new AuthBillingError("invalid_input", "BYO provider is not supported.");
  }

  return provider;
}

function normalizeSecret(secret: string): string {
  const normalized = secret.trim();

  if (!normalized) {
    throw new AuthBillingError("invalid_input", "BYO provider API key is required.");
  }

  return normalized;
}

function normalizeCipherKey(secret: string | Buffer): Buffer {
  const source = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, "utf8");

  if (source.length === 32) {
    return source;
  }

  return createHash("sha256").update(source).digest();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function createScrubbedDeletedEmail(userId: string): string {
  return `deleted+${userId}@deleted.promptgen.local`;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (!normalized || !normalized.includes("@")) {
    throw new AuthBillingError("invalid_input", "A valid email address is required.");
  }

  return normalized;
}

function normalizeSessionId(sessionId: string): string {
  const normalized = sessionId.trim();

  if (!normalized) {
    throw new AuthBillingError("unauthenticated", "A valid session is required.");
  }

  return normalized;
}
