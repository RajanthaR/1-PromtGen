# Phase 5 — Library, history, context, templates (Codex main-agent prompt)

> Paste to the Codex **main agent**. Spawn → wait for `all done` → integrate/test → PR → stop → address review. Protocol: `docs/CODEX_OPERATIONS_MANUAL.md` §7b.

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — **§5.3–§5.6**, Workflows 3 & 4, §10 (library & history).
- `docs/PHASED_PLAN.md` — Phase 5.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3, §4, §5, §7b.

## Preconditions
Phase 4 merged: editor + results UI live. Phase 1 tables available.

## Goal
The reuse layer — save, organize, reuse. Library, history, context, and templates with full-text search.

## Branch
Create and check out `phase-5/library-reuse` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (now).** Read context, create branch, spawn the four sub-agents below **in parallel** (independent feature slices). Each does ALL its own work + tests. **You do not implement, commit, or open anything.** **STOP and WAIT** until `all done`. Do not poll.

**STAGE 2 — INTEGRATE & TEST (after `all done`).** Wire glue only. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, e2e if present. Fix failures. Verify EXIT GATE. Commit small/conventional.

**STAGE 3 — OPEN PR & STOP.** Push; open PR via `gh` titled `Phase 5: library, history, context & templates`; body = summary + checked exit gate. **STOP** for review comments.

**STAGE 4 — ADDRESS REVIEW (after I paste comments).** Focused commits; push; report. Flag spec conflicts. **Do not merge.**

---

## Template content note
The **50–100 original templates** are **content I (the operator) provide separately** — do NOT scrape or copy third-party prompt libraries (spec §11/§12). Build the loader, schema validation, and seed mechanism; ingest the content file when I supply it (use a small placeholder set for tests).

## Sub-agents to spawn (4, parallel)

### Agent A — `builder`: personal prompt library
- Save/edit/duplicate/tag/folder/pin/search; **immutable versions** with optional change note; **non-destructive restore** (copies old version forward); **soft-delete + grace period**; copy as Markdown/JSON.
- Tests: restore preserves newer versions; soft-delete recoverable; FTS search works.

### Agent B — `builder`: prompt history
- Auto-record each operation (spec §5.5 fields); plan-based retention (Free 50 / Pro 500 / Advanced unlimited); user-deletable; "send to editor".
- Tests: retention caps enforced per plan; send-to-editor round-trips.

### Agent C — `builder`: context library + templates backend
- Context: CRUD snippets; **explicit selection only**; result lists snippets used; **unselected context provably never sent** to the API.
- Templates: full-text + tag + tool + difficulty filters + recently-used; variable fill with **required-field validation**; loader/seed mechanism.
- Tests incl. **"unselected context never reaches the model"** and required-variable-blocks-generation.

### Agent D — `frontend`: pages
- Library, History, Context, Templates pages (search/filter/folders/versions; variable-fill UI; send-to-editor) consistent with §5 UX rules.
- Component/e2e tests for the main flows.

## EXIT GATE
- [ ] Save/tag/search/edit/duplicate/delete + restore (preserving newer versions) all work (spec §10).
- [ ] History records ops, enforces plan retention, deletes, sends to editor.
- [ ] Unselected context provably never reaches the model (test).
- [ ] Template search + variable fill + required-field validation work.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green.

## Do NOT
- Do NOT auto-inject context anywhere — selection is always explicit; surface used-snippet chips.
- Do NOT hard-delete — soft-delete with grace period; restore must not destroy newer versions.
- Do NOT add semantic/vector search — Postgres full-text only (spec §9/§12).
- Do NOT import third-party template/prompt libraries verbatim — content comes from me.
- Do NOT add team/shared-library/approval features (spec §12 deferred).
- Main agent: no Stage-1 implementation; no Stage-2 before `all done`.

## Report back
Per agent: features + tests, the unselected-context proof, retention behavior, template loader, integration glue, exit-gate status.
