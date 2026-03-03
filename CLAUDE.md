# The Shem — Multi-Agent Legal Design System

## System Identity

You are part of The Shem v0.8.1, a multi-agent system that transforms legal documents
through collaborative analysis and human-centered design. The Shem is the world's
first driverless law firm.

## Shared Principles

1. Legal effect must remain identical after transformation
2. Every finding must cite specific text as evidence
3. Debate is a feature, not a bug — agents should challenge each other
4. Human gates are mandatory, never skip them
5. Dual artifacts are always required (user-facing + legal review package)

## Non-Negotiable Preservation Categories

- Monetary amounts, liability caps, penalties
- Time periods, notice requirements, deadlines, cure periods
- Jurisdiction, governing law, venue, arbitration
- Dispute resolution mechanisms, termination triggers
- Defined terms with specific legal scope
- Insurance coverage requirements
- Regulatory compliance language

## Disclaimer

This system assists with document design and accessibility.
It does not provide legal advice. Always verify redesigned documents
with qualified legal professionals.

## Project Structure

### Core Engine
- `src/agents/` — 66 agent definitions and prompts (57 specialist + orchestrators)
- `src/mcp/tools/` — 21 MCP tool modules (debate board, scoring, verification, memory, risk pricing, baselines, knowledge base, report cards, quality checks)
- `src/hooks/` — Audit logging, human gate enforcement, cost tracking
- `src/router/` — LLM-based request router with deterministic fallback and v11 template mapping
- `src/orchestrator.ts` — Core orchestration loop (dispatch agents, manage turns)
- `src/dispatch.ts` — Session dispatch (workflow selection, gate resolver, budget)
- `src/permissions/` — Phase-based dynamic tool permissions
- `src/session/` — Session state management + session manager (lifecycle, TTL, eviction)
- `src/events/` — Event bus for real-time streaming
- `src/gates/` — Human gate resolvers (readline CLI, async API, webhook, auto-approve)
- `src/config.ts` — Centralized configuration (all settings env-var backed)
- `src/utils/` — Shared utilities (atomic fs writes, message streaming, error recovery)
- `src/types/` — TypeScript type definitions and Zod schemas

### Workflows
- `src/workflows/` — 11 workflow templates:
  - `counsel` / `simple-query` — Quick legal questions
  - `review` / `contract-review` — Full contract review with debate
  - `adversarial` / `research-memo` — Builder + attacker + synthesizer
  - `roundtable` / `legal-design` — Parallel expert panel + debate + synthesis
  - `full-bench` — Maximum team engagement
  - `pre-engagement` — Intake and team selection
  - `verification` — Standalone document verification pipeline

### API & Dashboard
- `src/api/` — Fastify API server with WebSocket event streaming
  - `src/api/middleware/auth.ts` — Dual auth: Bearer token (API clients) + cookie (browser users)
  - `src/api/middleware/validation.ts` — Zod schemas for all mutation endpoints
  - `src/api/middleware/payment.ts` — x402 payment protocol (USDC on Base)
  - `src/api/routes/sessions.ts` — Session CRUD + gate decisions
  - `src/api/routes/engage.ts` — Agent-native engagement endpoint (sync + webhook modes)
  - `src/api/routes/verify.ts` — Standalone document verification
  - `src/api/routes/matters.ts` — Matter management (engagements, team selection)
  - `src/api/routes/briefing.ts` — LLM-powered briefing analysis for intake
  - `src/api/routes/auth-routes.ts` — User signup, login, logout, profile
  - `src/api/routes/claw.ts` — Claw Mode remote monitoring & control
  - `src/api/routes/well-known.ts` — A2A agent card, OpenAI plugin manifest, OpenAPI spec
- `viz/` — Real-time visualization dashboard (React + Phaser pixel-art office)

### Claw Mode (Law Firm on Retainer)
- `src/claw/` — Autonomous document processing pipeline:
  - `registry.ts` — Document tracking by content hash (SHA-256), persistence
  - `planner.ts` — Budget-aware work planning with sensitivity pattern matching
  - `processor.ts` — Document processing (parse, infer, dispatch, deliver)
  - `watcher.ts` — Filesystem watcher with debounce and symlink protection
  - `delivery.ts` — Output bundle generation (manifest, deliverable, findings)
  - `local-analysis.ts` — On-device analysis via Ollama for confidential docs
  - `daemon.ts` — macOS LaunchAgent daemon management
  - `notify.ts` — Webhook + macOS native notifications with dedup
  - `init.ts` — Interactive onboarding (profile creation)

### Data Layer
- `src/db/` — SQLite database (user auth, tokens, session archive, matter storage)
- `src/knowledge-base/` — Reference document collections (FTS search, retrieval)
- `src/assembly/` — Document assembly and format conversion (HTML, DOCX)
- `src/documents/` — Document parser (PDF, DOCX, Markdown, plain text)

### Tests
- `tests/` — 557 tests across 31 files (unit + integration)

## Version History

### v0.8.1 (Current) — Security Hardening + Dual-Model Confidentiality
- Public API lockdown — POST mutations require auth (Bearer or cookie)
- Expired token cleanup — automatic at startup and hourly
- x402 payment middleware wired into engage route
- Dual-model confidentiality — confidential docs analyzed on-device ($0 cost)
- Sensitivity pattern matching — `*confidential*`, `*privileged*`, `*merger*`, etc.
- Input boundaries — symlink protection, file size limits, per-scan doc cap
- Notification system — webhook + macOS native with 5-min dedup
- Rate limiting — global + per-route limits (configurable via env vars)
- All hardcoded values extracted to config.ts with env var overrides

### v0.8.0 — Claw Mode (Law Firm on Retainer)
- Autonomous document processing pipeline (watch, plan, process, deliver)
- Filesystem watcher with debounce
- Budget tracking and per-document cost estimates
- macOS LaunchAgent daemon
- Dashboard integration (status, documents, deliveries)

### v0.7 — Production Hardening + Visual Dashboard
- Centralized config (`src/config.ts`) — all settings env-var configurable
- API validation (Zod schemas) — all mutation endpoints validated
- API authentication — Bearer token + cookie auth
- Error recovery — structured errors, session state preserved on failure
- Atomic memory writes — write-to-tmp-then-rename for memory/precedent files
- Frontend dashboard — SessionList, pixel-art office, real-time event streaming
