export const templateDifficulties = ["beginner", "intermediate", "advanced"] as const;

export type TemplateDifficulty = (typeof templateDifficulties)[number];

export interface TemplateVariable {
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string;
}

export interface PublicTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  body: string;
  variables: TemplateVariable[];
  tags: string[];
  compatibleTools: string[];
  difficulty: TemplateDifficulty;
  isPublic: true;
}

export interface TemplateSearchQuery {
  keyword?: string;
  tag?: string;
  tags?: string[];
  tool?: string;
  difficulty?: TemplateDifficulty;
  recentlyUsedByUserId?: string;
  limit?: number;
}

export interface TemplateUsageRecord {
  templateId: string;
  userId: string;
  usedAt: Date;
}

export type TemplateContentValidationResult =
  | {
      valid: true;
      templates: PublicTemplate[];
    }
  | {
      valid: false;
      errors: string[];
    };

const variableReferencePattern = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const variableNamePattern = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isTemplateDifficulty(value: unknown): value is TemplateDifficulty {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

export function validateTemplateContent(value: unknown): TemplateContentValidationResult {
  if (!Array.isArray(value)) {
    return { valid: false, errors: ["Template content must be an array."] };
  }

  const errors: string[] = [];
  const templates: PublicTemplate[] = [];
  const seenIds = new Set<string>();

  value.forEach((candidate, index) => {
    const result = readTemplate(candidate, index);

    if (!result.valid) {
      errors.push(...result.errors);
      return;
    }

    if (seenIds.has(result.template.id)) {
      errors.push(`Template ${index} id '${result.template.id}' is duplicated.`);
      return;
    }

    seenIds.add(result.template.id);
    templates.push(result.template);
  });

  return errors.length > 0 ? { valid: false, errors } : { valid: true, templates };
}

export function extractTemplateVariableNames(body: string): string[] {
  const names = new Set<string>();

  for (const match of body.matchAll(variableReferencePattern)) {
    const name = match[1];

    if (name) {
      names.add(name);
    }
  }

  return Array.from(names);
}

function readTemplate(
  value: unknown,
  index: number,
): { valid: true; template: PublicTemplate } | { valid: false; errors: string[] } {
  const prefix = `Template ${index}`;

  if (!isRecord(value)) {
    return { valid: false, errors: [`${prefix} must be an object.`] };
  }

  const errors: string[] = [];
  const id = readRequiredString(value.id, `${prefix} id`, errors);
  const title = readRequiredString(value.title, `${prefix} title`, errors);
  const category = readRequiredString(value.category, `${prefix} category`, errors);
  const description = readRequiredString(value.description, `${prefix} description`, errors);
  const body = readRequiredString(value.body, `${prefix} body`, errors);
  const rawCompatibleTools = value.compatibleTools ?? value.compatible_tools;
  const rawIsPublic = value.isPublic ?? value.is_public ?? true;
  const difficulty = isTemplateDifficulty(value.difficulty) ? value.difficulty : null;
  const variables = readVariables(value.variables, `${prefix} variables`, errors);
  const tags = readStringArray(value.tags, `${prefix} tags`, errors);
  const compatibleTools = readStringArray(rawCompatibleTools, `${prefix} compatibleTools`, errors);

  if (!difficulty) {
    errors.push(`${prefix} difficulty must be beginner, intermediate, or advanced.`);
  }

  if (rawIsPublic !== true) {
    errors.push(`${prefix} isPublic must be true for launch public templates.`);
  }

  const declaredVariables = new Set(variables.map((variable) => variable.name));

  for (const referencedVariable of extractTemplateVariableNames(body)) {
    if (!declaredVariables.has(referencedVariable)) {
      errors.push(`${prefix} body references undeclared variable '${referencedVariable}'.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    template: {
      body,
      category,
      compatibleTools,
      description,
      difficulty: difficulty as TemplateDifficulty,
      id,
      isPublic: true,
      tags,
      title,
      variables,
    },
  };
}

function readVariables(value: unknown, label: string, errors: string[]): TemplateVariable[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return [];
  }

  const variables: TemplateVariable[] = [];
  const seenNames = new Set<string>();

  value.forEach((candidate, index) => {
    const variableLabel = `${label}[${index}]`;

    if (!isRecord(candidate)) {
      errors.push(`${variableLabel} must be an object.`);
      return;
    }

    const name = readRequiredString(candidate.name, `${variableLabel} name`, errors);
    const displayLabel = readRequiredString(candidate.label, `${variableLabel} label`, errors);

    if (!variableNamePattern.test(name)) {
      errors.push(`${variableLabel} name must be alphanumeric with no spaces.`);
    }

    if (seenNames.has(name)) {
      errors.push(`${variableLabel} name '${name}' is duplicated.`);
    }

    if (typeof candidate.required !== "boolean") {
      errors.push(`${variableLabel} required must be a boolean.`);
    }

    if (candidate.defaultValue !== undefined && typeof candidate.defaultValue !== "string") {
      errors.push(`${variableLabel} defaultValue must be a string when provided.`);
    }

    seenNames.add(name);

    if (name && displayLabel && typeof candidate.required === "boolean") {
      const variable: TemplateVariable = {
        label: displayLabel,
        name,
        required: candidate.required,
      };

      if (typeof candidate.defaultValue === "string") {
        variable.defaultValue = candidate.defaultValue;
      }

      variables.push(variable);
    }
  });

  return variables;
}

function readRequiredString(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} is required.`);
    return "";
  }

  return value.trim();
}

function readStringArray(value: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return [];
  }

  const strings = value
    .map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        errors.push(`${label}[${index}] must be a non-empty string.`);
        return "";
      }

      return item.trim().toLowerCase();
    })
    .filter((item) => item.length > 0);

  return Array.from(new Set(strings));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
