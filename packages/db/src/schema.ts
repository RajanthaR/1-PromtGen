import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro", "advanced"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("folders_user_id_name_unique").on(table.userId, table.name)],
);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    currentVersionId: uuid("current_version_id"),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    pinned: boolean("pinned").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prompts_user_id_deleted_at_idx").on(table.userId, table.deletedAt),
    index("prompts_fts_idx").using("gin", sql`to_tsvector('english', ${table.title})`),
  ],
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sections: jsonb("sections").notNull().default({}),
    changeNote: text("change_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prompt_versions_prompt_id_created_at_idx").on(table.promptId, table.createdAt),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tags_user_id_name_unique").on(table.userId, table.name),
    index("tags_user_id_idx").on(table.userId),
  ],
);

export const promptTags = pgTable(
  "prompt_tags",
  {
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.promptId, table.tagId] })],
);

export const contextSnippets = pgTable(
  "context_snippets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("context_snippets_user_id_deleted_at_idx").on(table.userId, table.deletedAt),
    index("context_snippets_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.title} || ' ' || ${table.body})`,
    ),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    body: text("body").notNull(),
    variables: jsonb("variables").notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    compatibleTools: text("compatible_tools").array().notNull().default([]),
    difficulty: text("difficulty").notNull(),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("templates_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.title} || ' ' || ${table.description} || ' ' || ${table.body})`,
    ),
  ],
);

export const operations = pgTable(
  "operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawPrompt: text("raw_prompt").notNull(),
    enhancedPrompt: text("enhanced_prompt"),
    mode: text("mode").notNull(),
    targetModel: text("target_model").notNull(),
    promptType: text("prompt_type").notNull(),
    structureScoreBefore: integer("structure_score_before"),
    structureScoreAfter: integer("structure_score_after"),
    tokens: integer("tokens"),
    provider: text("provider"),
    model: text("model"),
    latencyMs: integer("latency_ms"),
    saved: boolean("saved").notNull().default(false),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("operations_user_id_created_at_idx").on(table.userId, table.createdAt)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("usage_events_user_id_created_at_idx").on(table.userId, table.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  contextSnippets: many(contextSnippets),
  folders: many(folders),
  operations: many(operations),
  prompts: many(prompts),
  sessions: many(sessions),
  tags: many(tags),
  usageEvents: many(usageEvents),
}));

export const promptsRelations = relations(prompts, ({ many, one }) => ({
  folder: one(folders, {
    fields: [prompts.folderId],
    references: [folders.id],
  }),
  user: one(users, {
    fields: [prompts.userId],
    references: [users.id],
  }),
  versions: many(promptVersions),
  currentVersion: one(promptVersions, {
    fields: [prompts.currentVersionId],
    references: [promptVersions.id],
  }),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one }) => ({
  prompt: one(prompts, {
    fields: [promptVersions.promptId],
    references: [prompts.id],
  }),
}));
