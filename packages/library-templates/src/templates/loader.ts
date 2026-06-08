import type { PublicTemplate } from "./schema";
import { validateTemplateContent } from "./schema";

export class TemplateLoaderError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Template content is invalid: ${errors.join("; ")}`);
    this.name = "TemplateLoaderError";
  }
}

export interface TemplateSeedStore {
  upsertTemplates(templates: PublicTemplate[]): Promise<void>;
}

export function loadTemplatesFromContent(content: unknown): PublicTemplate[] {
  const validation = validateTemplateContent(content);

  if (!validation.valid) {
    throw new TemplateLoaderError(validation.errors);
  }

  return validation.templates;
}

export async function seedTemplateCatalog(
  store: TemplateSeedStore,
  content: unknown,
): Promise<{ seeded: number }> {
  const templates = loadTemplatesFromContent(content);

  await store.upsertTemplates(templates);

  return { seeded: templates.length };
}
