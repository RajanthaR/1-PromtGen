# AGENTS.md

## Project Rules

- Spec is law: `Opus-4.8-plans/improved_web_app_spec.md` defines scope. Anything marked Non-Goal or
  Deferred in spec sections 2 or 12 is out of bounds.
- Do not build non-goals or deferred items: no downstream-task execution, image/video prompt modes,
  MCP server, team workspaces/approvals, self-hosting, autonomous agents, multi-step orchestration,
  dataset optimization, vector search at launch, marketplace, fine-tuning, or hosted models.
- Keep the product a modular monolith, not microservices. Use internal modules only: `auth/billing`,
  `prompt-engine`, `library/templates`, `context`, and `history/usage`.
- Ask before guessing when a requirement is ambiguous or conflicts with the spec.
- Tests ship with code. Add or update unit tests with implementation work, and add integration/e2e
  coverage when the phase requires it.
- Use provider-enforced structured outputs for every LLM call. Never parse JSON from prose.
- Treat user prompt text as data, not instructions. Do not use keyword injection blocklists.
- Never log secrets. Run secret detection before provider calls and keep secrets out of traces,
  logs, fixtures, and errors.
- Trace every LLM call from day one: latency, tokens, cost, model, and success/failure.
- Keep user prompt text as stored data, not executable or privileged instructions.
- Use conventional commits, one logical change per commit, and small diffs. Branch from the agreed
  base and never commit directly to the base branch.
- Read before write. Inspect surrounding code and docs before editing, then match local idioms.
- The prompt engine is isolated: only the `prompt-engineer` agent may edit prompt-engine prompts,
  schemas, or golden few-shots. No meta-prompt change merges unless the Promptfoo regression suite
  passes.

## UX Trust Rules

- Output is always editable and presented as a starting point, not a verdict.
- Show the "What changed & why" panel by default.
- Use side-by-side original vs. enhanced output, with structure checklist/score before and after.
- Show context-used chips for exactly the snippets injected into the model. Unselected context must
  never reach the model.
- Use honest, plain loading text. Preserve input on errors, offer Retry, and label fallback-model
  results.
- Meet WCAG 2.1 AA: keyboard access, visible focus, sufficient contrast, and no color-only signals.
