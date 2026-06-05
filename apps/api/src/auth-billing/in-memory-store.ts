import type {
  AuthBillingStore,
  AuthUser,
  CreateSessionInput,
  CreateUserInput,
  SessionRecord,
  UpdateUserProfileInput,
  UserScopedRecord,
} from "./types";

export class InMemoryAuthBillingStore implements AuthBillingStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly users = new Map<string, AuthUser>();
  private userSequence = 0;

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session = { ...input };
    this.sessions.set(session.id, session);
    return session;
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
    };

    this.users.set(user.id, user);
    return user;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async findSessionById(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const normalized = email.toLowerCase();

    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return user;
      }
    }

    return null;
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    return this.users.get(userId) ?? null;
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
    };

    this.users.set(userId, updated);
    return updated;
  }

  seedUser(user: AuthUser): void {
    this.users.set(user.id, user);
  }

  seedSession(session: SessionRecord): void {
    this.sessions.set(session.id, session);
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
