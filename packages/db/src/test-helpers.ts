import { eq } from "drizzle-orm";

import type { PromptGenDatabase } from "./client";
import { contextSnippets, promptVersions, prompts, templates, users } from "./schema";

export async function createTestUser(
  db: PromptGenDatabase,
  input: { email?: string; name?: string } = {},
): Promise<{ id: string; email: string }> {
  const email = input.email ?? `user-${crypto.randomUUID()}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, name: input.name ?? "Test User" })
    .returning({ email: users.email, id: users.id });

  if (!user) {
    throw new Error("Failed to create test user.");
  }

  return user;
}

export async function createPromptFixture(
  db: PromptGenDatabase,
  input: { userId: string; title: string; body: string },
): Promise<{ promptId: string; versionId: string }> {
  const [prompt] = await db
    .insert(prompts)
    .values({ title: input.title, userId: input.userId })
    .returning({ id: prompts.id });

  if (!prompt) {
    throw new Error("Failed to create test prompt.");
  }

  const [version] = await db
    .insert(promptVersions)
    .values({ body: input.body, promptId: prompt.id, sections: {} })
    .returning({ id: promptVersions.id });

  if (!version) {
    throw new Error("Failed to create test prompt version.");
  }

  await db.update(prompts).set({ currentVersionId: version.id }).where(eq(prompts.id, prompt.id));

  return { promptId: prompt.id, versionId: version.id };
}

export async function createContextSnippetFixture(
  db: PromptGenDatabase,
  input: { userId: string; title: string; body: string; kind?: string },
): Promise<string> {
  const [snippet] = await db
    .insert(contextSnippets)
    .values({
      body: input.body,
      kind: input.kind ?? "brand_voice",
      title: input.title,
      userId: input.userId,
    })
    .returning({ id: contextSnippets.id });

  if (!snippet) {
    throw new Error("Failed to create test context snippet.");
  }

  return snippet.id;
}

export async function createTemplateFixture(
  db: PromptGenDatabase,
  input: { title: string; body: string; category?: string; description?: string; tags?: string[] },
): Promise<string> {
  const [template] = await db
    .insert(templates)
    .values({
      body: input.body,
      category: input.category ?? "marketing",
      compatibleTools: ["chatgpt"],
      description: input.description ?? input.body,
      difficulty: "beginner",
      tags: input.tags ?? [],
      title: input.title,
      variables: [],
    })
    .returning({ id: templates.id });

  if (!template) {
    throw new Error("Failed to create test template.");
  }

  return template.id;
}
