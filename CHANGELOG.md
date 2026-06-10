# Changelog

Version history for Lavern (codebase name: The Shem). Current version is recorded in `CLAUDE.md` under "System Identity".

## Unreleased — Defense Strategy workflow + clarification gates

**Agents can now pause and ask the client questions mid-analysis.**
New `clarification` gate type and `mcp__shem__ask_user` MCP tool
(orchestrator-only): the session pauses, the dashboard shows the
question, and the user answers in free text and/or attaches more
documents. All four gate resolvers handle it — readline prompts for
the answer, the async/API resolver passes `answer` through
`POST /api/sessions/:id/gate`, the webhook resolver forwards the
question and accepts `answer` in the callback response, and
auto-approve *rejects* (never fabricates an answer) so agents proceed
on explicit `[A]` assumptions.

**Mid-session document attachment.** New
`POST /api/sessions/:id/documents` appends parsed documents (evidence,
responding records, exhibits) to a running session — re-sanitized
defensively, deduped by id, capped at 40 per session, announced via a
new `documents_added` event. The `ask_user` tool reports documents
that arrived while its question was pending so the orchestrator
re-runs `list_documents`.

**New `defense-strategy` workflow** (civil + criminal allegation
defense): intake → inventory → party attribution → allegation map →
clarification round → defense theory → red-team challenge → strategy
synthesis → final gate → delivered. Built for opposing records
(motion record vs. responding motion record, claim vs. defence);
the router sends `defense_strategy` requests and civil-allegation
keywords here while criminal disclosure terms stay with
defence-disclosure.

**New `allegation-mapper` agent** with its own evidence-first output
schema: party map (who speaks through which documents), attribution
table (sworn vs. unsworn vs. argument, every entry cited), allegation
register (accuser, legal character, supporting/contradicting evidence,
admitted/denied/unanswered), and ranked clarification questions.

**Dashboard.** GateDialog grows a clarification mode (answer textarea,
multi-file attach that parses then attaches to the live session, Skip
that proceeds on assumptions); gate cards label clarification gates
"Question for You".

## v0.15.0 (Current) — Initial open-source release

Apache 2.0. First publicly tagged release.

**LOCAL MODE by default.** Auth (login, signup, Google OAuth, email
verification, password reset) and per-user billing are gated behind
`LAVERN_AUTH_ENABLED=true`. With the flag off — the default — every
request runs as a synthetic `local-user`, no cookies, no tokens, no
emails. Single-user installs (the dominant OSS use case) get a clean
straight-to-dashboard experience.

**Test suite reconciled to the staging port.** 1,677/1,677 passing on
`main` (12 new tests pinning the LAVERN_AUTH_ENABLED route-registration
contract). Four pre-OSS test files (Bearer-token auth, verified-email
gating, an older `buildToolRegistry` signature, an off-by-one budget
bound) were updated to the new contracts.

**Build artefacts out of git.** `site/demo/` is no longer committed.
A new `npm run build:site` script and `netlify.toml` regenerate the
embedded demo SPA on every deploy.

**Dead code sweep.** Removed `viz/src/engine/office-scene.ts` and
`viz/public/sprites/` (2.1 MB of Kenney isometric assets that no
view imported) and the now-unused `phaser` dependency.

**Marketing site.** New "An agentic law firm. Yours." index page,
matching architecture deep-dive, the cinematic `/demo/` tour built
in cream paper, social card with the actual brand fonts.

**Documentation honesty pass.** README reframes "67 agents" as 67
system prompts + the four loops around them. The "driverless law
firm" tagline softened everywhere user-facing. EU sovereignty claim
scoped narrowly with a tracking issue (#7) for the three routes that
still call Anthropic directly.

## v0.14.3 — Claude Opus 4.7 Upgrade + Quality Bumps

**Opus bumped to the 4.7 generation** (Sonnet 4.7 is not yet released — Sonnet stays at 4.5):
- Primary orchestration: `claude-opus-4-6` → `claude-opus-4-7`
- Router + claw per-doc processing: `claude-sonnet-4-5-20250929` → `claude-sonnet-4-5` (short-form alias of the same model)
- Briefing analyzer: `claude-haiku-3-5-20250929` → `claude-sonnet-4-5` (quality upgrade — intake analysis shapes the entire engagement)

**Quality upgrades on user-facing call sites** (Sonnet → Opus 4.7):
- Quality gate (validates assembled documents before delivery)
- Session derivatives (`POST /api/sessions/:id/derivatives`) — "Generate More" outputs
- Session conversation (`POST /api/sessions/:id/conversation`) — "Ask the Team" replies
- Challenge (`POST /api/challenge/compare`) — blind document comparison

**Pricing table (`src/utils/stream-messages.ts`, `src/assembly/document-assembler.ts`):**
- New keys added for `claude-opus-4-7` and `claude-sonnet-4-5` (same $/M rates as prior generation)
- Legacy keys (`claude-opus-4-6`, `claude-sonnet-4-5-20250929`) kept for in-flight sessions and archived cost records

**Postmortem note:** an earlier attempt shipped `claude-sonnet-4-7` across the stack, which Anthropic returns `not_found_error` for — that model does not exist. Verified with a live probe against Anthropic's API (`claude-opus-4-7` ✓, `claude-sonnet-4-7` ✗, `claude-sonnet-4-5` ✓) before re-shipping. Lesson: always probe new identifiers with a live API call before burning engineering time on rollout.

**Test fixtures updated:** `stream-messages.test.ts`, `session-manager.test.ts`, `rate-limit.test.ts`, `api-routes.test.ts`, `api-validation.test.ts` all reference the new canonical IDs.

## v0.14.2 — Remote MCP Bridge, Ops Observability, 1500-User Load Test Readiness

**Remote MCP Bridge (Stages 1 + 2 dispatcher landed):**
- New `src/mcp/remote-bridge/` module exposes 12 Counsel tools over JSON-RPC 2.0 so the Anthropic Managed Agents runtime can treat Lavern as a remote MCP server. Methods: `initialize`, `tools/list`, `tools/call`, `notifications/initialized`.
- Session-scoped dispatcher (`dispatcher.ts`) reflects the in-process tool registry via the same 5 factories (`createWorkflowTools`, `createMemoryTools`, `createKnowledgeBaseTools`, `createHandoffTools`, `createFeedbackLoopTools`). No tool logic duplicated.
- Zod `safeParse` on every call returns `invalid_args` cleanly instead of uncaught handler exceptions. Discriminated outcome (`ok | not_allowed | not_found | invalid_args | handler_error`) maps 1:1 to JSON-RPC error codes (-32001…-32004).
- `tools/list` emits real JSON Schemas via `z.toJSONSchema()` so generic MCP clients can build request bodies without a hand-written schema lookup.
- Auth: Bearer secret (timing-safe compare against `LAVERN_MANAGED_AGENTS_BRIDGE_SECRET`, ≥32 chars or bridge refuses to register) + `X-Lavern-Session-Id` header. Archived sessions (no live event bus) are rejected.
- Defense in depth: allowlist enforced at both the JSON-RPC server layer AND the dispatcher — a bug in either alone cannot open the surface.
- Gated behind `LAVERN_MANAGED_AGENTS_BRIDGE=1`; production default is off.
- See `docs/managed-agents-migration.md` for staged rollout status. Stage 2 executor (the half that *calls* the bridge) is still pending on Managed Agents beta access.

**Per-User Spend Observability:**
- `getUserSpendBreakdown(sinceIso, untilIso, limit)` in `src/db/database.ts` — SQL aggregate over `session_archive LEFT JOIN users` with per-user total / avg / max / session count / last-session timestamp.
- `GET /api/admin/user-spend` (X-Admin-Key gated) — default window: today 00:00 UTC → now (matches spend-tracker reset boundary). ISO validation + limit clamping [1, 500]. Anonymous sessions bucketed under `userId: null`.

**1500-User Load Test Readiness:**
- New env `LAVERN_LOAD_TEST_BYPASS_KEY` + `X-Load-Test-Bypass` header — timing-safe shared-secret bypass of both global (100/min/IP) and per-route auth rate limits (signup 3/min, login 5/min). Required to drive 1500+ simulated users from one host without throttle-sheds.
- `scripts/load-test.ts` auto-scales batch sizes under bypass (auth 50/tick, sessions 25/tick; without: 10/5). Adds per-phase ETA, throughput, and RSS sampling. Warns if `--users ≥ 500` without bypass key.
- Script header documents the three server env overrides needed for a 1500-user run: `LAVERN_LOAD_TEST_BYPASS_KEY`, `SHEM_MAX_SESSIONS=2000`, `SHEM_SESSION_TTL_MS=3600000`, plus `NODE_OPTIONS=--max-old-space-size=4096` for headroom.

**Sentry Coverage Sweep on Silent-Failure Paths:**
- `src/session/session-manager.ts` × 3 — session_end archive, destroy archive + releaseHold fallback, evict archive + releaseHold fallback. Archive failures mean data loss + frozen billable hours — now every one reaches Sentry with `sessionId` + `phase` tags.
- `src/api/routes/billing.ts` — Stripe webhook signature verification catch. Persistent failures mean pack purchases + subscription upgrades silently stall.
- `src/api/routes/engage.ts` × 3 — engage dispatch chain, failure-callback delivery, chain safety net. Keeps agent-mode integrations visible when they break.
- `src/claw/delivery.ts` × 2 — DOCX + HTML conversion failures (delivery "succeeds" but bundle is incomplete).
- `src/claw/processor.ts` × 2 — change detection + precedent indexing failures (persistent-state corruption).

**Email Retry + Sentry:**
- `src/email/send.ts` — transient Resend failures (408/429/500/502/503/504 or network) retry 3× with 500 ms / 1.5 s / 4.5 s backoff. Permanent failures reach Sentry with `to` + `subject` context.

**Production Config Guards:**
- `validateProductionConfig()` now treats `LAVERN_PROVIDER=mistral` without `MISTRAL_API_KEY` and `LAVERN_PROVIDER=managed` without `ANTHROPIC_API_KEY` as fatal. Localhost defaults for `STRIPE_CANCEL_URL` and `GOOGLE_OAUTH_REDIRECT_URI` warn loudly.

**Test Coverage:** 1507 → 1556 tests (24 new across 3 files: `mcp-bridge.test.ts`, `mcp-bridge-dispatcher.test.ts`, `user-spend-breakdown.test.ts`). Clean `tsc --noEmit` on backend + `viz/`.

## v0.14.1 — Voice Mode: Speak to the Firm

**Voice Input — Three Phases:**
- **Phase 1 — Intake (Briefing):** Mic toggle in `ConversationalChat` enables voice-driven interviews. `useVoiceInput` (Deepgram + Web Speech fallback) fills the input field on `finalTranscript`; auto-submits after 1.5s silence. Auto-restarts listening when interviewer finishes responding (stable primitive deps prevent per-chunk re-fires). Toggle in header; keyboard Send still works as fallback.
- **Phase 2 — Interrupt (Working):** Floating mic FAB in `WorkingView` (position above PacMan button). On click: listens, injects transcript into the session activity feed via `POST /api/sessions/:id/inject`. New endpoint emits `tool_used` event into the session event bus so the message appears as a speech bubble in the feed. 1000-char cap.
- **Phase 3 — Post-case (Delivery):** Mic button beside the "Ask the Team" input in `ConversationTab`. Same pattern: listen → `sendTextRef` auto-sends via stable ref, skipping stale-closure issues.

**Reused Infrastructure (no changes):**
- `viz/src/partner/hooks/useVoiceInput.ts` — Deepgram STT via `/api/voice/stt` WebSocket + Web Speech API fallback. Used as-is in all three phases.
- `viz/src/partner/hooks/useVoiceOutput.ts` — ElevenLabs TTS. Available for future question read-back.
- `viz/src/partner/components/VoiceOrb.tsx` — Audio-reactive orb. Available for future full-voice mode.

**Bug Sweep:**
- All three components destructure `useVoiceInput()` return values (individual stable callbacks) instead of holding a reference to the returned object. Removed `voice` object from all `useCallback`/`useEffect` deps — was causing effects to re-run on every render.
- Removed stray `voice.isListening` reference in `WorkingView.tsx` JSX.
- Zero `tsc --noEmit` errors on both frontend and backend.

**New API:**
- `POST /api/sessions/:id/inject` — accepts `{ message: string }` (max 1000 chars), emits `tool_used` event into session bus, returns `{ success: true, sessionId }`.

## v0.14.0 — Clawern: Law Firm in Your Mac Mini

**Real-time Dashboard:**
- WebSocket push via ClawEventBus (9 event types, late-join replay)
- Adaptive polling: 60s when WS connected, 10s fallback
- Pause/Resume with PAUSED badge + Scan Now disable

**Voice Dispatch (`/#/dispatch`):**
- Mobile-optimized dark cinematic interface with Web Speech API
- Keyword-based command parsing (no LLM cost): status, findings, scan, pause, resume, retry, budget
- SpeechSynthesis spoken responses

**Notifications:**
- Telegram bot with two-way chat control (long polling, authorized chat only)
- Email alerts for critical findings via Resend (sendClawAlertEmail)
- Weekly digest email (sendClawDigestEmail) triggered by heartbeat
- Notification redaction: configurable level (minimal/summary/full), confidential docs redacted

**Change Detection:**
- Findings diff between consecutive reviews (added/resolved/changed/unchanged)
- diff.json + manifest update per delivery
- DeliveryCard shows "+N new · -N resolved · ~N changed"

**Cost Forecasting:**
- forecastWork() — read-only cost estimation (no registry mutation)
- Forecast banner in OverviewTab with pending count, est. cost, local count

**Portfolio Intelligence:**
- GET /api/claw/portfolio — cross-document findings aggregation
- Portfolio Intelligence card: severity grid, highest-risk docs, recurring patterns

**Observability:**
- Audit logging (audit.ts): append-only JSON lines, 5MB rotation, 3 rotated files
- GET /api/claw/audit — last N entries
- GET /api/claw/metrics — Prometheus-format gauges/counters
- Daily backup of state.json, precedents.json, profile.json (30-day retention)
- Health verification in heartbeat (API key, watcher status)

**Security Hardening:**
- Watch path validation: reject `..` traversal
- Notification redaction for confidential documents
- WebSocket cleanup-first pattern (prevents listener leaks)
- Engage.ts safety-net .catch() on webhook dispatch chain

**Setup Simplification:**
- `claw validate` — color-coded configuration health report
- `claw pause` / `claw resume` — CLI commands for direct control
- Profile auto-migration for old profiles
- Post-init guidance with all available commands

**Multi-client Isolation:**
- ClientRegistry with per-client directories (~/.lavern/clients/{id}/)
- GET/POST /api/claw/clients endpoints
- Backward compatible: default client uses root ~/.lavern/

**Linux Daemon (systemd):**
- daemon-systemd.ts: user service management (no root)
- daemon-factory.ts: routes to launchd (macOS) or systemd (Linux)

**Failed Document Recovery:**
- Inline error display in DocumentsTab with per-document retry
- Document hash exposed in API for single-doc retry

**macOS Menu Bar App (menubar/):**
- Native SwiftUI status bar presence
- 30s polling, budget gauge, quick actions

**Marketing Site:**
- Clawern front page (site/claw/): dark cinematic design with crab hero
- 65% grain, fog vignette, 3-step setup

**Hybrid Local+Frontier Processing:**
- `src/claw/anonymize.ts` — Regex-based legal entity extraction (party names from defined terms, monetary amounts, dates, emails, phones), stable placeholder replacement, reversible de-anonymization
- `src/claw/hybrid-analysis.ts` — 5-stage pipeline: local triage → filter major/critical → anonymize flagged clauses → frontier dispatch (30% budget) → de-anonymize + merge with provenance tagging
- Processing mode config: `ClawProfile.processing: 'local' | 'frontier' | 'hybrid'`
- Fast path: if all findings are low-severity, skip frontier entirely
- Graceful degradation: frontier failure falls back to local-only findings
- Entity mapping stays in memory only, never serialized or sent externally
- Delivery with provenance tags (source: 'local' | 'frontier' | 'both') and hybridStats in manifest

**Developer Experience:**
- Demo mode: server starts without ANTHROPIC_API_KEY (dashboard, auth, Clawern dashboard work)
- Auto-copy `.env.example` → `.env` on first run
- RESEND_API_KEY downgraded from fatal to warning

**Test Coverage:** 1283 → 1440 tests (157 new across 11 test files)

## v0.13.0 — Precedent Board (Institutional Memory)

**Precedent Board — Cross-Document Intelligence:**
- `src/claw/precedent-board.ts` — Persistent institutional memory for Claw Mode
- After each document is processed, significant findings (RED/YELLOW, confidence ≥ 0.7) are auto-indexed to `~/.lavern/precedents.json`
- Before processing future documents, matching precedents are queried and injected as agent context
- O(1) dedup index (SHA-256 of findingType + first evidence text)
- Relevance-scored search: `usage × 0.3 + effectiveness × 0.4 + recency × 0.3`
- Reinforcement via incremental update (clamped [0, 1]) when patterns recur
- Time-based decay: configurable threshold (default 30d), deprecation at 6× threshold
- Compaction: archives deprecated/old entries to `precedents-archive.json`
- All logic is local (no LLM calls), per-client isolated, evidence-linked

**Processor Integration:**
- Precedent lookup before dispatch — injects matching context into agent request
- Sanitized context injection (control chars stripped, descriptions ≤ 200 chars, total ≤ 1000 chars)
- Precedent indexing after delivery — extracts findings from session debate state
- Non-fatal error handling: board failures never fail a document processing run
- `precedent_match` notification on strong matches (relevance > 80%)

**Dashboard:**
- New "Precedents" tab in Clawern dashboard (5 tabs: Overview, Documents, Deliveries, Precedents, Config)
- Summary bar: active count, top patterns, deprecated count
- Searchable precedent cards with pattern name, description, evidence citation, metadata
- Evidence truncated to 200 chars, WCAG AA accessible (`role=list/listitem`, `aria-label`)
- Demo mode: 4 synthetic precedents (Contract Risk, Dark Pattern, Contract Deviation, Adversarial Ambiguity)

**Heartbeat Integration:**
- Precedent board decay + compaction runs on 12th heartbeat cycle (~6 hours)
- Deprecated precedent count surfaced in heartbeat alerts

**API:**
- `GET /api/claw/precedents` — query by findingType, jurisdiction, documentType, text; validated limit [1, 100]

**Configuration:**
- `LAVERN_CLAW_PRECEDENT_DECAY_DAYS` (default 30) — threshold before effectiveness decay
- `LAVERN_CLAW_PRECEDENT_ARCHIVE_DAYS` (default 90) — threshold before archival
- `LAVERN_CLAW_PRECEDENT_MAX_OUTCOMES` (default 50) — cap on outcome history per entry

**Bug Fix:**
- `engage.ts`: safety-net `.catch()` on webhook dispatch promise chain (prevents unhandled rejection)

**Test Coverage:** 1283 → 1319 tests (36 new: 26 core + 10 hardening edge cases)

## v0.12.0 — Launch Ready + Hardening

**Output Quality Hardening (7 gaps closed):**
- `bestAttempt` fallback re-validates before returning — structurally invalid documents never reach users
- Quality gate fail-closed on first API error (was silently passing garbage through)
- Quality gate critique feeds into ALL retry attempts (was blind after attempt 3)
- Placeholder detection (`[TBD]`, `[PLACEHOLDER]`) added to structural validation (≥5 = fail)
- Process contamination threshold dropped 20% → 5%; `First,`/`Now,`/`Next,` excluded from full-text scan (legal prose)
- Finding content sanitized via `sanitizeFindingContent()` — strips agent preambles before display
- Assembly context warns when analysis is unverified; quality gate applies stricter standards

**Document Input Sanitization (SMAC-L1):**
- `src/documents/sanitize-text.ts` — strips zero-width Unicode, HTML comments, ANSI escapes from all parsed document text
- NFC normalization for consistent Unicode representation
- Single sanitization point in `parser.ts` — all downstream consumers (MCP tools, assembly, orchestrator, Claw) get clean text
- Audit trail: `sanitizationLog` field on `ParsedDocument`, server warning log, session event emission
- Preserves legitimate Unicode (accented chars, CJK, Cyrillic, Arabic), markdown, legal bracket patterns

**Security Hardening:**
- Google OAuth: auto-link blocked unless BOTH existing account AND Google profile have verified emails (prevents account takeover)
- Session manager: `releaseHold()` safety net on archive failure (prevents permanent billable hours lock)
- Login: constant-time delay (80-120ms) for non-existent users (timing attack mitigation)
- Login error messages mapped to generic text (prevents account enumeration via error disclosure)
- GateDialog: removed `console.error` that leaked stack traces to browser DevTools
- Terms/Privacy footer: moved outside `.page` container, matched main site layout + clickable mailto links

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

## v0.11.3 — Marketing Site Mobile + DNS

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

## v0.11.2 — 50-User Launch Hardening

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

## v0.11.1 — Production Stability + Mobile Polish

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

## v0.11 — Email Verification Enforcement + Security Hardening

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

## v0.10 — Soft Launch Hardening + Working View Redesign

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

## v0.9.1 — EU Sovereign Provider, Ethical Mode, Knowledge Base Expansion
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

## v0.9.0 — Soul, Heartbeat, Dashboard Polish
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

## v0.8.1 — Security Hardening + Dual-Model Confidentiality
- Public API lockdown — POST mutations require auth (Bearer or cookie)
- Expired token cleanup — automatic at startup and hourly
- x402 payment middleware wired into engage route
- Dual-model confidentiality — confidential docs analyzed on-device ($0 cost)
- Sensitivity pattern matching — `*confidential*`, `*privileged*`, `*merger*`, etc.
- Input boundaries — symlink protection, file size limits, per-scan doc cap
- Notification system — webhook + macOS native with 5-min dedup
- Rate limiting — global + per-route limits (configurable via env vars)
- All hardcoded values extracted to config.ts with env var overrides

## v0.8.0 — Clawern (Law Firm on Retainer)
- Autonomous document processing pipeline (watch, plan, process, deliver)
- Filesystem watcher with debounce
- Budget tracking and per-document cost estimates
- macOS LaunchAgent daemon
- Dashboard integration (status, documents, deliveries)

## v0.7 — Production Hardening + Visual Dashboard
- Centralized config (`src/config.ts`) — all settings env-var configurable
- API validation (Zod schemas) — all mutation endpoints validated
- API authentication — Bearer token + cookie auth
- Error recovery — structured errors, session state preserved on failure
- Atomic memory writes — write-to-tmp-then-rename for memory/precedent files
- Frontend dashboard — SessionList, pixel-art office, real-time event streaming
