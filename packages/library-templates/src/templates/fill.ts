import type { PublicTemplate } from "./schema";

export interface TemplateFillError {
  field: string;
  message: string;
}

export type TemplateFillResult =
  | {
      valid: true;
      filledPrompt: string;
      values: Record<string, string>;
    }
  | {
      valid: false;
      errors: TemplateFillError[];
    };

export function fillTemplateVariables(
  template: PublicTemplate,
  values: Record<string, string | null | undefined>,
): TemplateFillResult {
  const errors: TemplateFillError[] = [];
  const normalizedValues: Record<string, string> = {};

  for (const variable of template.variables) {
    const rawValue = values[variable.name] ?? variable.defaultValue ?? "";
    const value = rawValue.trim();

    if (variable.required && !value) {
      errors.push({
        field: variable.name,
        message: `${variable.label} is required.`,
      });
      continue;
    }

    normalizedValues[variable.name] = value;
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    filledPrompt: template.body.replace(
      /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g,
      (_match, variableName: string) => normalizedValues[variableName] ?? "",
    ),
    values: normalizedValues,
  };
}
