# Phase 4 — Frontend core: editor + trust surface (Codex main-agent prompt)

> Paste to the Codex **main agent**. Spawn → wait for `all done` → integrate/test → PR → stop → address review. Protocol: `docs/CODEX_OPERATIONS_MANUAL.md` §7b.

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — **§8 (UX)**, §5.1, Workflows 1 & 2.
- `docs/PHASED_PLAN.md` — Phase 4.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3, §4, **§5 (UX trust rules)**, §7b.

## Preconditions
Phases 2–3 merged: enhance/refine API + checklist available.

## Goal
The Editor home page delivers the enhance/refine loop with the trust-surface UX. Streaming, always-editable output, "what changed & why," context-used chips.

## Branch
Create and check out `phase-4/frontend-core` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (now).** Read context, create branch, spawn the three sub-agents below **in parallel** (component/file boundaries keep them independent). Each does ALL its own work + tests. **You do not implement, commit, or open anything.** **STOP and WAIT** until `all done`. Do not poll.

**STAGE 2 — INTEGRATE & TEST (after `all done`).** Wire glue only. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the component/e2e tests (`pnpm test:e2e` if present). Fix failures. Verify EXIT GATE incl. a keyboard + screen-reader smoke test. Commit small/conventional.

**STAGE 3 — OPEN PR & STOP.** Push; open PR via `gh` titled `Phase 4: editor & trust-surface results UX`; body = summary + checked exit gate + screenshots/notes. **STOP** for review comments.

**STAGE 4 — ADDRESS REVIEW (after I paste comments).** Focused commits; push; report. Flag spec conflicts. **Do not merge.**

---

## Shared contract (canonical)
Stack: Next.js + React + TS + Tailwind + shadcn/ui. The API shapes (enhance result schema, checklist contract) come from Phases 2–3 — code the typed client against those. UX rules are non-negotiable (manual §5 / spec §8).

## Sub-agents to spawn (3, parallel)

### Agent A — `frontend`: Editor shell
- Editor home: target-model selector (default Auto), mode selector (Improve/Enhance/Refine/Shorten), tone selector, original textarea, context-snippet picker (selection only), action buttons.
- Empty state with a sample prompt + one-line "how it works".
- Component tests for control behavior + disabled-when-empty.

### Agent B — `frontend`: Results trust surface
- Side-by-side original vs. enhanced; **always-editable** enhanced output (edits update copy/save payload live); structure score before/after.
- **"What changed & why"** panel default-on (explanation + diff added/removed/changed).
- Per-item checklist with reason + "apply suggestion" where feasible; **icons + text, never color alone**.
- **Context-used chips** listing exactly which snippets were injected.
- Component tests for editability, default-on panel, chips, checklist a11y.

### Agent C — `builder`: streaming, state, API client
- Typed API client for enhance/refine + checklist.
- Streaming with honest, dull loading text ("Structuring your prompt…").
- States: loading, empty, error (preserve input, Retry, **labeled fallback** when used), confirmation/undo, Refine question form (skippable).
- Tests for each state + stream handling + error-preserves-input.

## EXIT GATE
- [ ] A user can Enhance and Refine entirely in the UI.
- [ ] All spec §8 states render; output is editable; "what changed & why" on by default; context chips correct.
- [ ] Keyboard + screen-reader smoke test passes (full WCAG audit is Phase 6).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green.

## Do NOT
- Do NOT auto-inject context — only explicitly selected snippets reach the API; show chips for what was used.
- Do NOT present output as final/locked — it is always editable.
- Do NOT hide the fallback model — label it when used.
- Do NOT rely on color alone for the checklist (icons + text).
- Do NOT build Library/History/Templates pages yet (Phase 5) — save/tag may be optimistic stubs.
- Main agent: no Stage-1 implementation; no Stage-2 before `all done`.

## Report back
Per agent: pages/components built, states covered, a11y smoke result, API client shape, integration glue, exit-gate status.
