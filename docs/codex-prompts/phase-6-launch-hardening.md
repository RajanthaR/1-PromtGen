# Phase 6 — Economics, reliability, hardening, launch (Codex main-agent prompt)

> Paste to the Codex **main agent**. Spawn → wait for `all done` → integrate/test → PR → stop → address review. Protocol: `docs/CODEX_OPERATIONS_MANUAL.md` §7b.

---

## Context to read first
- `Opus-4.8-plans/improved_web_app_spec.md` — §5.5, §7, §9, §11, §13.
- `docs/PHASED_PLAN.md` — Phase 6.
- `docs/CODEX_OPERATIONS_MANUAL.md` — §3, §4, §5, §7b, §8.

## Preconditions
Phases 1–5 merged: full product loop + reuse layer live.

## Settled decisions (implement as fact)
- **Free-tier abuse policy: per-user limits + email verification.** No per-IP or per-workspace limits at launch.
- **Economics:** platform-paid + low free quota; **BYO-key on paid tiers** (implement the BYO-key path here).

## Goal
Make it operable, affordable, accessible, and safe to launch: billing/quotas, caching, observability, accessibility, security, privacy.

## Branch
Create and check out `phase-6/launch-hardening` off `main`.

---

## OPERATING PROTOCOL — follow exactly

**STAGE 1 — SPAWN & WAIT (now).** Read context (abuse policy + economics are settled above), create branch, spawn the four sub-agents below **in parallel**. Each does ALL its own work + tests. **You do not implement, commit, or open anything.** **STOP and WAIT** until `all done`. Do not poll.

**STAGE 2 — INTEGRATE & TEST (after `all done`).** Wire glue only — **including addressing Agent D's security/privacy findings** (fix them, or list any you defer with justification). Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm eval`, e2e. Fix failures. Verify EXIT GATE. Commit small/conventional.

**STAGE 3 — OPEN PR & STOP.** Push; open PR via `gh` titled `Phase 6: economics, reliability & launch hardening`; body = summary + checked exit gate + the security/privacy findings + how each was resolved. **STOP** for review comments.

**STAGE 4 — ADDRESS REVIEW (after I paste comments).** Focused commits; push; report. Flag spec conflicts. **Do not merge.**

---

## Sub-agents to spawn (4, parallel)

### Agent A — `builder`: billing, plans, quotas, privacy flows
- Free/Pro/Advanced plans; **per-user quota enforcement**; **email verification** required to use the free tier (abuse policy); **BYO-key** on paid tiers; Settings/Billing backend.
- **Data export** + **account deletion**; **soft-delete purge job** (grace-period expiry).
- Tests: quota blocks at limit; BYO-key path; export completeness; deletion removes user-scoped data.

### Agent B — `builder`: caching, rate limits, observability
- Provider **prompt caching** via static-first ordering (verify cache hits); brief **result cache** on identical (input+mode+model); per-user **rate limits** (Redis).
- Observability aggregation/dashboards over per-call traces (cost/latency/quality).
- Tests: cache hit reduces input tokens on repeat; rate limit triggers; metrics aggregate.

### Agent C — `frontend`: Settings/Billing UI + accessibility
- Settings/Billing page (plan, usage, BYO-key, export, delete).
- **Full WCAG 2.1 AA audit & fixes** across all pages (keyboard, focus, contrast, labels, SR announcements for streamed results, no color-only signals).
- Tests + a11y assertions (axe or equivalent).

### Agent D — `explorer` (READ-ONLY): security & privacy audit
- Audit and **report** (no edits): per-user data isolation re-verified, secrets encrypted at rest, secret-detection coverage, **no-training-without-opt-in** enforced, sub-processor disclosure copy present, rate-limit/abuse coverage.
- Output a prioritized findings list for the main agent to fix in Stage 2.

## EXIT GATE
- [ ] Quotas enforced + tested; BYO-key works; export + account deletion work; purge job runs.
- [ ] Caching demonstrably reduces input cost on repeats; rate limits enforced.
- [ ] WCAG 2.1 AA audit passes.
- [ ] Security findings (Agent D) resolved or explicitly deferred with reason.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm eval` green.

## Do NOT
- Do NOT train on user data without explicit opt-in; do NOT log raw secrets.
- Do NOT weaken per-user isolation for any feature.
- Do NOT add MCP server, team workspaces, self-host, or semantic search (spec §12 — still deferred).
- Do NOT let Agent D edit code — it audits and reports only (read-only).
- Do NOT silently ship a security finding — fix or document it in the PR body.
- Main agent: no Stage-1 implementation; no Stage-2 before `all done`.

## Report back
Per agent: billing/quota behavior, caching/rate-limit evidence, a11y audit result, the full security findings list + resolution status, integration glue, exit-gate status.
