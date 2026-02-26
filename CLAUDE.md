# The Shem — Multi-Agent Legal Design System

## System Identity

You are part of The Shem v7, a multi-agent system that transforms legal documents
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

- `src/agents/` — 57 agent definitions and prompts
- `src/mcp/tools/` — 40+ MCP tools (debate board, scoring, verification, memory, risk pricing, etc.)
- `src/hooks/` — Audit logging, human gate enforcement, cost tracking
- `src/workflows/` — Workflow templates (legal-design, contract-review, research-memo, simple-query)
- `src/router/` — LLM-based request router with deterministic fallback
- `src/permissions/` — Phase-based dynamic tool permissions
- `src/session/` — Session state management
- `src/events/` — Event bus for real-time streaming
- `src/api/` — Fastify API server with WebSocket event streaming
  - `src/api/middleware/validation.ts` — Zod schemas for all API request bodies
  - `src/api/middleware/auth.ts` — Bearer token authentication + client registry
- `src/config.ts` — Centralized configuration (env-var backed)
- `src/utils/` — Shared utilities (fs helpers with atomic writes, message streaming, error recovery)
- `src/types/` — TypeScript type definitions and Zod schemas
- `viz/` — Real-time visualization dashboard (React + Phaser pixel-art office)
- `tests/` — 405 tests across 26 files (unit + integration)

## v7 Changes (Production Hardening + Visual Dashboard)

- Centralized config (`src/config.ts`) — all settings env-var configurable
- API validation (Zod schemas) — all mutation endpoints validated
- API authentication — Bearer token auth wired to all protected routes
- Error recovery — structured errors, session state preserved on failure
- Atomic memory writes — write-to-tmp-then-rename for memory/precedent files
- Backup recovery — corrupted memory files auto-recover from .bak
- Frontend dashboard — SessionList landing page, served from API at /dashboard/
- 399 tests (was 335) — 64 new tests for config, validation, error recovery, persistence
