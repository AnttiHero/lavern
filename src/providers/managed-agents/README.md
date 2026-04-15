# Managed Agents Provider (Stage 0 Scaffold)

Anthropic Managed Agents beta, wired in as a third LLM provider alongside
`anthropic` (Agent SDK) and `mistral` (EU sovereign).

**Status:** Scaffolded only. All runtime entry points throw.

## Files

- `types.ts` — SSE envelope type declarations (partial, intentionally minimal)
- `client.ts` — HTTP client wrapper (stubbed)
- `event-mapper.ts` — Managed SSE → Lavern `ShemEvent` mapper (mostly stubbed)
- `executor.ts` — `runManagedAgentsWorkflow()` (throws)

## Staged migration

Full plan: `docs/managed-agents-migration.md`.

- [x] **Stage 0** — Scaffolding (this commit). Typecheck-only surface.
- [ ] **Stage 1** — Remote MCP bridge exposing in-process tools to Managed agents.
- [ ] **Stage 2** — Implement `runManagedAgentsWorkflow` (counsel only).
- [ ] **Stage 3** — Gate + audit wiring via native `user.tool_confirmation`.
- [ ] **Stage 4** — Feature flag + routing (`LAVERN_MANAGED_AGENTS`).
- [ ] **Stage 5** — Observability (Sentry tags, dashboard panel).
- [ ] **Stage 6** — Canary rollout (1% → 100% of counsel).
- [ ] **Stage 7** — Multiagent workflows (requires preview access).

## Kill switch

Once wired:

- `LAVERN_MANAGED_AGENTS=0` — reject any `provider: 'managed'` session at the API.
- `LAVERN_MANAGED_AGENTS_BRIDGE=0` — disable the remote MCP bridge listener.
- `LAVERN_MANAGED_AGENTS_CANARY_PCT=0` — stop routing coin-flip traffic.

## Beta header

Pinned in `types.ts` as `managed-agents-2026-04-01`. Bump deliberately after
reading the changelog — this API is pre-GA and breaking changes are expected.
