# Lavern — The World's First Driverless Law Firm

## System Identity

You are part of Lavern v0.12.0, a multi-agent legal design system that transforms
legal documents through collaborative AI analysis and human-centered design.
Lavern is the world's first driverless law firm.

The codebase is called "The Shem" (the name inscribed in the golem's mouth).
The product is called "Lavern". These names are interchangeable in internal docs.

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
- `src/agents/` — 65 agent prompts (58 specialists + 7 orchestrators), 58 agent definitions
- `src/agents/profiles.ts` — 62-agent profile registry (skill ratings, personality, DiceBear avatars)
- `src/mcp/tools/` — 19 MCP tool modules (debate board, scoring, verification, memory, risk pricing, baselines, knowledge base, report cards, quality checks, handoffs)
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
- `src/workflows/` — 8 workflow templates:
  - `counsel` — Quick legal questions
  - `review` — Full contract review with debate
  - `adversarial` — Builder + attacker + synthesizer
  - `roundtable` — Parallel expert panel + debate + synthesis
  - `legal-design` — Legal design transformation
  - `full-bench` — Maximum team engagement
  - `pre-engagement` — Intake and team selection
  - `verification` — Standalone document verification pipeline
- `src/workflows/executor.ts` — Generic workflow runner with soul + personality injection

### API Server
- `src/api/` — Fastify API server with WebSocket event streaming
  - `src/api/middleware/` — Auth (Bearer + cookie), Zod validation, x402 payment
  - `src/api/routes/` — 20 route modules:
    - `sessions.ts` — Session CRUD + gate decisions + soul injection from user profile
    - `engage.ts` — Agent-native engagement (sync + webhook modes)
    - `verify.ts` — Standalone document verification
    - `matters.ts` — Matter management (engagements, team selection)
    - `briefing.ts` — LLM-powered briefing analysis for intake
    - `auth-routes.ts` — User signup, login, logout, profile (incl. soul)
    - `google-auth.ts` — Google OAuth login/signup (CSRF state, token exchange, account linking)
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
- `viz/src/pricing/` — Billable Hours pricing page (credits explainer, plan tiers, waitlist CTA)
- `viz/src/challenge/` — Lavern Challenge blind document comparison
- `viz/src/agent-builder/` — NBA2K-style custom agent builder (3-step wizard: Identity, Face, Stats) with edit mode
- `viz/src/claw/` — Clawern remote monitoring dashboard (Overview, Documents, Deliveries, Config)
- `viz/src/auth/` — Login/signup views

### Providers
- `src/providers/` — LLM provider abstraction layer:
  - `mistral.ts` — Mistral AI client wrapper (EU sovereign)
  - `mistral-executor.ts` — Workflow execution via Mistral
  - `mistral-assembler.ts` — Document assembly from Mistral output
  - `tool-converter.ts` — MCP → Mistral tool format conversion
  - `types.ts` — Shared provider type definitions (`LLMProvider = 'anthropic' | 'mistral'`)

### Clawern (Law Firm on Retainer)
- `src/claw/` — Autonomous document processing pipeline (13 modules):
  - `registry.ts` — Document tracking by content hash (SHA-256), persistence
  - `planner.ts` — Budget-aware work planning with sensitivity pattern matching + ethical mode
  - `processor.ts` — Document processing (parse, infer, dispatch, deliver)
  - `watcher.ts` — Filesystem watcher with debounce and symlink protection
  - `delivery.ts` — Output bundle generation (manifest, deliverable, findings)
  - `local-analysis.ts` — On-device analysis via Ollama for confidential docs
  - `daemon.ts` — macOS LaunchAgent daemon management
  - `notify.ts` — Webhook + macOS native notifications with dedup (incl. heartbeat)
  - `init.ts` — Interactive onboarding (profile creation, ethical mode question)
  - `inference.ts` — Document type inference
  - `terminal.ts` — Rich terminal output formatting
  - `index.ts` — CLI entry point with heartbeat timer, `--ethical` flag
  - `types.ts` — Claw-specific type definitions (incl. ethicalMode)

### Data Layer
- `src/db/` — SQLite database (user auth, tokens, session archive, matter storage)
- `src/knowledge-base/` — Reference document collections (FTS5 search, retrieval, global datasets)
- `src/assembly/` — Document assembly and format conversion (HTML, DOCX)
- `src/documents/` — Document parser (PDF, DOCX, Markdown, plain text)
- `src/utils/logger.ts` — Structured logging utility
- Legal dataset seeder (`scripts/seed-knowledge-base.ts`, 6 datasets):
  - CUAD (510 contracts, 41 clause types, CC BY 4.0)
  - MAUD (152 merger agreements, 92 deal points, CC BY 4.0)
  - ACORD (126K+ clause retrieval pairs, CC BY 4.0)
  - UNFAIR-ToS (5.5K sentences, 8 unfair clause types, CC BY-SA 4.0)
  - ContractNLI (10K+ premise/hypothesis NLI pairs, CC BY-NC-SA 4.0)
  - LEDGAR (60K SEC provisions, 98 clause types, CC BY-SA 4.0)

### Marketing Site (`site/`)
Static single-page site deployed via Netlify drag-and-drop. Dark cinematic design (Cormorant Garamond + Inter, #080808 background, #E8845C accent).

- `site/index.html` — Entire site in one HTML file (CSS + JS inlined)
  - Hero: LAVERN logo, tagline ("Excellence doesn't scale. Until now."), "Knock" mailto CTA, Log In link
  - Sections: statement, art-quote, video (demo.mp4), CTA ("Speak to Us.")
  - Footer: Helsinki · Paris
  - Effects: film grain overlay, parallax scroll, custom cursor (desktop), word-by-word reveal, magnetic buttons, mist/smoke canvas
  - **Mobile (≤768px)**: Single-screen hero + footer only — all mid-sections hidden, no scroll, mist preserved
  - **Desktop**: Full scrolling experience with all sections
- `site/terms/index.html` — Terms of Service (static HTML, dark cinematic design)
- `site/privacy/index.html` — Privacy Policy (static HTML, dark cinematic design)
- `site/img/` — Static assets (logo, OG image)
- `site/demo.mp4` + `site/demo.mov` — Product demo video
- **Analytics**: Plausible (`script.js` on site, `script.hash.js` on dashboard for SPA)
- **Deploy**: Drag-and-drop `site/` folder to Netlify (no build step, no netlify.toml)
- **Domain**: `lavern.ai` + `www.lavern.ai` (CNAME → Netlify, SSL via Let's Encrypt)

### Scripts
- `scripts/smoke-test.sh` — API end-to-end lifecycle smoke test (health → create → verify → delete)
- `scripts/load-test.ts` — 50-user concurrent load test (auth → sessions → WebSocket → poll → teardown, p50/p95 latencies)
- `scripts/seed-knowledge-base.ts` — Legal dataset seeder (6 datasets)

### Tests
- `tests/` — 1249+ tests across 74 files (65 unit + 9 integration)

## Version History

### v0.12.0 (Current) — Launch Ready

**Legal Compliance:**
- Terms of Service and Privacy Policy fully authored (all `[PLACEHOLDER]` fields resolved)
  - Company: Lavern, Helsinki, Finland; Jurisdiction: Finland, courts of Helsinki
  - AI disclaimer (Section 6): "does not constitute legal advice"
  - Subprocessor list (Section 13): Anthropic, Mistral, Stripe, Resend, Plausible, Netlify
- Static `/terms` and `/privacy` pages on marketing site (dark cinematic design)
- Footer links (Terms, Privacy) added to `site/index.html`
- Signup consent text: "By creating an account, you agree to our Terms and Privacy Policy"
- AI disclaimer in Delivery view: "does not provide legal advice"

**Google OAuth:**
- `GET /api/auth/google` — CSRF state token + redirect to Google consent screen
- `GET /api/auth/google/callback` — Token exchange, profile fetch, 3-way account resolution:
  - Existing Google user → login
  - Existing email user → link Google account
  - New user → create account + auto-verify email + credit free trial hours
- "Continue with Google" button + divider in LoginView
- OAuth success/error redirect handling in App.tsx
- Login error display for OAuth failures (denied/failed)

**Analytics & Monitoring:**
- Plausible Analytics on marketing site (`script.js`) and dashboard (`script.hash.js` for SPA)
- Sentry React SDK in dashboard (`@sentry/react`, ErrorBoundary with editorial fallback UI)
- `VITE_SENTRY_DSN` env var for client-side Sentry

**Stuck Agent Fix:**
- Delivered-state fallback: force all active agents to 'complete' when workflow reaches 'delivered'
- Agent timeout: mark agents as 'Timed out' after 10 minutes of no events

**Document Assembly Fix:**
- `bestAttempt` tracking: keeps longest output even if validation failed
- Returns best attempt instead of empty string on all-attempts failure
- Users get a document with warnings instead of perpetual loading

**Strategy & Team Simplification:**
- Strategy screen intro text: "Defaults work well for most engagements. Adjust only if you need to."
- Workflow picker: "Default" badge on Quick Counsel card
- TeamView: collapsible sections (Infrastructure, Legacy, Industry, Tech collapsed by default)
- Section headers show collapse chevron, selected count, and click-to-expand
- "Recommended for your engagement" banner when auto-selected team is present

**Build & Type Safety:**
- Clean `tsc --noEmit` for both backend and frontend (0 errors)
- Fixed timestamp type mismatch in useWorkingState agent timeout logic

### v0.11.3 — Marketing Site Mobile + DNS

**Marketing Site (`site/index.html`):**
- Mobile single-screen layout (≤768px): hero + footer only, all mid-sections hidden via CSS
- CTA heading changed from "Try it." to "Speak to Us."
- Mailto links updated: subject "Knock Knock", pre-filled body requesting demo
- Mist/smoke canvas effect preserved on mobile
- Hero Log In link hidden on mobile (clean single-CTA focus)
- Sub-pixel orange seam fix at hero bottom edge

**DNS & Hosting:**
- `www.lavern.ai` CNAME → Netlify, SSL provisioned
- Domain: `lavern.ai` (ALIAS) + `www.lavern.ai` (CNAME) both live

### v0.11.2 — 50-User Launch Hardening

**Blocking Fix:**
- Claude API retry wrapper (`src/utils/retry-query.ts`) — wraps `query()` with exponential backoff (1s→2s→4s, cap 8s) on transient 429/500/502/503/529 errors; emits retry events to session so users see "Retrying..." instead of silence

**Accessibility:**
- Delivery tab panels: `role="tabpanel"`, `aria-labelledby`, `aria-controls` linkage between tabs and panels

**Free Trial & Billing:**
- Free trial hours on signup: new users without invite code get 10 billable hours (~2 quick engagements) automatically
- Invite code now optional: validated if provided (bonus 50h), but signup works without one
- Config: `LAVERN_FREE_TRIAL_HOURS` (default 10), `LAVERN_WELCOME_HOURS` (default 50 for invite users)
- Session creation 402 handling: redirects to pricing page with clear "top up" messaging
- Billing hold system: `holdBillableHours`/`releaseHold` prevents TOCTOU race — hold placed at session start reduces visible balance, released + actual cost debited at session end. Concurrent sessions can't over-spend.
- Credit idempotency scoped to non-debit entries (prevents edge case where a debit reference could block a credit)

**Security:**
- Session creation requires authentication — `POST /api/sessions` removed from public paths; unauthenticated requests return 401
- Session listing requires authentication — `GET /api/sessions` removed from public paths; prevents session ID enumeration (individual session access via ID remains public as a capability token)
- Frontend auth gates on all session creation paths (YOLO, QuickStart, staffing) — redirects to login with toast
- Voice TTS route rate-limited (30 req/min per IP) to prevent API credit drain

**Stability:**
- EventBus max listeners raised from 50 to 200 for 50+ concurrent users
- Session eviction logged at info level instead of error (reduces noise in production logs)

**UX Polish:**
- Resend verification cooldown: 60-second countdown timer prevents repeated clicks and silent 429s
- Session error recovery overlay: prominent "Session Interrupted" card with "Start New Session" + "View Partial Results" CTAs and cost consumed display
- Signup form: invite code field marked optional with "Have a code? Enter it for bonus hours" helper text
- Landing page: updated copy from "Invite only" to "Sign up free. Two engagements on us."

**Dev Tooling:**
- `scripts/load-test.ts` — 50-user concurrent load test (auth, sessions, WebSocket, polling, teardown with p50/p95/p99 latencies)

### v0.11.1 — Production Stability + Mobile Polish

**API Resilience:**
- Global fetch interceptor (`useApiFetch.ts`) — catches 401/402/429/5xx across all API calls with toast dedup (3s window)
- Offline detection (`useOnlineStatus` hook + `OfflineBanner`) — fixed amber banner on connectivity loss
- Document upload retry with exponential backoff (3 retries, 1s→2s→4s→8s cap)
- `beforeunload` handler on Briefing view when user has unsaved work

**Security & Ops:**
- Change password endpoint + My Page UI section (invalidates other sessions)
- Production startup validation — critical env vars (ANTHROPIC_API_KEY, RESEND_API_KEY) cause `exit(1)` if missing
- SQLite archive retention cleanup (default 180 days, configurable via `SHEM_ARCHIVE_RETENTION_DAYS`)
- Enhanced deep health check: DB size, email/Stripe/LLM key status

**Mobile:**
- Document upload: prominent "Upload Files" button on touch devices instead of drag-drop zone
- Mobile touch targets: minimum 44px height across components

### v0.11 — Email Verification Enforcement + Security Hardening

**Email & Auth Infrastructure** — Complete email verification pipeline:
- Password reset flow: forgot-password → email with token → reset-password
- Email verification flow: signup → verification email → verify-email → banner clears
- Resend verification endpoint with rate limiting (3/min per IP)
- Receipt emails on billable hours purchase, low-balance warnings
- Welcome email on signup with verification link

**Email Verification Enforcement** — Server-side middleware blocking unverified users:
- `src/api/middleware/require-verified.ts` — Fastify `onRequest` hook
- Blocks authenticated unverified browser users from POST mutations (sessions, engage, matters)
- Skips: anonymous requests, API clients (Bearer), GET/HEAD/OPTIONS, exempt paths
- Exempt paths: `/api/auth/*`, `/api/billing/*`, `/api/documents/*`, `/api/waitlist`, `/api/briefing/*`
- Returns 403 `EMAIL_NOT_VERIFIED` with user-friendly message
- Frontend `VerificationBanner` — warm amber banner with pulsing dot, resend button, session-dismissible

**Security Fixes (3 Crucial):**
- Token race condition: `markTokenUsed()` now atomic (`UPDATE ... WHERE used_at IS NULL`, returns boolean)
- Password reset: token consumed FIRST before acting, remaining writes wrapped in DB transaction
- FileReader async race: document content reads now Promise-wrapped, awaited before submission

**Stability Fixes (10 Smaller):**
- Claw notify dedup Map: hard cap (10K entries) prevents memory leak in long-running daemon
- `useLLMInterview`: mount guard on `setInterviewResult` after finalization
- `usePartnerConsult`: mount guards on finalize, SSE JSON parse error logic fixed (was comparing error message to raw JSON string)
- Voice route: Deepgram JSON parse failures now logged instead of silently swallowed
- HTML sanitizer: handles unquoted style attributes with `expression()`, catches HTML-encoded `javascript:` URLs
- `useDeliveryData`: `cancelledRef` checks in `retryAssembly` async operations
- `useSoundEffects`: null check on soundDefs lookup

**Frontend Polish:**
- Login/signup: `<label>` + `autoComplete` attributes for accessibility and password managers
- Real-time password length hints during signup and reset
- Landing: waitlist error contrast raised to WCAG AA, responsive input widths, ARIA labels
- QuickStart: low-balance color contrast fix, cowork folder error handling
- Decorative images: `role="presentation"` across landing views
- Button touch targets: minimum 36px height, improved padding
- MyCases: user-facing error messages instead of console.warn

**Test Coverage Expansion** — 1156 → 1179+ tests:
- Email verification middleware: 12 unit tests (skip/block/exempt logic)
- Email verification state: 3 integration tests
- Token atomicity: double-use prevention, concurrent race protection

### v0.10 — Soft Launch Hardening + Working View Redesign

**Working View Redesign** — Transformed from static dashboard to lively team chat room:
- ActivityCard speech bubbles for agent start/stop/tool activity
- ReassuranceCard warm messages during processing silences (25s idle trigger)
- ProgressSidebar redesigned as Claude Code-style real-time checklist
- HeartbeatBand slimmed to single row (phase dots + stats)
- Warm team-avatar empty state with personalized greetings

**WCAG AA Accessibility** — Full keyboard navigation and screen reader support:
- Focus-visible indicators, skip-to-content link, ARIA landmarks
- Live regions for dynamic content, dialog/tablist/radiogroup semantics
- Color contrast raised to 4.5:1+ ratio, `prefers-reduced-motion` support
- GateDialog focus trap prevents background interaction

**Responsive Layouts** — Mobile/tablet/desktop via `useMediaQuery` hook:
- Sidebar stacking with toggle, grid collapse, header wrapping
- Desktop layout unchanged (conditional breakpoints only)

**Production Hardening** — 40+ security and stability fixes:
- SSRF prevention, command injection fix, TOCTOU race condition fix
- Session ID collision prevention (crypto.randomBytes entropy), FTS5/LIKE injection fix
- XSS sanitization on all HTML deliverables (script, iframe, event handler stripping)
- Gate timeout now rejects (was auto-approving), WebSocket reconnect resume
- Server-side WebSocket heartbeat (30s ping, 60s timeout)
- Webhook retry with exponential backoff (3 retries)
- Auth middleware hardened (removed /api/clients from default public paths)
- Mistral empty response guard, JSON.parse safety across frontend hooks
- Web Speech API bounds checks, replay audit entry null safety
- Claw delivery type safety (Finding field name corrections)
- Timer cleanup on component unmount (PartnerView)
- Structured logger (`src/utils/logger.ts`)

**Error Surfaces** — Users see what went wrong instead of silent failures:
- Connection Lost amber banner on WebSocket drop
- Session Expired overlay on server 4004
- Search error state in archive, offline indicator on team selection
- Analysis retry button in briefing, double-submit guard on QuickStart

**UX Polish:**
- View transition animations (350ms fade-up on non-landing views)
- Delivery loading skeleton (DeliverySkeleton component)
- Duplicate tab protection via BroadcastChannel (useTabLock hook)
- Back-navigation cleanup (stale sessionStorage keys removed)
- Custom agent edit mode in Agent Builder
- Error copy consistency (removed technical jargon from user-facing messages)
- Delivery view polish: responsive grids, markdown links, empty states, download feedback

**Test Coverage Expansion** — 610 → 1125 tests (84% increase):
- Auth routes: signup, login, profile, GDPR erasure/export (55 tests)
- Auth middleware: public paths, token validation, method-specific matching (50 tests)
- Rate limiting: sliding window, concurrent session caps, per-user isolation (11 tests)
- Dynamic permissions: phase deny rules, template overrides, orchestrator-only tools (20 tests)
- Format converter: XSS sanitization (8 tests)
- Database, session manager, config, router, Claw planner/registry coverage

**Dev Tooling:**
- `scripts/smoke-test.sh` — API end-to-end lifecycle test (no `jq` dependency)

### v0.9.1 — EU Sovereign Provider, Ethical Mode, Knowledge Base Expansion
- **Mistral EU Provider** — Full alternative LLM backend for EU data sovereignty
  - `src/providers/` — 5 new modules (client, executor, assembler, tool converter, types)
  - Per-session provider selection: Claude (US) or EU Sovereign (Mistral)
  - ProviderToggle segmented selector in Strategy view
  - EU badge in Working view header when Mistral active
- **Maximum Ethical Mode** — One-click toggle for Clawern
  - EU-only processing (Mistral), all docs confidential, conservative risk
  - CLI: `lavern claw start --ethical`
  - Dashboard: Config tab card with ON/OFF toggle, CommandStrip shield badge
  - PATCH `/api/claw/ethical` endpoint
- **Knowledge Base Expansion** — 4 new datasets (6 total)
  - ACORD: 126K+ expert-rated clause retrieval pairs (Atticus Project)
  - UNFAIR-ToS: EU unfair terms of service clauses (LexGLUE)
  - ContractNLI: Contract natural language inference pairs
  - LEDGAR: 60K SEC contract provisions, 98 clause types (LexGLUE)
- **Agent Builder Simplification** — Face step reduced to avatar + seed + randomize
- **Cleanup** — Removed 3 dead MCP tool files (formatting-check, structure-check, verification-pipeline)

### v0.9.0 — Soul, Heartbeat, Dashboard Polish
- **Soul** — User-defined firm personality (voice, principles, style, values)
  - My Page soul editor (5000 char textarea, persists in profile)
  - Injected into orchestrator system prompt for every engagement
  - `SOUL.md` fallback for CLI/Claw mode
  - Priority: session soul (user profile) > SOUL.md > empty
- **Heartbeat** — Periodic Clawern check-in (default 30min)
  - Surfaces: budget warnings (>80%), stale docs, errors, flagged items
  - Silent when everything is fine
  - Configurable via `LAVERN_CLAW_HEARTBEAT` and `LAVERN_CLAW_HEARTBEAT_INTERVAL`
- **Dashboard redesign**
  - Navigation: Landing → Briefing → Strategy → Team → Working → Delivery
  - ProgressSidebar with step-by-step workflow progress
  - Cowork folder mode (File System Access API for non-destructive local saves)
  - QuickStart 3-tier express engagement (Quick, Standard, Deep)
  - My Cases view with active + past engagement history
  - 20 UX micro-fixes across 13 components

### v0.8.1 — Security Hardening + Dual-Model Confidentiality
- Public API lockdown — POST mutations require auth (Bearer or cookie)
- Expired token cleanup — automatic at startup and hourly
- x402 payment middleware wired into engage route
- Dual-model confidentiality — confidential docs analyzed on-device ($0 cost)
- Sensitivity pattern matching — `*confidential*`, `*privileged*`, `*merger*`, etc.
- Input boundaries — symlink protection, file size limits, per-scan doc cap
- Notification system — webhook + macOS native with 5-min dedup
- Rate limiting — global + per-route limits (configurable via env vars)
- All hardcoded values extracted to config.ts with env var overrides

### v0.8.0 — Clawern (Law Firm on Retainer)
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
