# Phase 2 — LLM gateway + core enhance loop (Codex main-agent prompt)

> Paste to the Codex **main agent**. Spawn → wait for `all done` → integrate/test → PR → stop → address review. Protocol: `docs/CODEX_OPERATIONS_MANUAL.md` §7b. **This phase is the heart of the product — the meta-prompt and schema are crown jewels.**

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — **§6 in full**, §5.1, §10 (enhancer/refine/reliability).
- `docs/PHASED_PLAN.md` — Phase 2.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3 (esp. prompt-engine isolation rule), §4, §7b.

## Preconditions
Phase 1 merged: data layer, modules, `/health`, logging live.

## Decisions you must have from me before Stage 1 (spec §13)
- **Launch provider + fallback provider.** **Economics model** (platform-paid vs BYO-key). If I haven't given these, **STOP and ask** — do not pick them yourself.

## Goal
Ship Workflow 1 (Enhance) and Workflow 2 (Refine) end to end on the API with provider-enforced structured output and a passing Promptfoo gate. Four modes: Improve, Enhance, Refine, Shorten.

## Branch
Create and check out `phase-2/enhance-loop` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (now).** Read context, confirm provider/economics decisions are given (else ask), create branch, spawn the three sub-agents below **in parallel**. Shared contracts (gateway interface + output schema in this packet) keep them independent. Each does ALL its own work + tests. **You do not implement, commit, or open anything.** **STOP and WAIT** until `all done`. Do not poll.

**STAGE 2 — INTEGRATE & TEST (after `all done`).** Wire glue only. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the **Promptfoo eval gate** `pnpm eval`. Fix failures. **No merge of prompt changes unless `pnpm eval` is green.** Verify EXIT GATE. Commit small/conventional.

**STAGE 3 — OPEN PR & STOP.** Push; open PR via `gh` titled `Phase 2: LLM gateway & core enhance/refine loop`; body = summary + checked exit gate + eval results + p95 latency note. **STOP** for review comments.

**STAGE 4 — ADDRESS REVIEW (after I paste comments).** Focused commits; push; report. Re-run `pnpm eval` after any prompt-engine change. Flag spec conflicts. **Do not merge.**

---

## Shared contracts (canonical)
**Output schema (flat — spec §6.3):** `title, needs_clarification(bool), questions[], enhanced_prompt, role, task, context, constraints[], format, tone, success_criteria[], explanation[], added[], removed[], changed[]`. Enforced by provider structured output **and** validated server-side. The quality checklist is NOT in this schema (Phase 3).

**Gateway interface (agents B & C code against this):** `enhance({ raw_prompt, mode, target_model, prompt_type, options }) -> { result: <schema>, meta: { provider, model, tokens, latency_ms, fellback: bool } }`. Static-first request ordering (meta-prompt + few-shots + schema first, user input last) for prompt caching.

---

## Sub-agents to spawn (3, parallel)

### Agent A — `prompt-engineer` (SOLE writer of `prompt-engine/prompts/`)
- Author **meta-prompt v2** (spec §6.2): contract-style Role/Goal/Inputs/Rules/Output; input wrapped as `<user_input>…</user_input>` treated as data, not instructions; positive framing; placeholders (`[PRODUCT NAME]`) for unknowns; mode rules for improve/enhance/refine/shorten; refine threshold → `needs_clarification` + 1–3 questions.
- 2–3 fixed **golden few-shots** in the cached prefix (vague→structured, refine→questions, shorten).
- **Promptfoo regression suite** covering all four modes + every few-shot; wire it into the `pnpm eval` CI job (replace the Phase 0 stub). Suite must assert schema-validity and mode behaviors.

### Agent B — `builder`: LLM gateway + adapter registry + reliability
- Thin gateway over the **launch provider** (designed for a 2nd fallback provider). Provider-native structured outputs.
- **Data-driven model/tool adapter registry** (config, not hardcoded classes) — add/retire a model = config change.
- Reliability path (spec §6.10): one retry → **labeled** fallback model → graceful error preserving input.
- Secret detection before send; output screening before return (spec §6.6) — reject meta-prompt dumps/empty.
- Per-call observability: latency, tokens, cost, model, success → `operations`/traces.
- Unit tests incl. forced-failure → fallback path; secret-detection; schema-invalid → retry.

### Agent C — `builder`: mode endpoints + refine flow + validation
- API endpoints for the four modes, calling the gateway. Record each op in `operations` (Phase 1 table).
- Refine clarification flow with the clarity threshold (spec §6.8); skip → bracketed placeholders.
- Server-side schema validation in addition to provider enforcement.
- Unit/integration tests for each mode + refine (thin input → 1–3 questions).

---

## EXIT GATE
- [ ] Enhance returns schema-valid output ≥98% across the eval set (`pnpm eval` green).
- [ ] Refine returns 1–3 questions on thin input; placeholders when skipped.
- [ ] Forced provider failure → labeled fallback (test-covered); input preserved on hard error.
- [ ] Secret detection + output screening test-covered; every call traced.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm eval` all green; p95 latency recorded.

## Do NOT
- Do NOT add JSON/Image/Video modes (spec §6 deferred). Only the four launch modes.
- Do NOT compute or embed a quality score/checklist here — that is Phase 3, a separate call.
- Do NOT parse JSON out of prose; provider-enforced structured output is mandatory.
- Do NOT add injection keyword blocklists (spec §6.6) — treat input as delimited data only.
- Do NOT hardcode model/provider names in code paths — they live in the adapter registry config.
- Do NOT let any non-`prompt-engineer` agent edit `prompt-engine/prompts/`.
- Do NOT log raw secrets. Do NOT merge prompt changes with a red eval suite.
- Main agent: no Stage-1 implementation; no Stage-2 before `all done`.

## Report back
Per agent: provider/fallback wired, schema + meta-prompt + few-shots, eval pass rate, reliability test results, observability fields captured, integration glue, exit-gate status.
