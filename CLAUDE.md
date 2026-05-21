# Lavern — A multi-agent legal system. Yours.

## System Identity

You are part of Lavern v0.15.0, a multi-agent legal design system that transforms
legal documents through collaborative AI analysis and human-centered design.
Lavern is an open-source multi-agent legal system. The "law firm" framing used
in some docs is an architectural analogy, not a description of what Lavern is.
Lavern is not a law firm and does not provide legal advice.

The codebase is called "The Shem" (the name inscribed in the golem's mouth).
The product is called "Lavern". These names are interchangeable in internal docs.

## Shared Principles

1. Legal effect must remain identical after transformation
2. Every finding must cite specific text as evidence
3. Debate is a feature, not a bug — agents should challenge each other
4. Human gates are mandatory, never skip them
5. Every engagement ships with an audit bundle alongside the deliverable: structured findings, debate resolutions, verification results, and cost log. (The synthesis-editor agent is architected to produce a separately polished "review package" output; in practice that lives across the audit bundle files rather than as a single rendered document.)

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
- `src/agents/` — 67 agent prompts (59 specialists + 7 orchestrators + 1 base), 59 agent definitions
- `src/agents/profiles.ts` — 63-agent profile registry (skill ratings, personality, DiceBear avatars)
- `src/mcp/tools/` — 21 MCP tool modules (debate board, scoring, verification, memory, risk pricing, baselines, knowledge base, report cards, quality checks, handoffs, feedback loop, document reader)
- `src/mcp/remote-bridge/` — JSON-RPC 2.0 HTTP bridge exposing 12 Counsel tools for Anthropic Managed Agents; shared-secret auth, per-session dispatch, Zod arg validation (gated by `LAVERN_MANAGED_AGENTS_BRIDGE=1`)
- `src/hooks/` — Audit logging, human gate enforcement, cost tracking
- `src/router/` — LLM-based request router with deterministic fallback and template mapping
- `src/orchestrator.ts` — Core orchestration loop (dispatch agents, manage turns)
- `src/dispatch.ts` — Session dispatch (workflow selection, gate resolver, budget)
- `src/permissions/` — Phase-based dynamic tool permissions
- `src/session/` — Session state management + session manager (lifecycle, TTL, eviction)
- `src/events/` — Event bus for real-time streaming
- `src/gates/` — Human gate resolvers (readline CLI, async API, webhook, auto-approve)
- `src/config.ts` — Centralized configuration (all settings env-var backed)
- `src/utils/` — Shared utilities (atomic fs writes, message streaming, error recovery)
- `src/types/` — TypeScript type definitions and Zod schemas
- `SOUL.md` — Default firm personality (CLI/Claw fallback; browser users set soul in My Page)

### Workflows
- `src/workflows/` — 9 workflow templates:
  - `counsel` — Quick legal questions
  - `review` — Full contract review with debate
  - `adversarial` — Builder + attacker + synthesizer
  - `roundtable` — Parallel expert panel + debate + synthesis
  - `legal-design` — Legal design transformation
  - `full-bench` — Maximum team engagement
  - `pre-engagement` — Intake and team selection
  - `verification` — Standalone document verification pipeline
  - `tabulate` — Tabular multi-document review (one row per doc, every cell cited)
- `src/workflows/executor.ts` — Generic workflow runner with soul + personality injection

### API Server
- `src/api/` — Fastify API server with WebSocket event streaming
  - `src/api/middleware/` — Auth (LOCAL-MODE no-op; cookie/Bearer logic preserved for `LAVERN_AUTH_ENABLED=true`), Zod validation, x402 payment
  - `src/api/routes/` — 27 route modules. The auth-shaped ones (auth-routes, google-auth, billing, referral) only register when `LAVERN_AUTH_ENABLED=true`; in default LOCAL MODE the dashboard runs as the synthetic `local-user` and those routes 404.
    - `sessions.ts` — Session CRUD + gate decisions + soul injection from user profile
    - `engage.ts` — Agent-native engagement (sync + webhook modes)
    - `verify.ts` — Standalone document verification
    - `matters.ts` — Matter management (engagements, team selection)
    - `briefing.ts` — LLM-powered briefing analysis for intake
    - `auth-routes.ts` — User signup, login, logout, profile (gated)
    - `google-auth.ts` — Google OAuth login/signup (gated)
    - `billing.ts` — Stripe-backed billable-hours subscription (gated)
    - `referral.ts` — Referral stats (gated)
    - `claw.ts` — Clawern remote monitoring & control
    - `challenge.ts` — Lavern Challenge blind document comparison
    - `challenge-prompt.ts` — Challenge prompt builder
    - `waitlist.ts` — Waitlist email capture + invite code management
    - `well-known.ts` — A2A agent card, OpenAI plugin manifest, OpenAPI spec
    - `agents.ts`, `capabilities.ts`, `documents.ts`, `knowledge-base.ts`, `pricing.ts`, `replay.ts`, `reputation.ts`, `workflows.ts`

### Dashboard (`viz/`)
React single-page app with editorial design language (Inter + Cormorant Garamond, warm cream palette). WCAG AA accessible, responsive (mobile/tablet/desktop), desktop layout unchanged.

**Navigation flow:** Landing → Briefing → Strategy → Team → Working → Delivery

- `viz/src/landing/` — Landing page, QuickStart (3-tier express engagement), YOLO launcher
- `viz/src/briefing/` — LLM-powered intake with document upload, analysis retry
- `viz/src/staffing/` — Strategy config, team selection, agent cards with DiceBear avatars, ProviderToggle (Claude / EU Sovereign), offline indicator
- `viz/src/working/` — Team chat room with real-time checklist (ProgressSidebar), activity feed (ActivityCard), reassurance messaging (ReassuranceCard), HeartbeatBand, connection lost banner, session expired overlay, duplicate tab protection
- `viz/src/delivery/` — Tabbed delivery view (The Work, The Story, The Scorecard, Review, Conversation, Next Steps), DownloadPanel with Cowork folder save, derivatives generation, loading skeleton
- `viz/src/my-page/` — User profile: About You, Default Settings, Custom Instructions, Lavern's Soul (firm personality editor), Saved Teams
- `viz/src/my-cases/` — Session history (active + past engagements)
- `viz/src/cowork/` — Cowork folder mode (File System Access API for non-destructive local saves)
- `viz/src/components/` — Shared components (GateDialog with focus trap, ErrorToast, LavernMark)
- `viz/src/hooks/` — Shared hooks (useMediaQuery, useTabLock)
- `viz/src/pricing/` — Billable Hours pricing page (visible when `LAVERN_AUTH_ENABLED=true`; the backing billing routes are gated off in LOCAL MODE)
- `viz/src/challenge/` — Lavern Challenge blind document comparison
- `viz/src/agent-builder/` — custom agent builder (3-step wizard: Identity, Face, Stats) with edit mode
- `viz/src/claw/` — Clawern remote monitoring dashboard (Overview with Portfolio Intelligence, Documents with inline error recovery, Deliveries with change detection, Precedents, Config)
- `viz/src/dispatch/` — Voice Dispatch (mobile-optimized voice command interface)
- `viz/src/auth/` — Login/signup views

### Providers
- `src/providers/` — LLM provider abstraction layer:
  - `mistral.ts` — Mistral AI client wrapper (EU sovereign)
  - `mistral-executor.ts` — Workflow execution via Mistral
  - `mistral-assembler.ts` — Document assembly from Mistral output
  - `tool-converter.ts` — MCP → Mistral tool format conversion
  - `types.ts` — Shared provider type definitions (`LLMProvider = 'anthropic' | 'mistral'`)

### Clawern (Law Firm on Retainer)
- `src/claw/` — Autonomous document processing pipeline (28 modules). Lighthouse architecture (Watchman → Reader → Curator + precedent-board lifecycle) added in commits 4455d89 → 2276bae after the v1→v3.4 eval arc on 10 CUAD contracts:
  - `registry.ts` — Document tracking by content hash (SHA-256), persistence
  - `planner.ts` — Budget-aware work planning with sensitivity pattern matching + ethical mode
  - `processor.ts` — Document processing (parse, infer, dispatch, deliver) + precedent lookup/indexing
  - `precedent-board.ts` — Institutional memory: cross-document finding persistence, O(1) dedup, relevance search, decay + compaction
  - `watcher.ts` — Filesystem watcher with debounce and symlink protection
  - `delivery.ts` — Output bundle generation (manifest, deliverable, findings)
  - `local-analysis.ts` — On-device analysis via Ollama for confidential docs
  - `daemon.ts` — macOS LaunchAgent daemon management
  - `notify.ts` — Webhook + macOS native notifications with dedup, redaction (incl. heartbeat, precedent match)
  - `notify-telegram.ts` — Telegram message sender with Markdown escaping
  - `telegram-bot.ts` — Two-way Telegram bot (long polling, command parsing)
  - `client-registry.ts` — Multi-client isolation (per-client directories, profiles, budgets)
  - `events.ts` — ClawEventBus singleton for real-time WebSocket streaming
  - `diff.ts` — Findings diff across review sessions (added/resolved/changed)
  - `audit.ts` — Append-only JSON lines audit trail with rotation
  - `backup.ts` — Daily state backup with 30-day retention
  - `anonymize.ts` — Legal entity anonymization (parties, amounts, dates, emails, phones) with reversible mapping
  - `hybrid-analysis.ts` — Hybrid local+frontier pipeline (local triage → anonymize → frontier selective → de-anonymize → merge)
  - `init.ts` — Interactive onboarding with profile versioning + migration
  - `inference.ts` — Document type inference
  - `terminal.ts` — Rich terminal output formatting
  - `index.ts` — CLI entry point with heartbeat timer, `--ethical` flag
  - `types.ts` — Claw-specific type definitions (incl. ethicalMode, processing mode)

### Data Layer
- `src/db/` — SQLite database (user auth, tokens, session archive, matter storage)
- `src/knowledge-base/` — Reference document collections (FTS5 search, retrieval, global datasets)
- `src/assembly/` — Document assembly and format conversion (HTML, DOCX)
- `src/documents/` — Document parser (PDF, DOCX, Markdown, plain text) + SMAC-L1 input sanitization
- `src/utils/logger.ts` — Structured logging utility
- Legal dataset seeder (`scripts/seed-knowledge-base.ts`, 5 datasets):
  - CUAD (510 contracts, 41 clause types, CC BY 4.0)
  - MAUD (152 merger agreements, 92 deal points, CC BY 4.0)
  - ACORD (126K+ clause retrieval pairs, CC BY 4.0)
  - UNFAIR-ToS (5.5K sentences, 8 unfair clause types, CC BY-SA 4.0)
  - LEDGAR (60K SEC provisions, 98 clause types, CC BY-SA 4.0)
  - (ContractNLI was removed; its CC BY-NC-SA 4.0 license is incompatible with Apache 2.0 distribution.)

### Marketing Site (`site/`)
Static single-page site deployed via Netlify drag-and-drop. Dark cinematic design (Cormorant Garamond + Inter, #080808 background, #E8845C accent).

- `site/index.html` — Entire site in one HTML file (CSS + JS inlined)
  - Hero: LAVERN logo, tagline ("Excellence doesn't scale. Until now."), "Knock" mailto CTA, Log In link
  - Sections: statement, art-quote, video (demo.mp4), CTA ("Speak to Us.")
  - Footer: Helsinki
  - Effects: film grain overlay, parallax scroll, custom cursor (desktop), word-by-word reveal, magnetic buttons, mist/smoke canvas
  - **Mobile (≤768px)**: Single-screen hero + footer only — all mid-sections hidden, no scroll, mist preserved
  - **Desktop**: Full scrolling experience with all sections
- `site/claw/index.html` — Clawern landing page (dark cinematic, crab hero, 65% grain, 3-step setup)
- `site/architecture/index.html` — Comprehensive visual architecture explainer (Lavern + Clawern technical deep-dive with SVG diagrams)
- `site/terms/index.html` — Terms of Service (static HTML, dark cinematic design)
- `site/privacy/index.html` — Privacy Policy (static HTML, dark cinematic design)
- `site/img/` — Static assets (logo, OG image)
- `site/demo.mp4` + `site/demo.mov` — Product demo video
- **Analytics**: Plausible (`script.js` on site, `script.hash.js` on dashboard for SPA)
- **Deploy**: Drag-and-drop `site/` folder to Netlify (no build step, no netlify.toml)
- **Domain**: `lavern.ai` + `www.lavern.ai` (CNAME → Netlify, SSL via Let's Encrypt)

### Menu Bar App (`menubar/`)
Native macOS SwiftUI status bar app for monitoring Clawern. Polls Claw API every 30s, shows popover with document counts, budget gauge, daemon status. Quick actions: Scan Now, Dashboard, Dispatch. No dock icon.

### Scripts
- `scripts/smoke-test.sh` — API end-to-end lifecycle smoke test (health → create → verify → delete)
- `scripts/load-test.ts` — 50-user concurrent load test (auth → sessions → WebSocket → poll → teardown, p50/p95 latencies)
- `scripts/seed-knowledge-base.ts` — Legal dataset seeder (5 datasets)

### Tests
- `tests/` — 1,677 tests across 109 files. Coverage spans the engine, dashboard hooks, Claw, MCP bridge, auth-gate route registration, and the broader API surface. `npm test` is green.

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.
