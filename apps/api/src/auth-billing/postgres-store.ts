import { eq } from "drizzle-orm";

import type { PromptGenDatabase } from "@promptgen/db";
import { sessions, users } from "@promptgen/db/schema";

import type {
  AuthBillingStore,
  AuthUser,
  CreateSessionInput,
  CreateUserInput,
  SessionRecord,
  UpdateUserProfileInput,
  UserPlan,
} from "./types";

export class PostgresAuthBillingStore implements AuthBillingStore {
  constructor(private readonly db: PromptGenDatabase) {}

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
        name: input.name,
        plan: input.plan,
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create auth user.");
    }

    return mapUser(user);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id });

    return deleted.length > 0;
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
    const [user] = await this.db.select().from(users).where(eq(users.email, email));

    return user ? mapUser(user) : null;
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));

    return user ? mapUser(user) : null;
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AuthUser> {
    const [user] = await this.db
      .update(users)
      .set({
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.name ? { name: input.name } : {}),
      })
      .where(eq(users.id, userId))
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
  email: string;
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
    ...(user.name ? { name: user.name } : {}),
  };
}
