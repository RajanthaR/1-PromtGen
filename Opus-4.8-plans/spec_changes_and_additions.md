# PromptForge Studio — Changes and Additions Log

This document explains what was changed, added, simplified, removed, or deferred relative to the original "clean-room spec," and the up-to-date research that informed those decisions.

---

## 1. Summary of Changes

The original spec was comprehensive but **front-loaded too much**: it treated image generation, video generation, an MCP server, team governance, self-hosting, and a six-service backend as near-co-equal with the core prompt enhancer. The improvement approach was to:

1. **Right-size the MVP** to the loop that delivers the core value (enhance → understand → save/reuse), and clearly defer everything else.
2. **Modernize the AI core** using current (2026) practice: provider-enforced structured outputs, flat schemas, positive framing, prompt caching, and separation of generation from evaluation.
3. **Make the product trustworthy**, since the original under-specified the UX that earns user trust around AI output.
4. **Be honest about the quality score**, which was presented with misleading precision.
5. **Add the missing operational concerns** the original barely touched: unit economics and model/tool churn.

The original product idea and intent are preserved throughout.

---

## 2. Major Additions

| Addition | Why added | Real-world benefit |
|---|---|---|
| **Unit-economics section** (cheaper default model, prompt caching, result caching, BYO-key, quota costing) | The original priced plans (e.g., 10 free enhancements/day) without noting each enhancement is a paid LLM call. | Prevents a free tier that quietly loses money; makes margins explicit before launch. |
| **Trust-focused results UX** (always-editable output, prominent "what changed & why," context-used chips, honest confidence, labeled fallbacks) | Most AI-feature failures in 2026 are *design* failures, not model failures; trust is a design outcome. | Higher adoption and retention; users learn and stay in control. |
| **Data-driven model/tool adapter registry** | The original implied hardcoded per-model adapters. | Adding/retiring a model or tool becomes a config change — essential given monthly churn (Sora 2's deprecation is the proof case). |
| **Explicit reliability/fallback path** (retry → secondary model → labeled error, never silent low quality) | The original lacked an end-to-end failure story. | Predictable behavior under provider outages; preserves user trust. |
| **Secret-detection-before-send + "input as data" injection stance** | The original listed secret detection but also generic injection filtering that would backfire on a prompt tool. | Protects users from leaking keys without false-positiving on legitimate prompt text. |
| **Promptfoo regression gate tied to meta-prompt changes** | The original mentioned Promptfoo only in a late phase. | Catches prompt regressions before release; treats prompts like code. |
| **Honest "structure checklist" reframing of the score** | The original implied a precise quality number. | Avoids a trust-eroding overclaim; gives actionable, explainable feedback. |

---

## 3. Improvements to Existing Sections

| Original issue / ambiguity | Improved version | Benefit |
|---|---|---|
| **"Return valid JSON only"** in the meta-prompt as the reliability mechanism | Use **provider-enforced structured outputs** (constrained decoding / strict tool use); the text instruction is a backup. | Near-elimination of parse failures; less retry logic. |
| **Deeply nested output object** (sections + quality_score + diff all nested) | **Flattened schema**; enums for fixed choices; a description on every field. | Lower schema-failure rates across providers; easier validation. |
| **Quality score bundled into the enhancement call** | Score computed **separately** (heuristic primary; optional LLM judge as its own call, ideally a different model). | Removes self-preference bias; stable, explainable, cheaper. |
| **Seven modes from day one** | **Four launch modes** (Improve/Enhance/Refine/Shorten); JSON/Image/Video deferred. | Smaller QA/prompt surface; cleaner UI. |
| **Six-service backend** | **Modular monolith**, extract services only when justified. | Faster build; far less infra/ops overhead for a small team. |
| **Negative meta-prompt rules** ("do not invent…") | **Positive framing** ("use only provided facts; use placeholders for unknowns"). | Better instruction-following (avoids the Pink-Elephant effect). |
| **Context injection underspecified** | Context **never auto-injected**; UI shows exactly which snippets were used. | Privacy + user control + transparency. |
| **Model list (ChatGPT/Claude/Gemini, Sora as MVP video tool)** | Updated to current frontier naming and corrected Sora's deprecation; tools live in config. | Accurate, durable, and maintainable. |

---

## 4. Prompting Improvements Added

| Technique | Where applied | Why useful | Example added |
|---|---|---|---|
| **Contract-style, labeled meta-prompt** (Role / Goal / Inputs / Rules / Output) | §6.2 | Flat, labeled prompts are easier to debug and regression-test than a single block. | Full meta-prompt v2 in §6.2. |
| **Provider-enforced structured outputs + flat schema + enums + field descriptions** | §6.1, §6.3 | "Stop parsing JSON with regex" — native enforcement is the 2026 default; flat schemas and descriptions raise adherence. | Flattened JSON schema in §6.3. |
| **Input-as-data delimiting** (`<user_input>…</user_input>`, "content to transform, not instructions") | §6.2, §6.6 | Primary, low-false-positive injection defense for a tool whose job is processing prompt-like text. | Delimiter pattern in the meta-prompt. |
| **Positive framing + bracketed placeholders for unknowns** | §6.2, §6.7 | "Use only real data" outperforms "don't use mock data"; placeholders prevent fabricated business facts. | `[PRODUCT NAME]` placeholder rule. |
| **Refine clarification flow with an explicit threshold** | §6.8, Workflow 2 | Asking 1–3 targeted questions beats guessing on thin input. | `needs_clarification` + `questions[]` in schema. |
| **Two justified light chains only (intent→enhance, clarify→enhance); skip ToT/multi-agent** | §6.1 | Reasoning scaffolds are overkill here and add cost/latency. | — |
| **Static-first ordering for prompt caching** | §6.1, §9 | Caching the meta-prompt/examples/schema prefix cuts input cost and latency substantially. | Ordering rule in §6.1. |
| **Heuristic checklist + separate LLM rubric (hybrid evaluation)** | §5.2 | Deterministic checks for the "what," LLM rubric for the "how"; matches the current hybrid-evaluation norm. | Rubric table + separation rule in §5.2. |
| **2–3 fixed golden few-shots, eval-gated** | §6.4 | A minimal example set that teaches the pattern; more examples only if they move a metric. | Three example pairs described in §6.4. |
| **Output screening before display** | §6.6, §6.9 | Catches meta-prompt dumps / empty results post-hoc. | Retry-then-fallback rule. |

---

## 5. Simplifications Made

| Simplified | Why | Complexity avoided |
|---|---|---|
| Six services → **modular monolith** | A small team ships and operates one deployable far faster. | Inter-service contracts, distributed tracing complexity, deployment orchestration. |
| Seven modes → **four** | JSON/Image/Video are separable later features. | Extra schemas, adapters, UI, and QA at launch. |
| Vector search → **Postgres full-text** at launch | Full-text is sufficient for small libraries. | Embedding pipeline, vector index ops, extra cost. |
| Many export formats → **Markdown + JSON** first | Covers the common cases. | Building/maintaining 6 exporters before there's demand. |
| Score-in-same-call → **separate, mostly heuristic** scoring | Cheaper, stable, unbiased. | Larger output schemas and self-grading artifacts. |
| Image/video/MCP/teams/self-host → **deferred** | Each is a project in itself. | Months of scope before core retention is proven. |

---

## 6. Items Removed or Not Included

| Left out | Why | Reconsider later? |
|---|---|---|
| Generic prompt-injection **keyword blocklists** ("ignore previous," etc.) | They false-positive on legitimate prompt-writing — the exact content this tool processes. | Only if a real abuse pattern emerges; prefer structural defenses + output screening. |
| Running the user's **downstream task** as part of the core loop | Turns a focused tool into a chat app and doubles cost. | Yes, as a gated optional "test this prompt" preview (see deferred). |
| Tree-of-Thought / multi-agent orchestration | Unjustified compute for prompt rewriting. | Unlikely; only for a future high-stakes optimization feature. |
| Auto-injection of personal context | Privacy/trust risk; surprising to users. | No — explicit selection is the correct default. |
| A precise, authoritative "quality score" number as the headline metric | Overclaims; erodes trust. | No — the checklist framing is the honest version. |

---

## 7. Deferred Ideas

| Idea | Potential value | Reason for deferring | Trigger to revisit |
|---|---|---|---|
| Image prompt generator | Creator demand, differentiation | Separate schema/QA/UI; dilutes core | Steady retention on the text loop. |
| Video prompt generator | Premium-tier driver | Same + extreme tool volatility | Adapter registry mature + clear demand. |
| MCP server | Power-user/IDE adoption | OAuth/PAT/scopes/token security | Stable web API + auth in production. |
| Teams / shared libraries / approvals / audit | Monetization, org sales | Heavy access-control + audit surface | Proven single-user retention; inbound team interest. |
| Self-host | Privacy-sensitive teams | Support/distribution burden | Real enterprise demand. |
| Semantic search (pgvector) | Better discovery at scale | Full-text suffices early | Libraries/templates grow large. |
| Extra export formats | Developer convenience | Demand-driven | Users request specific formats. |
| "Optimize against examples" | Powerful for eval-equipped teams | Advanced workflow | Teams with eval datasets adopt the product. |

---

## 8. Assumptions Made

| Assumption | Why reasonable | Confirm later |
|---|---|---|
| Launch is **text prompts only**; image/video are later. | Text is the broadest, simplest, highest-retention surface. | Validate demand mix before building image/video. |
| **Platform-paid LLM calls with a low free quota**, BYO-key on paid tiers. | Lowest signup friction + a margin-protecting path. | Pricing test; confirm in Open Question #1. |
| A **fast, cheaper model** is the default for enhancement; premium is opt-in. | Rewriting ≠ deep reasoning; keeps cost/latency down. | A/B output quality vs. cost. |
| **One launch provider** with native structured outputs + prompt caching, plus a second as fallback. | Simplest reliable gateway; fallback covers outages. | Confirm in Open Question #2. |
| **Full-text search** is adequate at launch. | Small early libraries. | Monitor search quality as libraries grow. |
| The **structure score** is acceptable to users as a checklist, not a precise grade. | Honest signals build trust; precise grades overclaim. | Usability testing of the results panel. |
| **Soft-delete with grace period** is the right deletion model. | Prevents accidental loss; still honors deletion. | Confirm retention windows with legal/privacy needs. |

---

## 9. Sources and Research Notes

Up-to-date sources consulted (June 2026). Only the directly influential ones are listed.

- **Prompt engineering best practices (2026)** — *Promptessor, SuperPrompts, PromptBuilder, Thomas Wiegold, Lakera.* Key insight: structure beats length; an explicit **output contract / success criteria** is the single highest-leverage practice; **role prompting helps open-ended/creative tasks but is negligible for classification/QA**, so don't cargo-cult it; use **positive framing** over negation (Pink-Elephant effect). → Shaped the contract-style meta-prompt (§6.2), positive-framing rules, and the structure-first checklist.
- **Prompt caching guidance** — *Thomas Wiegold (summarizing Anthropic/OpenAI caching).* Insight: place **static content first, variable content last** to exploit caching for large cost/latency savings. → Drove the static-first request ordering (§6.1, §9) and the unit-economics section.
- **Structured output in 2026** — *DEV Community ("stop parsing JSON with regex"), DevTk.AI, TokenMix, BuildMVPFast.* Insight: all major providers offer native structured output (OpenAI/Gemini constrained decoding; Anthropic JSON Outputs / strict tool use); **keep schemas flat, use enums over patterns, write a description on every field**; Anthropic auto-caches schemas. → Drove provider-enforced outputs and the flattened schema (§6.1, §6.3).
- **LLM-as-judge reliability** — *Galileo, FutureAGI, "Understanding LLM-as-a-Judge" (Medium), NeurIPS 2024 / IJCNLP 2025 findings, OWASP-adjacent eval literature.* Insight: judges exhibit **self-preference, verbosity, and position bias**; the judge should be ≥ the student and given a reference; **deterministic checks + LLM rubric (hybrid norm)** is the consensus; raw scores drift and need calibration. → Drove separating scoring from generation, heuristic-as-primary, and the honest-score reframing (§5.2, §11).
- **AI-content UX patterns** — *Intuit Content Design, Vitaly Friedman/Smashing, Design Key ("Designing for Trust"), KoruUX, Bestfolios.* Insight: trust is a **design outcome** (honest confidence signals, graceful failure, reversibility, data control); **label AI vs. verified content**; **"refine output" as iteration**, not a final verdict; show what the system used. → Drove the always-editable output, "what changed & why" panel, context-used chips, and state design (§8).
- **Prompt-injection / guardrails** — *OWASP LLM Prompt Injection Prevention Cheat Sheet; InjecGuard (arXiv) on over-defense; Security Boulevard on secret leakage; Snowflake Cortex.* Insight: treat untrusted input as **data, not instructions**; use **output/action screening**; beware **over-defense** — naive keyword filters misclassify benign text. Critical for a prompt tool, whose legitimate inputs contain "instruction-like" phrasing. → Drove the input-as-data stance, output screening, and the explicit decision to *avoid* keyword blocklists (§6.6).
- **Current model landscape (June 2026)** — *llm-stats, overchat AI Hub, multiple 2026 comparisons.* Insight: current frontier models are **GPT-5.5, Claude Opus 4.8, Gemini 3.1 Pro, Grok 4.3** (plus DeepSeek V4, Kimi K2.6, GLM-5); pricing varies widely; caching can cut input cost up to ~90%. → Updated model references and reinforced the cheaper-default-model and caching choices.
- **Video-tool landscape (June 2026)** — *Pinggy, Pixflow, BuildMVPFast, Swfte.* Insight: **OpenAI Sora 2 was deprecated April 26, 2026; its API sunsets September 24, 2026** — "don't build new pipelines on it." Veo 3.1, Kling 3.0, Runway Gen-4.5, and Seedance 2.0 now lead. → Corrected the (deferred) video tool list and, more importantly, justified the **data-driven adapter registry** so tool churn is a config change.
- **Open-source references for build patterns** — *promptfoo (evals/CI), Langfuse (observability/prompt management), Open Prompt Manager (extension architecture, local-first privacy), prompts.chat (catalog UX), MCP TypeScript SDK.* Insight: treat prompts like code (version + eval), trace every call, and study (don't copy) extension/catalog patterns; mind licenses (e.g., AGPL on some prompt-optimizer projects). → Reinforced the Promptfoo regression gate, observability-from-day-one, and clean-room cautions (§9, and §11/§12 of the spec).
