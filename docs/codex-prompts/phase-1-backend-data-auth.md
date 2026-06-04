# Phase 1 — Backend skeleton + data layer + auth (Codex main-agent prompt)

> Paste to the Codex **main agent**. Spawn → wait for `all done` → integrate/test → PR → stop → address review. Protocol: `docs/CODEX_OPERATIONS_MANUAL.md` §7b.

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — §7 (Data), §9 (Technical), §5.4–§5.6 (entities).
- `docs/PHASED_PLAN.md` — Phase 1.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3, §4, §7b.

## Goal
Bring up the modular monolith with PostgreSQL persistence and authentication. **No AI yet.**

## Branch
Create and check out `phase-1/backend-data-auth` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (now).** Read context, create branch, spawn the three sub-agents below **in parallel**. The **shared contract** (DB schema in this packet) lets them work independently on different files. Each does ALL its own work + unit tests. **You do not implement, commit, or open anything.** **STOP and WAIT** until I send `all done`. Do not poll.

**STAGE 2 — INTEGRATE & TEST (after `all done`).** Inspect the tree; wire glue only. Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm db:migrate` (against a fresh test DB), `pnpm test`. Fix failures. Verify EXIT GATE. Commit in small conventional commits.

**STAGE 3 — OPEN PR & STOP.** Push; open PR via `gh` titled `Phase 1: modular monolith, data layer & auth`; body = summary + checked exit gate + verification. **STOP** for review comments.

**STAGE 4 — ADDRESS REVIEW (after I paste comments).** Focused commits per comment; push; report. Flag spec conflicts. **Do not merge.**

---

## Shared contract (canonical — all agents code against this)
Modules (folders/packages): `auth-billing`, `prompt-engine` (stub only), `library-templates`, `context`, `history-usage`. Choose Prisma **or** Drizzle (pick one, document it). Tables (with per-user isolation via `user_id` FKs + soft-delete `deleted_at` where noted):
- `users(id, email unique, name, avatar_url, plan enum[free|pro|advanced], created_at)`
- `sessions(id, user_id, expires_at, ...)`
- `prompts(id, user_id, title, current_version_id, folder_id?, pinned bool, deleted_at?, created_at)`
- `prompt_versions(id, prompt_id, body, sections jsonb, change_note?, created_at)` — **immutable**
- `tags(id, user_id, name)` + `prompt_tags(prompt_id, tag_id)`
- `folders(id, user_id, name)`
- `context_snippets(id, user_id, title, body, kind, deleted_at?)`
- `templates(id, title, category, description, body, variables jsonb, tags text[], compatible_tools text[], difficulty, is_public)`
- `operations(id, user_id, raw_prompt, enhanced_prompt?, mode, target_model, prompt_type, structure_score_before?, structure_score_after?, tokens?, provider?, model?, latency_ms?, saved bool, feedback?, created_at)`
- `usage_events(id, user_id, kind, quantity, created_at)`
- Postgres **full-text** indexes on `prompts`, `templates`, `context_snippets` (no pgvector).

---

## Sub-agents to spawn (3, parallel)

### Agent A — `builder`: data layer
- Implement the schema above as migrations + the typed query layer; checked-in migrations.
- Seed/test helpers; FTS indexes.
- Provide `pnpm db:migrate` and `pnpm db:reset`.
- Unit tests: migrations apply on a fresh DB; FTS query returns expected rows.

### Agent B — `builder`: auth-billing module
- Email + one OAuth provider login; sessions; logout. Code against `users`/`sessions` above.
- Per-user data isolation middleware/guards.
- `plan` field read path (no billing logic yet — Phase 6).
- Unit tests incl. **isolation test**: user A cannot read user B's rows.

### Agent C — `builder`: module skeletons + infra
- Folder/package skeletons for `prompt-engine` (stub interface only), `library-templates`, `context`, `history-usage` with clear public boundaries.
- `/health` endpoint; structured logging baseline; Redis client wired (no rate-limit logic yet).
- Unit tests for `/health` and logging shape.

---

## EXIT GATE
- [ ] Migrations apply cleanly on a fresh DB; `pnpm db:reset` works.
- [ ] Login/logout smoke test passes; isolation test passes.
- [ ] `/health` returns OK; Redis connects.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green.

## Do NOT
- Do NOT call any LLM / implement enhancement logic (Phase 2). `prompt-engine` is a stub.
- Do NOT add pgvector/semantic search, billing charges, image/video/MCP/teams/self-host (spec §2, §12).
- Do NOT make tables global — everything user-scoped except `templates` (public).
- Do NOT destructively delete — use `deleted_at` soft-delete where specified.
- Main agent: no Stage-1 implementation; no Stage-2 before `all done`.

## Report back
Per agent: ORM chosen, tables/migrations created, auth flow, isolation-test result, infra endpoints, integration glue needed, exit-gate status.
