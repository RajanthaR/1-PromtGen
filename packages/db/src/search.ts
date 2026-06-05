import { sql, type InferSelectModel } from "drizzle-orm";

import type { PromptGenDatabase } from "./client";
import { contextSnippets, prompts, templates } from "./schema";

export type PromptSearchResult = Pick<InferSelectModel<typeof prompts>, "id" | "title">;
export type TemplateSearchResult = Pick<
  InferSelectModel<typeof templates>,
  "id" | "title" | "category"
>;
export type ContextSnippetSearchResult = Pick<
  InferSelectModel<typeof contextSnippets>,
  "id" | "title" | "kind"
>;

export async function searchPrompts(
  db: PromptGenDatabase,
  input: { userId: string; query: string; limit?: number },
): Promise<PromptSearchResult[]> {
  const limit = input.limit ?? 20;

  return db
    .select({ id: prompts.id, title: prompts.title })
    .from(prompts)
    .where(
      sql`${prompts.userId} = ${input.userId}
        AND ${prompts.deletedAt} IS NULL
        AND to_tsvector('english', ${prompts.title}) @@ websearch_to_tsquery('english', ${input.query})`,
    )
    .orderBy(
      sql`ts_rank(
        to_tsvector('english', ${prompts.title}),
        websearch_to_tsquery('english', ${input.query})
      ) DESC`,
    )
    .limit(limit);
}

export async function searchTemplates(
  db: PromptGenDatabase,
  input: { query: string; limit?: number },
): Promise<TemplateSearchResult[]> {
  const limit = input.limit ?? 20;

  return db
    .select({ category: templates.category, id: templates.id, title: templates.title })
    .from(templates)
    .where(
      sql`${templates.isPublic} = true
        AND to_tsvector(
          'english',
          ${templates.title} || ' ' || ${templates.description} || ' ' || ${templates.body}
        ) @@ websearch_to_tsquery('english', ${input.query})`,
    )
    .orderBy(
      sql`ts_rank(
        to_tsvector(
          'english',
          ${templates.title} || ' ' || ${templates.description} || ' ' || ${templates.body}
        ),
        websearch_to_tsquery('english', ${input.query})
      ) DESC`,
    )
    .limit(limit);
}

export async function searchContextSnippets(
  db: PromptGenDatabase,
  input: { userId: string; query: string; limit?: number },
): Promise<ContextSnippetSearchResult[]> {
  const limit = input.limit ?? 20;

  return db
    .select({ id: contextSnippets.id, kind: contextSnippets.kind, title: contextSnippets.title })
    .from(contextSnippets)
    .where(
      sql`${contextSnippets.userId} = ${input.userId}
        AND ${contextSnippets.deletedAt} IS NULL
        AND to_tsvector('english', ${contextSnippets.title} || ' ' || ${contextSnippets.body}) @@ websearch_to_tsquery('english', ${input.query})`,
    )
    .orderBy(
      sql`ts_rank(
        to_tsvector('english', ${contextSnippets.title} || ' ' || ${contextSnippets.body}),
        websearch_to_tsquery('english', ${input.query})
      ) DESC`,
    )
    .limit(limit);
}
