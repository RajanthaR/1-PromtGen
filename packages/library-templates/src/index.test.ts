import { describe, expect, it } from "vitest";

import {
  InMemoryTemplateCatalog,
  TemplateLoaderError,
  fillTemplateVariables,
  launchTemplateCatalog,
  launchTemplateCatalogCount,
  seedTemplateCatalog,
  validateTemplateContent,
  type LibraryTemplatesPort,
  type PublicTemplate,
  type SavedPromptDraft,
} from "./index";

describe("launch template catalog", () => {
  it("ships 100 original public templates that pass schema validation", () => {
    expect(launchTemplateCatalogCount).toBe(100);
    expect(launchTemplateCatalog).toHaveLength(100);

    const validation = validateTemplateContent(launchTemplateCatalog);
    expect(validation.valid).toBe(true);

    const categories = new Set(launchTemplateCatalog.map((template) => template.category));
    for (const category of [
      "content",
      "copywriting",
      "email",
      "seo",
      "social",
      "research",
      "sales",
      "support",
      "coding",
      "pm",
      "education",
      "data_analysis",
      "prompt_evaluation",
    ]) {
      expect(categories.has(category)).toBe(true);
    }

    const ids = launchTemplateCatalog.map((template) => template.id);
    expect(new Set(ids).size).toBe(100);
  });

  it("seeds the in-memory catalog from the launch set", async () => {
    const catalog = new InMemoryTemplateCatalog();
    await expect(seedTemplateCatalog(catalog, [...launchTemplateCatalog])).resolves.toEqual({
      seeded: 100,
    });
    await expect(catalog.listPublicTemplates()).resolves.toHaveLength(100);
  });
});

describe("library-templates public boundary", () => {
  it("keeps public templates readable without user scope", async () => {
    const template = {
      id: "tmpl_1",
      title: "Launch Email",
      category: "email",
      description: "Draft a launch email.",
      body: "Write to {{audience}}.",
      variables: [{ name: "audience", label: "Audience", required: true }],
      tags: ["email"],
      compatibleTools: ["text-model"],
      difficulty: "beginner",
      isPublic: true,
    } satisfies PublicTemplate;

    const port: Pick<LibraryTemplatesPort, "listPublicTemplates"> = {
      async listPublicTemplates() {
        return [template];
      },
    };

    await expect(port.listPublicTemplates()).resolves.toEqual([template]);
  });

  it("keeps saved prompt operations user-scoped", () => {
    const draft = {
      title: "Reusable prompt",
      body: "Summarize this document.",
      tags: ["summary"],
      changeNote: "Initial save",
    } satisfies SavedPromptDraft;

    expect(draft).toEqual({
      title: "Reusable prompt",
      body: "Summarize this document.",
      tags: ["summary"],
      changeNote: "Initial save",
    });
  });

  it("fills variables and blocks generation when required fields are missing", () => {
    const template = placeholderTemplates[0]!;

    expect(
      fillTemplateVariables(template, {
        audience: "trial teachers",
        product: "PromptForge Studio",
      }),
    ).toEqual({
      valid: true,
      filledPrompt:
        "Write a launch email for PromptForge Studio aimed at trial teachers. Keep it concise.",
      values: {
        audience: "trial teachers",
        product: "PromptForge Studio",
      },
    });

    expect(
      fillTemplateVariables(template, {
        audience: "trial teachers",
        product: "   ",
      }),
    ).toEqual({
      valid: false,
      errors: [
        {
          field: "product",
          message: "Product is required.",
        },
      ],
    });
  });

  it("searches and filters templates by keyword, tag, tool, difficulty, and recent use", async () => {
    const catalog = new InMemoryTemplateCatalog(placeholderTemplates);

    await catalog.recordTemplateUse(
      "user_123",
      "tmpl_support_reply",
      new Date("2026-06-07T03:00:00.000Z"),
    );
    await catalog.recordTemplateUse(
      "user_123",
      "tmpl_launch_email",
      new Date("2026-06-07T01:00:00.000Z"),
    );
    await catalog.recordTemplateUse(
      "user_456",
      "tmpl_research_brief",
      new Date("2026-06-07T04:00:00.000Z"),
    );

    await expect(catalog.listPublicTemplates({ keyword: "launch email" })).resolves.toEqual([
      expect.objectContaining({ id: "tmpl_launch_email" }),
    ]);
    await expect(
      catalog.listPublicTemplates({
        difficulty: "beginner",
        tag: "support",
        tool: "chatgpt",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "tmpl_support_reply" })]);
    await expect(
      catalog.listPublicTemplates({ recentlyUsedByUserId: "user_123" }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "tmpl_support_reply" }),
      expect.objectContaining({ id: "tmpl_launch_email" }),
    ]);
  });

  it("ranks keyword matches by every matching weighted field", async () => {
    const catalog = new InMemoryTemplateCatalog([
      {
        ...placeholderTemplates[0]!,
        body: "General body.",
        description: "General description.",
        tags: ["general"],
        title: "Launch",
      },
      {
        ...placeholderTemplates[1]!,
        body: "Write a launch support reply.",
        description: "Launch support reply.",
        tags: ["launch", "support"],
        title: "Support Reply",
      },
    ]);

    await expect(catalog.listPublicTemplates({ keyword: "launch" })).resolves.toEqual([
      expect.objectContaining({ id: "tmpl_support_reply" }),
      expect.objectContaining({ id: "tmpl_launch_email" }),
    ]);
  });

  it("rejects invalid template content and accepts placeholder fixture content", () => {
    expect(validateTemplateContent(placeholderTemplates)).toMatchObject({
      valid: true,
      templates: expect.arrayContaining([expect.objectContaining({ id: "tmpl_launch_email" })]),
    });

    expect(
      validateTemplateContent([
        {
          ...placeholderTemplates[0],
          body: "Write for {{missing_variable}}.",
        },
      ]),
    ).toEqual({
      valid: false,
      errors: ["Template 0 body references undeclared variable 'missing_variable'."],
    });
  });

  it("seeds validated operator-supplied content through the loader store boundary", async () => {
    const catalog = new InMemoryTemplateCatalog();

    await expect(seedTemplateCatalog(catalog, placeholderTemplates)).resolves.toEqual({
      seeded: 3,
    });
    await expect(catalog.listPublicTemplates({ tag: "email" })).resolves.toEqual([
      expect.objectContaining({ id: "tmpl_launch_email" }),
    ]);
    await expect(seedTemplateCatalog(catalog, { invalid: true })).rejects.toBeInstanceOf(
      TemplateLoaderError,
    );
  });
});

const placeholderTemplates = [
  {
    body: "Write a launch email for {{product}} aimed at {{audience}}. Keep it concise.",
    category: "email",
    compatibleTools: ["chatgpt", "claude"],
    description: "Placeholder launch email prompt for loader tests.",
    difficulty: "beginner",
    id: "tmpl_launch_email",
    isPublic: true,
    tags: ["email", "launch"],
    title: "Launch Email",
    variables: [
      {
        label: "Product",
        name: "product",
        required: true,
      },
      {
        label: "Audience",
        name: "audience",
        required: true,
      },
    ],
  },
  {
    body: "Draft a support reply about {{issue}} with next steps and a calm tone.",
    category: "support",
    compatibleTools: ["chatgpt"],
    description: "Placeholder support reply prompt for loader tests.",
    difficulty: "beginner",
    id: "tmpl_support_reply",
    isPublic: true,
    tags: ["support", "reply"],
    title: "Support Reply",
    variables: [
      {
        label: "Issue",
        name: "issue",
        required: true,
      },
    ],
  },
  {
    body: "Create a research brief on {{topic}} for {{audience}} with source-quality criteria.",
    category: "research",
    compatibleTools: ["claude"],
    description: "Placeholder research brief prompt for loader tests.",
    difficulty: "intermediate",
    id: "tmpl_research_brief",
    isPublic: true,
    tags: ["research"],
    title: "Research Brief",
    variables: [
      {
        label: "Topic",
        name: "topic",
        required: true,
      },
      {
        label: "Audience",
        name: "audience",
        required: true,
      },
    ],
  },
] satisfies PublicTemplate[];
