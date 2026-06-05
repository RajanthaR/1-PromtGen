import { randomUUID } from "node:crypto";

import type {
  AuthBillingStore,
  AuthContext,
  AuthSession,
  AuthUser,
  CurrentPlan,
  EmailLoginInput,
  GoogleOAuthLoginInput,
  UserScopedRecord,
} from "./types";

export type AuthBillingErrorCode = "invalid_input" | "unauthenticated" | "not_found";

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
  clock?: () => Date;
  sessionIdGenerator?: () => string;
  sessionTtlSeconds?: number;
}

const defaultSessionTtlSeconds = 60 * 60 * 24 * 30;

export function createAuthBillingService(
  store: AuthBillingStore,
  options: AuthBillingServiceOptions = {},
) {
  const clock = options.clock ?? (() => new Date());
  const sessionIdGenerator = options.sessionIdGenerator ?? randomUUID;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? defaultSessionTtlSeconds;

  async function loginWithEmail(input: EmailLoginInput): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const user = await findOrCreateUser(email, {
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
      name?: string;
      avatarUrl?: string;
    },
  ): Promise<AuthUser> {
    const existing = await store.findUserByEmail(email);

    if (existing) {
      if (profile.name || profile.avatarUrl) {
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

  return {
    loginWithEmail,
    loginWithGoogle,
    logout,
    readCurrentPlan,
    readUserScopedRow,
    requireAuth,
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
