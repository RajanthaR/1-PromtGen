import type { PromptGenDatabase } from "./client";
import { templates } from "./schema";

export const starterTemplates = [
  {
    body: "Write a launch email for {{product}} aimed at {{audience}} with a clear CTA.",
    category: "marketing",
    compatibleTools: ["chatgpt", "claude"],
    description: "Structured launch email prompt with audience, value proposition, and CTA slots.",
    difficulty: "beginner",
    tags: ["email", "launch"],
    title: "Launch Email",
    variables: ["product", "audience"],
  },
  {
    body: "Create a support reply that acknowledges {{issue}}, gives next steps, and preserves a calm tone.",
    category: "support",
    compatibleTools: ["chatgpt", "claude"],
    description: "Customer support response prompt for clear and empathetic replies.",
    difficulty: "beginner",
    tags: ["support", "reply"],
    title: "Support Reply",
    variables: ["issue"],
  },
];

export async function seedStarterTemplates(db: PromptGenDatabase): Promise<void> {
  await db.insert(templates).values(starterTemplates).onConflictDoNothing();
}
