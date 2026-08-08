import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PromptGenDatabase } from "./client";
import { templates } from "./schema";

interface CatalogVariable {
  defaultValue?: string;
  label: string;
  name: string;
  required: boolean;
}

interface CatalogTemplate {
  body: string;
  category: string;
  compatibleTools: string[];
  description: string;
  difficulty: string;
  id: string;
  tags: string[];
  title: string;
  variables: CatalogVariable[];
}

function loadLaunchCatalog(): CatalogTemplate[] {
  const catalogPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../library-templates/content/launch-catalog.json",
  );
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogTemplate[];

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Launch catalog at ${catalogPath} is empty or invalid.`);
  }

  return raw;
}

/** 100 original launch templates from the shared catalog file. */
export const starterTemplates = loadLaunchCatalog().map((template) => ({
  body: template.body,
  category: template.category,
  compatibleTools: template.compatibleTools,
  description: template.description,
  difficulty: template.difficulty,
  isPublic: true as const,
  tags: template.tags,
  title: template.title,
  // Stable public id lives in tags for now; DB primary key remains UUID.
  // Title+category uniqueness is not enforced; full slug wiring is remaining work.
  variables: template.variables,
}));

export async function seedStarterTemplates(db: PromptGenDatabase): Promise<void> {
  // Insert in batches to avoid oversized parameter lists on some drivers.
  const batchSize = 25;

  for (let index = 0; index < starterTemplates.length; index += batchSize) {
    const batch = starterTemplates.slice(index, index + batchSize);
    await db.insert(templates).values(batch).onConflictDoNothing();
  }
}
