import launchCatalogJson from "../content/launch-catalog.json";
import {
  validateTemplateContent,
  type PublicTemplate,
} from "./templates/schema";

const validation = validateTemplateContent(launchCatalogJson);

if (!validation.valid) {
  throw new Error(
    `Launch template catalog is invalid: ${validation.errors.join("; ")}`,
  );
}

/** Launch public template catalog (100 original templates). */
export const launchTemplateCatalog: readonly PublicTemplate[] = validation.templates;

export const launchTemplateCatalogCount = launchTemplateCatalog.length;
