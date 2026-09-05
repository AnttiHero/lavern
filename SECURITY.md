# Security

Thank you for taking the time to look at Lavern's security.

## Reporting a vulnerability

**Do not file public GitHub issues for security bugs.**

Email **hello@lavern.ai** with:
- A description of the issue
- Steps to reproduce (or a proof-of-concept)
- The version / commit hash you tested against
- Whether you believe it is being actively exploited

We will:
- Acknowledge receipt within **48 hours**
- Provide a status update within **7 days**
- Credit you in the release notes (or remain anonymous on request)
- Coordinate disclosure timing with you (default 90 days from acknowledgement)

## Scope

In scope:
- The Lavern API server (`src/api/`)
- The Clawern daemon (`src/claw/`)
- The dashboard (`viz/`)
- The Anthropic provider, Mistral provider, local Ollama provider
- The MCP remote bridge (when enabled)
- The agent-builder firm-clone flow
- Auth, billing, and session management

Out of scope:
- Vulnerabilities in upstream dependencies — please report those to the upstream project (we will track and patch)
- Issues in deployed instances of Lavern operated by third parties (report to that operator)
- Social-engineering attacks against Lavern team members
- Physical attacks on the host running Lavern
- Findings that require already-compromised credentials, root access, or a malicious browser extension

## Deployment shapes

v0.15.0 ships with `LAVERN_AUTH_ENABLED=false` by default. In that **LOCAL MODE**, every request is the synthetic `local-user`, no cookies are set, no passwords are stored, no Stripe webhooks are accepted, and the auth/billing/Google-OAuth/referral routes don't register at all. The threat model collapses to "single user on a machine they own" — most of the trust boundaries below are inert until the flag is flipped.

The multi-user model below is **not available in this build**. Setting `LAVERN_AUTH_ENABLED=true` makes the server refuse to start (see `src/api/server.ts`): the auth routes are preserved on this branch, but request-level enforcement is not implemented, so enabling the flag would advertise authentication while every request still ran as the shared `local-user`. The guard is deliberate — fail closed rather than give a false sense of security. Shared or hosted deployments need the enforcement work first; treat the sections below as the design target, not a supported switch.

## Trust boundaries

Lavern protects:
- The user's authenticated session and password hash
- Document content uploaded by an authenticated user
- The session event stream (sessions are only readable by their creator or by anyone with the session ID, which is treated as a capability token — see `src/api/server.ts` public-paths comment)
- Billing data (held holds + debits)
- API keys configured by the operator (Anthropic, Mistral, Stripe, Resend)

Lavern does **not** protect against:
- A malicious operator (the Lavern instance owner can read any user's data — Lavern is single-tenant by design)
- A malicious local model (the Ollama daemon runs as the user and can read any file the user can)
- Network attackers between the browser and the API when run over HTTP (use a TLS-terminating reverse proxy)
- Compromised host operating system

## What we already do

- Bearer-token + cookie auth (`src/api/middleware/auth.ts`)
- bcrypt password hashes
- Atomic password-reset tokens (single-use, time-limited)
- Constant-time login delay for non-existent users (timing-attack mitigation)
- Generic error messages on auth failure (no account enumeration)
- Per-route rate limiting + global per-user limiter
- Server-side WebSocket heartbeat with idle timeout
- SSRF prevention on the firm-scraper (private IPs blocked, content-type checked, size capped, fetch timeout)
- Symlink-traversal protection on Clawern watch paths
- XSS sanitisation on all assembled HTML deliverables (no `<script>`, no `<iframe>`, no event handlers)
- SMAC-L1 input sanitisation on all parsed documents (zero-width Unicode, HTML comments, ANSI escapes stripped)
- CSRF-state token on the Google OAuth flow
- Email verification gate on POST mutations for browser users
- Production startup validation (refuses to start with localhost defaults in `NODE_ENV=production`)
- Sentry coverage on silent-failure paths (session archive, webhook delivery, Stripe signature verification)

## What we do not yet do (roadmap)

- DNS-rebinding protection (resolve once, lock the IP for the fetch).
- PDF/DOCX parsing in a worker-thread sandbox with memory + wall-clock caps
- Helmet-equivalent default security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- CSRF tokens on cookie-authed mutations beyond OAuth callbacks
- Signed npm publishes with provenance attestation
