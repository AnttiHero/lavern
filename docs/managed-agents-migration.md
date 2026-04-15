# Managed Agents Migration Plan

**Status:** Stage 0 landed (provider scaffolding). Stage 1 + Stage 2 dispatcher
landed (MCP bridge serving the 12 Counsel tools live over JSON-RPC). Waiting
on multi-agent preview access from Anthropic before Stage 2 executor can be
wired end-to-end, and before Stage 7 (full workflow set) becomes reachable.

**Scope:** Adopt Anthropic Managed Agents (beta: `managed-agents-2026-04-01`)
as the execution substrate for all Lavern workflows currently backed by the
Claude Agent SDK subprocess path. Keep the Mistral (EU sovereign) path and
Clawern (on-device) unchanged. Do NOT migrate single-shot utility calls
(document assembly, quality gate, router).

## Pre-flight red-line check (complete)

Verified against published beta docs. Live-API confirmation still required
for items marked `(verify live)`.

| # | Question | Verdict |
|---|----------|---------|
| 1 | Pre-tool-use gating primitive? | **PASS.** Native `user.tool_confirmation` with allow/deny/deny_message; session pauses via `session.status_idle` with `stop_reason: requires_action`. |
| 2 | Per-turn cost/token surfacing? | **PASS with caveat.** `session.usage` cumulative (input/output/cache-create/cache-read). `span.model_request_end` also emits `model_usage`, shape undocumented `(verify live)`. Good enough for spend fuse via polling on each idle. |
| 3 | Session resume after client restart? | **PASS with extra work.** No SSE cursor, but `GET /v1/sessions/{id}/events?since=` backfills the full history. ~50 lines of reconciler. |
| 4 | Per-session MCP auth? | **YELLOW.** Vault-static OAuth credentials, not per-request JWTs. Workaround: bridge uses shared secret + session ID injected as tool-call arg. Validates acceptable for pilot. |

### Other documented findings

- **No `allowedTools` filter.** Bridge enforces per-agent tool allowlist itself.
- **Tool-call timeout not documented** — `(verify live)` before long-running tools.
- **No EU region.** Managed serves US/global only. Mistral permanently owns the EU lane.
- **Multi-agent is a research preview.** Waitlist submitted.

### Red lines that would abandon the migration

If any of these fails on live pre-flight, we stop:

1. No pre-tool-use gate mechanism at all → human gates unenforceable.
2. No per-turn cost surfacing (not even session-level polling) → spend fuse unreliable.
3. No event history / resume API → API restart = lost work.
4. MCP bridge cannot be authenticated at all → leaks institutional memory.

## Architecture

Three lanes after migration:

1. **Managed** — Anthropic agentic workflows (counsel, review, roundtable,
   adversarial, full-bench, legal-design, verification, pre-engagement).
2. **Mistral** — EU sovereign agentic (unchanged).
3. **Direct SDK** — Single-shot utilities: document assembly, quality gate,
   router (unchanged).

## Staged rollout

### Stage 0 — Provider scaffolding ✅ (landed)

- `src/providers/managed-agents/{types,client,event-mapper,executor}.ts`
- `LLMProvider = 'anthropic' | 'mistral' | 'managed'`
- Zod schema accepts `'managed'` in `validation.ts`
- Executor guard throws clear error if `provider === 'managed'`

### Stage 1 — Remote MCP bridge ✅ (landed)

Expose in-process MCP tools (`src/mcp/tools/`) over HTTP so Managed-hosted
agents can call them. Co-located with the API server; single-process deploy.

- `src/mcp/remote-bridge/server.ts` — JSON-RPC 2.0 over HTTP. Methods:
  `initialize`, `tools/list`, `tools/call`, `notifications/initialized`.
  Advertises protocol version `2025-06-18` (pinned by Managed Agents beta
  header `managed-agents-2026-04-01`).
- `src/mcp/remote-bridge/session-auth.ts` — Bearer secret (timing-safe
  compare) + `X-Lavern-Session-Id` header. Secret env:
  `LAVERN_MANAGED_AGENTS_BRIDGE_SECRET` (≥32 chars required or bridge
  refuses to register). Rejects archived sessions (no live event bus).
- `src/mcp/remote-bridge/tool-allowlist.ts` — 12 Counsel tools: workflow
  state (5), memory read-only (3), knowledge base (3), `query_anti_patterns`.
  Surface deliberately narrow until Stage 7 expands it.
- `src/mcp/remote-bridge/dispatcher.ts` — session-scoped registry built
  per-request from the same 5 factories that back the in-process MCP
  server (`createWorkflowTools`, `createMemoryTools`,
  `createKnowledgeBaseTools`, `createHandoffTools`, `createFeedbackLoopTools`).
  Zod `safeParse` on every call; discriminated outcome
  (`ok | not_allowed | not_found | invalid_args | handler_error`) maps
  cleanly to JSON-RPC error codes (-32001…-32004).
  `buildCounselToolsListing` emits real JSON Schemas via
  `z.toJSONSchema(z.object(shape))` — Managed Agents runtime builds
  request bodies without a hand-written schema lookup.
- `src/mcp/remote-bridge/index.ts` — wires into Fastify, gated by
  `LAVERN_MANAGED_AGENTS_BRIDGE=1` + valid secret.

Critical: bridge re-uses the same MCP tool factories — no tool logic is
re-implemented. Just a network shim + Zod gate + allowlist.

**Coverage:** 19 unit tests (`tests/unit/mcp-bridge.test.ts`,
`tests/unit/mcp-bridge-dispatcher.test.ts`) cover allowlist, auth,
registry completeness, dispatch outcomes, and end-to-end live dispatch
of `get_current_step` against a fake SessionState.

### Stage 2 — Counsel executor

**Dispatcher half landed** (see Stage 1 — `dispatcher.ts` + tests).
Remaining work — the executor that *calls* the bridge from our side:

- Implement `runManagedAgentsWorkflow` end-to-end for counsel only.
- Build system prompt identically to `src/workflows/executor.ts` (soul + personality + orchestrator), with `Task` stripped.
- Create a Managed agent with the 12-tool counsel allowlist, bridge URL, shared-secret vault.
- Subscribe to SSE, pipe events through `event-mapper.ts`, emit to `session.events.emitEvent`.
- On `session.status_idle` poll session.usage, call `recordSpend(delta)`; trip halt when budget exceeded.
- Assembly stays on the existing single-shot call — no change.

### Stage 3 — Gates + audit

- Replace blocking `request_approval` tool semantics with native `user.tool_confirmation`. Much cleaner.
- On `session.status_idle` with `stop_reason: requires_action`, emit Lavern `gate_requested`. On gate decision (`POST /api/sessions/:id/gate`), send `user.tool_confirmation` with allow/deny.
- Audit: bridge intercepts every tool call (by definition — it executes them), writes JSONL. Strictly better than hooks because it can't be bypassed.

### Stage 4 — Routing + feature flag

- `LAVERN_MANAGED_AGENTS=0|1` — master kill switch (per-request, no restart).
- `LAVERN_MANAGED_AGENTS_CANARY_PCT` — random coin-flip for counsel.
- ProviderToggle gains `managed` option behind `VITE_MANAGED_AGENTS=1` build flag.
- **No silent fallback.** Mid-session Managed errors fail the session cleanly; user retries on Anthropic SDK path with one click.

### Stage 5 — Observability

- Sentry tag `provider:managed` on every event.
- Metrics: `managed.ttft_ms`, `managed.stall_rate`, `managed.failure_rate`, `managed.cost_delta_pct`, `managed.bridge.tool_latency_ms`, `managed.gate_resolution_s`.
- Critical chart: side-by-side `delivered` rate by provider, filtered to `workflow_id=counsel`, stratified by complexity.

### Stage 6 — Canary rollout (counsel only)

| Tier | Traffic | Duration | Hold if... |
|------|---------|----------|-----------|
| Internal | Allowlist | 2–3d | any Sev-1/2 |
| 1% | Random | 7d | delivered-rate drops >2pp |
| 5–50% | Random | 3–5d each | cost delta >+10%, p95 TTFT regresses >25% |
| 100% | Default for counsel | — | opt-out still available |

Auto-rollback: `LAVERN_MANAGED_AGENTS_CANARY_PCT=0` on any Sev-1 or >5pp delivered-rate drop over 24h.

### Stage 7 — Multi-agent workflows (gated on preview access)

Sketch only. When Anthropic grants preview:

- Evaluate whether `callable_agents` supports our Task + hook model.
- Expand bridge allowlist to full 19-tool set.
- Audit: SubagentStart/Stop equivalents must exist on Managed stream.
- Migrate workflows in order: review → roundtable → adversarial → full-bench → verification → legal-design → pre-engagement.
- After 30 days of 100% stability on all workflows, delete Agent SDK branch from `executor.ts` and retire `src/orchestrator.ts`.

## What we are NOT doing

- `src/assembly/document-assembler.ts` — single-shot, stays.
- `src/providers/mistral-*.ts` — EU path untouched.
- `src/claw/` — on-device, out of scope.
- Schema migrations — `shem.db` reads identically for all providers.
- Hook rewrites — the hooks system stays authoritative on the Agent SDK path.

## Rollback plan

- **Instant per-request:** `LAVERN_MANAGED_AGENTS=0` rejects new managed sessions. No restart required.
- **In-flight managed sessions:** continue to completion by default. To halt them: loop actives in `session-manager.ts` with `provider==='managed'`, call `session.halt('rolled-back')`. Bridge returns 401 to subsequent tool calls.
- **Archive:** identical schema regardless of provider. No data migration needed.

## Critical files

- `src/workflows/executor.ts` — single branch point; guard currently throws for `managed`.
- `src/providers/mistral-executor.ts` — canonical template for managed executor.
- `src/events/event-bus.ts` — event shapes the mapper must produce.
- `src/mcp/server.ts` — in-process MCP factories the bridge re-exposes.
- `src/workflows/templates/counsel.ts` — 12-tool allowlist for the bridge pilot.
- `src/api/routes/sessions.ts` — where `body.options.provider` is read; flag + canary coin-flip.

## Live pre-flight script

See `scripts/managed-agents-preflight.ts`. Run with a real API key before
committing engineering time to Stage 1. Verifies:

- `span.model_request_end` envelope shape
- Tool-call timeout ceiling (how long can a remote MCP tool block?)
- `/events?since=` backfill behavior after a simulated disconnect

## Timeline (optimistic, assuming preview granted + live pre-flight green)

- Week 0: Stage 0 ✅ (done)
- Week 1: Live pre-flight + Stage 1 (bridge)
- Week 2: Stage 2 (counsel executor) + Stage 3 (gates)
- Week 3: Stage 4–5 (flag, obs) + internal canary
- Weeks 4–6: Canary 1% → 100% for counsel
- Beyond: Stage 7 as preview allows
