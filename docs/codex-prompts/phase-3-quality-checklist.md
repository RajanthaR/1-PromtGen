# Phase 3 — Quality checklist / structure score (Codex main-agent prompt)

> Paste to the Codex **main agent**. Spawn → wait for `all done` → integrate/test → PR → stop → address review. Protocol: `docs/CODEX_OPERATIONS_MANUAL.md` §7b.

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — **§5.2**, §11 (self-grading bias), §10 (quality checklist).
- `docs/PHASED_PLAN.md` — Phase 3.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3, §4, §7b.

## Preconditions
Phase 2 merged: enhance/refine loop + structured output live.

## Goal
An honest, reproducible **structure checklist** computed **separately** from generation — never by the model that wrote the prompt.

## Branch
Create and check out `phase-3/quality-checklist` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (now).** Read context, create branch, spawn the two sub-agents below **in parallel**. Each does ALL its own work + tests. **You do not implement, commit, or open anything.** **STOP and WAIT** until `all done`. Do not poll.

**STAGE 2 — INTEGRATE & TEST (after `all done`).** Wire glue only. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm eval` (judge eval included). Fix failures. Verify EXIT GATE. Commit small/conventional.

**STAGE 3 — OPEN PR & STOP.** Push; open PR via `gh` titled `Phase 3: structure checklist & optional judge`; body = summary + checked exit gate + reproducibility evidence. **STOP** for review comments.

**STAGE 4 — ADDRESS REVIEW (after I paste comments).** Focused commits; push; report. Re-run evals after prompt changes. Flag spec conflicts. **Do not merge.**

---

## Shared contract (canonical)
Checklist output: array of items `{ dimension, status: pass|partial|missing, reason, fix_suggestion }` + a labeled `structure_score` (0–100 rollup of the items). Dimensions & weights (spec §5.2): Clarity 20, Context 15, Specificity 15, Output format 15, Model/tool fit 15, Safety/privacy 10, Concision 10. The checklist is a **separate computation** from the Phase 2 enhance call.

## Sub-agents to spawn (2, parallel)

### Agent A — `builder`: deterministic heuristic checklist (PRIMARY signal)
- Pure, deterministic function over a prompt → the checklist contract above. **Reproducible**: identical input → identical output.
- One-line `reason` and `fix_suggestion` for every non-`pass` item.
- Compute `structure_score_before/after` and persist to `operations` (Phase 1).
- Unit tests **locking reproducibility** (same input ⇒ byte-identical result) and each dimension's logic.

### Agent B — `prompt-engineer`: optional LLM rubric (SECONDARY, suggestions only)
- A **separate** LLM call, ideally a **different model family** than the generator (anti self-preference, spec §11). Returns qualitative weaknesses/improvements as **suggestions** — never a competing number.
- Runs as its own request behind a flag; failure degrades gracefully (heuristic still shown).
- Promptfoo cases asserting it does not emit a numeric score and stays suggestion-shaped.

## EXIT GATE
- [ ] Heuristic score reproducible for identical input (test-locked).
- [ ] Every non-passing item has a reason + fix suggestion.
- [ ] Judge runs as a separate call with a different model family; output is suggestions only.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm eval` green.

## Do NOT
- Do NOT fold scoring into the Phase 2 enhance call — it must be a separate computation.
- Do NOT let the generator grade its own output (no same-model judge).
- Do NOT present the score as a prediction of the *output's* quality — label it "structure score" only.
- Do NOT make the heuristic depend on the LLM judge; heuristic is primary and must stand alone.
- Main agent: no Stage-1 implementation; no Stage-2 before `all done`.

## Report back
Per agent: heuristic implementation + reproducibility proof, judge model/flag/behavior, persisted score fields, integration glue, exit-gate status.
