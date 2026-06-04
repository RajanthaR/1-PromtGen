# PromptForge Studio — Phased Development Plan

*The build sequence Claude uses to break work into Codex prompt packets. Each phase has a goal, an exit gate, and a sub-agent fan-out plan that respects the 6-thread Codex cap (see [Codex Operations Manual](CODEX_OPERATIONS_MANUAL.md)).*

> Source of truth for scope: [`improved_web_app_spec.md`](../Opus-4.8-plans/improved_web_app_spec.md). Nothing in *Non-Goals* (§2) or *Deferred* (§12) is built in these phases.

---

## Phase map at a glance

| Phase | Theme | Core deliverable | Max parallel agents |
|---|---|---|---|
| 0 | Foundations | Repo, tooling, CI, config, AGENTS.md, agent roster | 1–2 |
| 1 | Backend skeleton + data | Modular monolith, Postgres schema, auth | 3 |
| 2 | LLM gateway + core enhance loop | Provider-enforced enhance, schema, eval gate | 2–3 |
| 3 | Quality checklist | Deterministic checklist + optional judge | 2 |
| 4 | Frontend core | Editor + trust-surface results UX | 3 |
| 5 | Library / history / context / templates | Persistence & reuse features | 4 |
| 6 | Economics, reliability, hardening, launch | Billing/quotas, caching, observability, a11y, security | 4 |

The cap is 6; we deliberately stay under it. Parallelism is used only for genuinely independent modules.

---

## Phase 0 — Foundations

**Goal:** A clean, reproducible repo where Codex can work safely and consistently.

**Deliverables**
- `AGENTS.md` at repo root encoding the standing instructions (manual §4) + UX rules (§5).
- `.codex/agents/*.toml` for the six-agent roster (manual §3).
- `.codex/config.toml` baseline: `[agents] max_threads = 6, max_depth = 1, job_max_runtime_seconds = 1800`.
- Monorepo layout decision: `apps/web` (Next.js) + `apps/api` (modular monolith) or a single Next.js app with route handlers — **Claude decides at packet time**; default to a Turborepo-style monorepo.
- Tooling: TypeScript, ESLint, Prettier, package manager (pnpm), env handling, `.env.example`.
- CI: lint + typecheck + unit tests on PR. Promptfoo job stubbed (wired in Phase 2).
- `README.md` quickstart.

**Sub-agent plan:** Serial. `builder` scaffolds; `reviewer` checks. No fan-out.

**Exit gate:** `pnpm install && pnpm lint && pnpm typecheck` pass on a clean checkout; CI green on an empty PR.

---

## Phase 1 — Backend skeleton + data layer + auth

**Goal:** The modular monolith stands up with persistence and authentication; no AI yet.

**Deliverables (spec §7, §9)**
- Module boundaries as folders/packages: `auth-billing`, `prompt-engine` (stub), `library-templates`, `context`, `history-usage`.
- PostgreSQL via a typed query layer (Prisma or Drizzle — Claude picks). Migrations checked in.
- Schema for: users, prompts, prompt_versions (immutable, soft-delete), tags, folders, context_snippets, templates, history/operations, usage_events, plans/quotas. Postgres **full-text** search indices (no pgvector).
- Auth (email + OAuth provider), sessions, per-user data isolation.
- Redis wired for caching/rate-limit primitives (unused logic until later).
- Health endpoint + structured logging baseline.

**Sub-agent plan:** Parallel ≤3 — `builder` (auth-billing), `builder` (data/schema + migrations), `explorer` to map relationships first; `reviewer` after merge. Counts ≤6.

**Exit gate:** Migrations apply on a fresh DB; auth login/logout works in a smoke test; data isolation covered by a test (user A cannot read user B's rows).

---

## Phase 2 — LLM gateway + core enhance loop (the heart)

**Goal:** Ship Workflow 1 (Enhance) and Workflow 2 (Refine) end to end on the API, with provider-enforced structured output and a passing eval gate. **This is the product.**

**Deliverables (spec §6 in full)**
- **LLM gateway** abstraction over one launch provider, designed for a second fallback provider. Static-first request ordering for prompt caching.
- **Data-driven model/tool adapter registry** (config, not hardcoded classes) — adding/retiring a model is a config change.
- Meta-prompt v2 (spec §6.2), **flat output schema** (spec §6.3), enums + per-field descriptions, provider-enforced structured output + server-side schema validation.
- Four modes: **Improve, Enhance, Refine, Shorten** (no JSON/Image/Video).
- Refine clarification flow with the clarity threshold (spec §6.8); placeholders for unknowns.
- 2–3 golden few-shots in the cached prefix (spec §6.4).
- Reliability path: one retry → labeled fallback model → graceful error preserving input (spec §6.10).
- Secret detection before send; output screening before return (spec §6.6).
- **Promptfoo regression suite** covering every few-shot + the four modes, wired into CI as a **merge gate for any prompt change**.
- Per-call observability: latency, tokens, cost, model, success (spec §9).

**Sub-agent plan:** `prompt-engineer` owns meta-prompt/schema/few-shots/evals (sole writer of `prompt-engine/prompts/`). `builder` owns gateway + adapter registry + endpoint wiring. Serial-ish with one parallel pair (2–3 threads); `reviewer` mandatory; **no merge without Promptfoo green.**

**Exit gate:** Enhance returns schema-valid output ≥98% across the eval set; Refine returns 1–3 questions on thin input; fallback path exercised by a test; p95 latency tracked. Spec §10 "Prompt enhancer" + "Refine" + "Reliability" criteria met.

---

## Phase 3 — Quality checklist (structure score)

**Goal:** Honest, reproducible structure checklist — computed separately from generation (spec §5.2, §11).

**Deliverables**
- **Deterministic heuristic checklist** (primary signal): the 7 dimensions in spec §5.2, each pass/partial/missing with a one-line reason + a "fix it" suggestion; reproducible for identical input.
- Optional **LLM rubric** as its **own call, ideally a different model family** than the generator (anti self-preference). Output shown as suggestions, never a competing number.
- "Structure score" rollup clearly labeled; UI copy must not imply it predicts output quality.

**Sub-agent plan:** Serial. `builder` (heuristic, fully unit-tested) → `prompt-engineer` (optional judge call + its eval) → `reviewer`. ≤2 threads.

**Exit gate:** Score reproducible on identical input (test-locked); every non-passing item has a reason; judge runs as a separate model call. Spec §10 "Quality checklist" met.

---

## Phase 4 — Frontend core (editor + trust surface)

**Goal:** The Editor home page delivers the enhance/refine loop with the trust-surface UX.

**Deliverables (spec §8)**
- Next.js + React + TS + Tailwind + shadcn/ui editor: target/mode/tone selectors, original textarea, action buttons, streamed results.
- Results area: side-by-side original vs. enhanced, **always-editable** output, **"what changed & why"** panel default-on, per-item checklist with reasons + "apply suggestion," **context-used chips**.
- States: streaming/loading (honest dull text), empty (sample prompt), error (preserves input, Retry, labeled fallback), confirmations with undo, Refine question form (skippable).
- Streaming for perceived speed; optimistic UI for save/tag (save wired in Phase 5).

**Sub-agent plan:** `frontend` (editor + results), `frontend`/`builder` (streaming + state plumbing), `reviewer`. Parallel ≤3.

**Exit gate:** A user can enhance and refine a prompt entirely in the UI; all spec §8 states render; keyboard + screen-reader smoke test passes (full a11y audit in Phase 6).

---

## Phase 5 — Library, history, context, templates

**Goal:** The reuse layer — save, organize, reuse (Workflows 3 & 4).

**Deliverables (spec §5.3–§5.6)**
- **Personal prompt library:** save/edit/duplicate/version/tag/folder/pin/search; immutable versions with change notes; non-destructive restore; soft-delete + grace period; copy as Markdown/JSON.
- **Prompt history:** auto-record per operation with the spec §5.5 fields; plan-based retention (Free 50 / Pro 500 / Advanced unlimited); user-deletable; "send to editor."
- **Personal context library:** create/edit/delete snippets; selected only explicitly; result panel lists snippets used; unselected context never sent.
- **Template library:** 50–100 **original** templates across the spec §5.3 categories; full-text + tag + tool + difficulty filters + recently-used; variable fill with required-field validation.

**Sub-agent plan:** Parallel ≤4 — `builder` (library+versioning), `builder` (history+retention), `builder`/`frontend` (context + templates UI), `test-runner`; `reviewer` after. ≤6 threads.

> **Note on templates:** the 50–100 original templates are **content**, not code. Claude drafts/curates these (optionally using a Skill); Codex wires them in. Do not import third-party prompt libraries verbatim (spec §11/§12).

**Exit gate:** Spec §10 "Library & history" criteria met; restore preserves newer versions; unselected context provably never reaches the model (test).

---

## Phase 6 — Economics, reliability, hardening, launch

**Goal:** Make it operable, affordable, accessible, and safe to launch.

**Deliverables (spec §5.5, §7, §9, §11, §13)**
- **Billing & plans:** Free/Pro/Advanced; quota enforcement; optional **BYO-key** on paid tiers; Settings/Billing page (plan, usage, data export, account deletion).
- **Unit economics:** cheaper default model confirmed; provider prompt caching via static-first ordering; brief result caching on identical (input+mode+model); per-user rate limits.
- **Free-tier abuse controls** (Open Question #3): per-user limits + email verification; decide IP/workspace limits.
- **Observability dashboards:** per-call traces aggregated into cost/latency/quality views.
- **Security pass:** data isolation re-verified, encrypted secrets at rest, secret-detection coverage, no-training-without-opt-in enforced, sub-processor disclosure copy.
- **Accessibility audit:** full WCAG 2.1 AA conformance.
- **Privacy:** data export + account deletion flows; soft-delete purge job.

**Sub-agent plan:** Parallel ≤4 — `builder` (billing/quotas), `builder` (caching/rate-limit/observability), `frontend` (settings/billing + a11y fixes), `reviewer`/`explorer` (security audit, read-only). ≤6 threads.

**Exit gate:** Quotas enforced and tested; caching demonstrably reduces input cost on repeats; a11y audit passes; security checklist (spec §9) signed off; export + deletion work.

---

## Open questions to resolve before/within Phase 2 & 6 (spec §13)

1. **Economics model** — platform-paid + low free quota vs. BYO-key vs. both (drives gateway design). *Recommendation: platform-paid low free quota + BYO-key on paid tiers.* → settle before Phase 2 gateway.
2. **Launch provider + fallback** — which single provider first; which fallback. → settle before Phase 2.
3. **Free-tier abuse policy** — per-user vs per-IP vs per-workspace + email verification. → settle within Phase 6.

These are **Claude/operator decisions**, not Codex's. Codex implements the chosen answer.

---

## How phases become prompt packets

For each phase, Claude emits ordered packets in the format from manual §6. Default rhythm per packet: **scope → implement (builder/specialist) → review (reviewer) → Claude verifies gate → commit**. Parallel fan-out only where the phase table above allows it, never exceeding 6 threads.
