# Phase 6 Security and Privacy Audit

Date: 2026-06-12

Scope: Phase 6 launch hardening for billing, quotas, BYO provider keys, settings privacy flows,
caching, rate limits, and observability.

## Findings and Resolution Status

| Area | Finding | Status | Resolution |
| --- | --- | --- | --- |
| Per-user isolation | Settings and enhancement billing must use authenticated session identity as the source of truth. Legacy `user_id` and `x-user-id` request identity can only remain as an unauthenticated local/test shim when billing is not configured. | Resolved | `/settings/*` requires `x-session-id`, Bearer, or `session_id`. `/enhance/:mode` resolves the billing user from the session when billing is configured and uses that user id for quota, Redis rate limiting, context resolution, history, and result cache scope. The legacy `user_id` path logs a temporary shim warning and only runs when billing is absent. |
| BYO secrets at rest | BYO provider keys must not be stored or returned in plaintext. | Resolved | BYO keys are encrypted with AES-256-GCM through `BYO_KEY_ENCRYPTION_SECRET`. Save and use fail closed when the cipher is not configured. Settings and export responses return only provider, enabled/configured flags, and last-four hint. |
| Secret detection | Provider calls must run secret detection before sending prompt text to subprocessors. | Resolved | The LLM gateway runs `detectSecrets` before enhancement provider calls and before optional quality-judge calls. BYO secrets are passed only as provider credentials and are not mixed into prompts, traces, result-cache keys, or logs. |
| Training opt-in | The product must not train on user prompts or context without explicit opt-in. | Resolved | Settings privacy copy states no training without explicit opt-in. No Phase 6 code path stores an opt-in or sends data for training. |
| Sub-processors | Launch copy must disclose provider subprocessors. | Resolved | Settings privacy disclosures list Google Gemini API and OpenAI API for the optional quality judge. |
| Rate limits and abuse coverage | Launch abuse controls must be per-user only, with email verification for free-tier usage and no per-IP or per-workspace limits. | Resolved | Billing authorization enforces verified email on Free and per-user plan quotas. Redis rate limiting remains per authenticated/billed user when billing is enabled. No IP or workspace limiter was added, matching the settled launch policy. |
| Account deletion and purge | Deletion must remove user-scoped data and expired soft-deleted rows must be purgeable. | Resolved | Settings exposes account deletion. The auth-billing service deletes user-scoped rows, invalidates sessions, soft-deletes the user marker, and provides a purge job function for grace-period expiry. |

## Deferred Items

No launch-blocking security or privacy findings are deferred. Production scheduling for the purge
job remains deployment wiring: the purge function is implemented and tested, but no scheduler
platform is introduced in this phase.
