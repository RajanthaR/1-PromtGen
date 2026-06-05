# PromptForge Studio

Phase 0 establishes the repository foundation for PromptForge Studio. The apps are placeholders
only; product features arrive in later phases.

## Quickstart

Install dependencies:

```sh
pnpm install
```

Run the placeholder apps:

```sh
pnpm dev
```

Run the validation gates:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Optional local environment values are documented in `.env.example`. Keep real secrets in untracked
local env files only.

## Workspace

- `apps/web` is the Next.js placeholder app.
- `apps/api` is the Node/TypeScript modular-monolith placeholder.
- `packages/config` contains shared TypeScript, ESLint, Prettier, and environment helpers.
- `packages/types` contains shared type stubs.
