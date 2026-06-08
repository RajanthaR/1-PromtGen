import type { PublicTemplate, TemplateSearchQuery, TemplateUsageRecord } from "./schema";

interface ScoredTemplate {
  recentUse?: TemplateUsageRecord;
  score: number;
  template: PublicTemplate;
}

export function searchTemplateCatalog(
  templates: PublicTemplate[],
  query: TemplateSearchQuery = {},
  usageRecords: TemplateUsageRecord[] = [],
): PublicTemplate[] {
  const keywordTerms = tokenize(query.keyword ?? "");
  const tagFilters = normalizeFilters([...(query.tags ?? []), ...(query.tag ? [query.tag] : [])]);
  const toolFilter = normalizeFilter(query.tool);
  const recentUsageByTemplate = buildRecentUsageByTemplate(
    usageRecords,
    query.recentlyUsedByUserId,
  );
  const scored: ScoredTemplate[] = [];

  for (const template of templates) {
    const recentUse = recentUsageByTemplate.get(template.id);

    if (query.recentlyUsedByUserId && !recentUse) {
      continue;
    }

    if (query.difficulty && template.difficulty !== query.difficulty) {
      continue;
    }

    if (tagFilters.length > 0 && !tagFilters.every((tag) => template.tags.includes(tag))) {
      continue;
    }

    if (toolFilter && !template.compatibleTools.includes(toolFilter)) {
      continue;
    }

    const score = scoreKeywordMatch(template, keywordTerms);

    if (keywordTerms.length > 0 && score === 0) {
      continue;
    }

    const scoredTemplate: ScoredTemplate = { score, template };

    if (recentUse) {
      scoredTemplate.recentUse = recentUse;
    }

    scored.push(scoredTemplate);
  }

  scored.sort((left, right) => {
    if (query.recentlyUsedByUserId) {
      const leftUsedAt = left.recentUse?.usedAt.getTime() ?? 0;
      const rightUsedAt = right.recentUse?.usedAt.getTime() ?? 0;

      if (leftUsedAt !== rightUsedAt) {
        return rightUsedAt - leftUsedAt;
      }
    }

    if (left.score !== right.score) {
      return right.score - left.score;
    }

    return left.template.title.localeCompare(right.template.title);
  });

  return scored.slice(0, query.limit ?? scored.length).map((item) => item.template);
}

function scoreKeywordMatch(template: PublicTemplate, keywordTerms: string[]): number {
  if (keywordTerms.length === 0) {
    return 1;
  }

  const weightedFields = [
    { text: template.title, weight: 4 },
    { text: template.category, weight: 3 },
    { text: template.description, weight: 2 },
    { text: template.tags.join(" "), weight: 2 },
    { text: template.compatibleTools.join(" "), weight: 1 },
    { text: template.body, weight: 1 },
  ];
  let score = 0;

  for (const term of keywordTerms) {
    let matched = false;

    for (const field of weightedFields) {
      if (normalizeSearchText(field.text).includes(term)) {
        score += field.weight;
        matched = true;
      }
    }

    if (!matched) {
      return 0;
    }
  }

  return score;
}

function buildRecentUsageByTemplate(
  usageRecords: TemplateUsageRecord[],
  userId: string | undefined,
): Map<string, TemplateUsageRecord> {
  const recentUsageByTemplate = new Map<string, TemplateUsageRecord>();

  if (!userId) {
    return recentUsageByTemplate;
  }

  for (const usage of usageRecords) {
    if (usage.userId !== userId) {
      continue;
    }

    const existing = recentUsageByTemplate.get(usage.templateId);

    if (!existing || usage.usedAt > existing.usedAt) {
      recentUsageByTemplate.set(usage.templateId, usage);
    }
  }

  return recentUsageByTemplate;
}

function normalizeFilters(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeFilter).filter((value) => value.length > 0)));
}

function normalizeFilter(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function tokenize(value: string): string[] {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
