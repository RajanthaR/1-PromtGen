# Phase 0 — Foundations (Codex main-agent prompt)

> Paste the block below to the Codex **main agent**. It spawns sub-agents who do all the work, then stops and waits for your `all done`. See the protocol in `docs/CODEX_OPERATIONS_MANUAL.md` §7b.

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — §9 (Technical), §2 (Goals/Non-Goals).
- `docs/PHASED_PLAN.md` — Phase 0.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3 (agent roster), §4 (standing instructions), §7b (this protocol).

## Goal
Stand up a clean, reproducible monorepo with tooling, CI, and the Codex project config — so every later phase has a stable base. No product features yet.

## Branch
Create and check out `phase-0/foundations` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (do this now).** Read the context, create the branch, then spawn the two sub-agents below **in parallel** (use the built-in `worker` agent — the custom roster doesn't exist yet; this phase creates it). Give each its full brief. Each sub-agent does ALL of its own work. **You do not write code, do not commit, do not open anything.** After spawning, **STOP and WAIT.** Do nothing until I send `all done`. Do not poll or check in on the sub-agents.

**STAGE 2 — INTEGRATE & TEST (only after I say `all done`).** Inspect what the sub-agents produced; wire integration glue only. Run in order: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. Fix failures. Verify the EXIT GATE. Commit in small conventional commits.

**STAGE 3 — OPEN PR & STOP.** Push the branch. Open a PR via `gh` titled `Phase 0: project foundations & tooling`; body = change summary + the checked exit-gate list + how verified. Then **STOP** and wait for my review comments.

**STAGE 4 — ADDRESS REVIEW (only after I paste review comments).** Address each comment in focused commits; push; report per-comment. Flag any comment that conflicts with the spec instead of blindly applying it. **Do not merge the PR.**

---

## Sub-agents to spawn (2, parallel — independent file sets)

### Agent A — `worker`: repo scaffold, tooling, CI
Brief:
- Create a pnpm + Turborepo monorepo: `apps/web` (Next.js placeholder), `apps/api` (Node/TS service placeholder), `packages/config` (shared tsconfig/eslint/prettier), `packages/types` (shared types stub).
- TypeScript strict mode; ESLint + Prettier wired and consistent across packages.
- `.env.example` with documented placeholders; an env-loading helper. **No real secrets.**
- GitHub Actions CI: on PR run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. Add a **stubbed** `eval` job (Promptfoo) that is a no-op placeholder until Phase 2.
- Root `README.md` quickstart (install, dev, test).
- Provide working `pnpm lint`, `pnpm typecheck`, `pnpm test` scripts (a trivial passing test is fine).
- Write unit tests proving the build/test scripts run.

### Agent B — `worker`: Codex project config
Brief (create exactly these, per manual §3 and verified Codex schema):
- `AGENTS.md` at repo root encoding standing instructions (manual §4) + UX trust rules (manual §5).
- `.codex/config.toml` with `[agents] max_threads = 6`, `max_depth = 1`, `job_max_runtime_seconds = 1800`.
- `.codex/agents/*.toml` for the six roster agents (`builder`, `prompt-engineer`, `reviewer`, `explorer`, `test-runner`, `frontend`) — each with `name`, `description`, `developer_instructions`, and appropriate `model`/`model_reasoning_effort`/`sandbox_mode` (read-only for `reviewer` and `explorer`; workspace-write for the rest).
- Validate TOML parses.

---

## EXIT GATE (main agent verifies in Stage 2)
- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` all pass on a clean checkout.
- [ ] CI workflow present and green on the PR.
- [ ] `.codex/config.toml` + six `.codex/agents/*.toml` parse; `AGENTS.md` present.
- [ ] README quickstart accurate.

## Do NOT
- Do NOT build any product feature (no enhancer, DB, UI, auth) — that starts Phase 1.
- Do NOT add image/video/MCP/teams/self-host/vector-search anything (spec §2, §12).
- Do NOT commit real secrets or `.env`; only `.env.example`.
- Main agent: do NOT implement in Stage 1, and do NOT start Stage 2 before `all done`.

## Report back (Stage 2 → before PR)
Summarize: files created per agent, command outputs for the four scripts, anything that needed integration glue, and confirmation the exit gate is met.
