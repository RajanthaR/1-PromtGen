export type UserPlan = "free" | "pro" | "advanced";

export type OAuthProvider = "google";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  plan: UserPlan;
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
}

export interface UpdateUserProfileInput {
  name?: string;
  avatarUrl?: string;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthBillingStore {
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  createUser(input: CreateUserInput): Promise<AuthUser>;
  deleteSession(sessionId: string): Promise<boolean>;
  findSessionById(sessionId: string): Promise<SessionRecord | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
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
