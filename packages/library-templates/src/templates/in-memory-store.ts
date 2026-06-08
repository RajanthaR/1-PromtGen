import type { PublicTemplate, TemplateSearchQuery, TemplateUsageRecord } from "./schema";
import type { TemplateSeedStore } from "./loader";
import { searchTemplateCatalog } from "./search";

export interface TemplateCatalogPort {
  getPublicTemplate(templateId: string): Promise<PublicTemplate | null>;
  listPublicTemplates(query?: TemplateSearchQuery): Promise<PublicTemplate[]>;
  recordTemplateUse(userId: string, templateId: string, usedAt?: Date): Promise<void>;
}

export class InMemoryTemplateCatalog implements TemplateCatalogPort, TemplateSeedStore {
  private readonly templates = new Map<string, PublicTemplate>();
  private readonly usageRecords: TemplateUsageRecord[] = [];

  constructor(templates: PublicTemplate[] = []) {
    for (const template of templates) {
      this.templates.set(template.id, cloneTemplate(template));
    }
  }

  async getPublicTemplate(templateId: string): Promise<PublicTemplate | null> {
    const template = this.templates.get(templateId);

    return template?.isPublic ? cloneTemplate(template) : null;
  }

  async listPublicTemplates(query: TemplateSearchQuery = {}): Promise<PublicTemplate[]> {
    return searchTemplateCatalog(
      Array.from(this.templates.values()).map(cloneTemplate),
      query,
      this.usageRecords.map(cloneUsageRecord),
    );
  }

  async recordTemplateUse(userId: string, templateId: string, usedAt = new Date()): Promise<void> {
    const template = this.templates.get(templateId);

    if (!template?.isPublic) {
      throw new Error("Template was not found.");
    }

    this.usageRecords.push({
      templateId,
      usedAt,
      userId,
    });
  }

  async upsertTemplates(templates: PublicTemplate[]): Promise<void> {
    for (const template of templates) {
      this.templates.set(template.id, cloneTemplate(template));
    }
  }
}

function cloneTemplate(template: PublicTemplate): PublicTemplate {
  return {
    ...template,
    compatibleTools: [...template.compatibleTools],
    tags: [...template.tags],
    variables: template.variables.map((variable) => ({ ...variable })),
  };
}

function cloneUsageRecord(usageRecord: TemplateUsageRecord): TemplateUsageRecord {
  return {
    ...usageRecord,
    usedAt: new Date(usageRecord.usedAt),
  };
}
