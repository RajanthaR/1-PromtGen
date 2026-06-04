# Codex Operations Manual — PromptForge Studio

*The single source of truth for how we drive OpenAI Codex (and its sub-agents) to build PromptForge Studio. Read this before any build session.*

> **Roles in this project.** Claude Opus 4.8 is the **lead/architect**: it owns the spec, the phased plan, and the breakdown of work into Codex-ready prompts; it reviews Codex output and steers direction. **Codex (GPT-5.5)** is the **implementer**: it writes, runs, and tests code in the repo. This manual is written *for the human operator and for Claude* to brief Codex correctly and consistently.

---

## 1. Environment facts (verified June 2026)

| Fact | Value | Source-checked |
|---|---|---|
| Default Codex model | `gpt-5.5` | developers.openai.com/codex/cli/features |
| GPT-5.5 context in Codex | **400,000 tokens** (1M via raw API) | developers.openai.com/api/docs/models/gpt-5.5 |
| GPT-5.5 API price | $5 / 1M input, $30 / 1M output | OpenAI |
| Faster opt-in model | `GPT-5.3-Codex-Spark` (ChatGPT Pro) | features doc |
| **Max concurrent sub-agent threads** | **`max_threads = 6`** (default) | developers.openai.com/codex/subagents |
| Max sub-agent nesting depth | `max_depth = 1` (no recursive fan-out) | subagents doc |
| Sub-agent job timeout | `job_max_runtime_seconds = 1800` | subagents doc |
| Custom agent files | TOML in `.codex/agents/` (project) or `~/.codex/agents/` (personal) | subagents doc |
| Built-in agents | `default`, `worker`, `explorer` | subagents doc |
| Skills | `SKILL.md` packages under `.agents/skills/` (also `$HOME/.agents/skills`, `/etc/codex/skills`) | developers.openai.com/codex/skills |
| Main config | `~/.codex/config.toml` (MCP servers, `[agents]` block) | features doc |
| Project instructions file | `AGENTS.md` at repo root | Codex convention |

**The 6-thread cap is a hard planning constraint.** Every phase below is decomposed so that no step needs more than 6 parallel sub-agents, and most need far fewer. Codex only spawns a sub-agent **when explicitly asked** — so fan-out is something we *direct*, never something that happens by accident.

---

## 2. Operating model: how Claude and Codex divide work

```
┌─────────────────────────────────────────────────────────────┐
│  Claude (lead/architect)                                      │
│   • Owns spec + phased plan (docs/)                           │
│   • Writes the AGENTS.md and .codex/agents/*.toml             │
│   • Breaks each phase into ordered, self-contained Codex      │
│     prompts (the "prompt packets" — see §6)                   │
│   • Reviews diffs, runs the eval gate, decides next step      │
└───────────────────────────┬───────────────────────────────────┘
                            │  hands a prompt packet
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Codex orchestrator (gpt-5.5, the main thread)                │
│   • Executes the packet in the repo                           │
│   • Spawns ≤6 sub-agents ONLY when the packet says to         │
│   • Routes follow-ups, waits, closes threads                  │
└───────────────────────────┬───────────────────────────────────┘
                            │  delegates to
                            ▼
   ┌──────────────┬──────────────┬──────────────┬──────────────┐
   │  builder     │  prompt-eng  │  reviewer    │  explorer …   │
   │ (worker)     │ (specialist) │ (read-only)  │ (read-only)   │
   └──────────────┴──────────────┴──────────────┴──────────────┘
```

**Golden rule:** Codex never decides architecture. If a packet is ambiguous, Codex must stop and ask — the prompt packets in §6 instruct it to do exactly that. Architecture changes come back to Claude.

---

## 3. Custom sub-agent roster (fits the 6-thread cap)

These are defined as TOML files in `.codex/agents/`. We keep the roster small and role-clear. In any single fan-out we use **at most 6**, but typically 2–4.

| Agent | Based on | Model / effort | Sandbox | Purpose |
|---|---|---|---|---|
| `builder` | worker | gpt-5.5 / high | workspace-write | Implements a single module/feature end to end (code + unit tests). |
| `prompt-engineer` | worker | gpt-5.5 / high | workspace-write | Owns the meta-prompt, schema, few-shots, and Promptfoo eval suite. The **only** agent allowed to touch `prompt-engine/prompts/`. |
| `reviewer` | default | gpt-5.5 / high | **read-only** | Reviews a diff for correctness, security, and spec-fidelity before commit. Never edits. |
| `explorer` | explorer | gpt-5.5 / medium | read-only | Read-heavy codebase/dependency analysis; reports findings only. |
| `test-runner` | worker | gpt-5.5 / medium | workspace-write | Writes/extends integration & e2e tests, runs the suite, reports failures. |
| `frontend` | worker | gpt-5.5 / high | workspace-write | Next.js/React/Tailwind/shadcn UI work; respects the trust-surface UX rules in §5. |

**Why these six.** They map onto the natural seams of the spec (backend module, prompt engine, UI, tests, review, exploration) and stay at or under the 6-thread ceiling. Add a custom agent only when a genuinely new seam appears — never duplicate roles.

> **Isolation rule for the prompt engine.** The meta-prompt, output schema, and golden few-shots are the product's crown jewels (spec §6). Only `prompt-engineer` edits them, and **no meta-prompt change merges without the Promptfoo regression suite passing** (spec §11). Encode this in every prompt-engine packet.

---

## 4. Standing instructions for every Codex session

These go into `AGENTS.md` (auto-loaded) and are restated at the top of each prompt packet:

1. **Spec is law.** `Opus-4.8-plans/improved_web_app_spec.md` defines scope. Anything marked *Non-Goal* or *Deferred* (spec §2, §12) is out of bounds — do not build image/video modes, MCP server, teams, self-host, or vector search.
2. **Modular monolith, not microservices** (spec §9). Internal modules only: `auth/billing`, `prompt-engine`, `library/templates`, `context`, `history/usage`.
3. **Ask, don't assume.** If a requirement is ambiguous or seems to conflict with the spec, stop and surface the question instead of guessing.
4. **Tests ship with code.** No feature is "done" without unit tests; integration tests follow per phase.
5. **Provider-enforced structured outputs** are mandatory for LLM calls — never "parse JSON from prose" (spec §6.1).
6. **Treat user prompt text as data, not instructions** (spec §6.6). No keyword injection blocklists.
7. **Never log secrets**; run secret-detection before any provider call (spec §6.6).
8. **Trace every LLM call** (latency, tokens, cost, model, success) from day one (spec §9).
9. **Conventional commits**, one logical change per commit, small diffs. Branch off `main`; never commit straight to `main`.
10. **Read before write.** Before editing, read the surrounding code and match its idioms.

---

## 5. UX trust rules Codex must honor (spec §8)

The frontend agent must enforce these without being re-reminded:

- Output is **always editable** — a starting point, not a verdict.
- **"What changed & why"** panel shown by default.
- **Side-by-side** original vs. enhanced; structure score before/after.
- **Context-used chips** list exactly which snippets were injected; unselected context never reaches the model.
- **Honest, dull loading text**; errors preserve input and offer Retry; fallback model is **labeled**.
- WCAG 2.1 AA: keyboard, focus, contrast, no color-only signals (icons + text on the checklist).

---

## 6. Prompt-packet format (how Claude briefs Codex)

Every unit of work Claude hands to Codex uses this template. It is self-contained so Codex needs no other context.

```markdown
## Packet <phase>.<n> — <title>

**Goal:** <one sentence — the outcome, not the steps>

**Spec refs:** <section numbers from improved_web_app_spec.md>

**Preconditions:** <what must already exist / be merged>

**Sub-agent plan:** <which agents from §3, how many, parallel or serial>
  e.g. "Serial: builder implements; then reviewer reviews. No fan-out."
  e.g. "Parallel ≤3: builder×2 on independent modules + prompt-engineer; reviewer after."

**Tasks:**
1. <imperative, explicit input → output>
2. ...

**Definition of done:**
- [ ] <objective, checkable>
- [ ] Unit tests pass: `<command>`
- [ ] (prompt work) Promptfoo suite green: `<command>`

**Do NOT:** <scope fences — deferred features, files off-limits>

**Report back:** <what Codex should summarize for Claude's review>
```

**Sequencing principle:** prefer **serial** packets with a single `builder` + `reviewer` for most work. Reserve parallel fan-out (multiple `builder`s) for genuinely independent modules — and cap at 6 threads total, counting the orchestrator's helpers.

---

## 7. The review & merge loop (every packet)

1. Codex implements the packet (spawning sub-agents only as the packet directs).
2. `reviewer` agent (read-only) reviews the diff against spec refs + §4 rules.
3. **Claude** reads the diff and the reviewer's report; runs/inspects the eval gate where relevant.
4. If green → commit (conventional message) → next packet. If not → Claude issues a corrective follow-up to the same Codex thread (`/agent` to steer).
5. Meta-prompt changes additionally require the Promptfoo gate (§3) before merge.

---

## 8. Cost & safety guardrails

- Sub-agents multiply token spend (each runs its own model+tools). Default to **fewer agents**; justify every parallel fan-out.
- Use `gpt-5.5` for build/reasoning; consider `GPT-5.3-Codex-Spark` for fast, low-stakes execution passes.
- Keep `max_depth = 1` (no recursive sub-agents) and `max_threads = 6`.
- Sandbox: `builder`/`frontend`/`test-runner`/`prompt-engineer` are workspace-write; `reviewer`/`explorer` are **read-only**. No agent gets full/network access without an explicit, logged reason.

---

## 9. Quick reference — Codex commands

| Command | Use |
|---|---|
| `/agent` | Switch between / inspect / steer / stop sub-agent threads |
| `/model` | Switch model mid-session |
| `/review` | Dedicated read-only reviewer over a diff |
| `/skills` or `$skillname` | Invoke an Agent Skill |
| `--search` | Live web search (default is cached index) |
| `codex resume` | Resume a prior session |
| `codex exec` | Non-interactive automation (JSON out) for scripting |

---

## 10. Sources

- [Codex Subagents](https://developers.openai.com/codex/subagents)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features)
- [Codex Agent Skills](https://developers.openai.com/codex/skills)
- [Codex CLI](https://developers.openai.com/codex/cli)
- [GPT-5.5 Model — OpenAI API](https://developers.openai.com/api/docs/models/gpt-5.5)
- [Introducing GPT-5.5](https://openai.com/index/introducing-gpt-5-5/)
