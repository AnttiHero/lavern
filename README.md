# Lavern (The Shem)

The world's first driverless law firm. Multi-agent legal design system that transforms legal documents through collaborative AI analysis and human-centered design.

> **Disclaimer:** This system assists with document design and accessibility. It does not provide legal advice. Always verify outputs with qualified legal professionals.

## Quick Start

```bash
# Install dependencies
npm install

# Run in CLI mode (interactive)
npm run dev -- ./path/to/document.pdf

# Run as API server + dashboard
npm run serve

# Start dashboard dev server
npm run dev:viz
```

## Architecture

Lavern uses a multi-agent pipeline where 65 agents (58 specialists + 7 orchestrators) collaborate to analyze legal documents. Agents debate findings, challenge each other's conclusions, and produce dual artifacts: a user-facing deliverable and a legal review package.

### Core Concepts

- **Workflows** — 8 templates from quick queries (`counsel`) to full parallel expert panels (`roundtable`)
- **Debate Board** — Agents post findings, challenge each other, respond, and resolve
- **Human Gates** — Mandatory approval checkpoints before irreversible actions
- **Verification Pipeline** — 10-pass verification with self-check, cross-check, and score dimensions
- **Dual Artifacts** — Every engagement produces both a deliverable and an audit trail
- **Soul** — User-defined firm personality that shapes how agents communicate and make decisions
- **Document Assembly** — Post-pipeline assembly step produces clean deliverables (Markdown, HTML, DOCX)

### Dashboard

React SPA with editorial design language (Inter + Cormorant Garamond, warm cream palette).

**Flow:** Landing → Briefing → Strategy → Team → Working → Delivery

- **Landing** — QuickStart with 3-tier express engagement (Quick / Standard / Deep)
- **Briefing** — LLM-powered intake with document upload
- **Strategy** — Workflow, intensity, budget configuration
- **Team** — Agent selection with DiceBear avatars, personality bars, skill radars
- **Working** — Live progress sidebar, agent presence orbs, insight feed, debate threads
- **Delivery** — Tabbed view (The Work, The Story, The Scorecard, Review, Conversation, Next Steps), Cowork folder save, derivative document generation
- **My Page** — User profile, custom instructions, Lavern's Soul editor, saved teams
- **My Cases** — Session history (active + past engagements)

### Clawern (Law Firm on Retainer)

Autonomous document processing. Drop files in a watched folder; Lavern reviews them in the background and delivers analysis bundles. Includes periodic heartbeat check-ins and dual-model confidentiality (sensitive documents analyzed on-device via Ollama).

```bash
# Initialize Clawern
npm run dev -- --claw init

# Start watching
npm run dev -- --claw start
```

## Development

```bash
# Run tests (1249+ tests across 74 files)
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests only
npm run test:integration

# Type check (src/)
npm run typecheck

# Type check (src/ + viz/)
npm run typecheck:all

# Build
npm run build

# Build dashboard
npm run build:viz
```

## API Server

```bash
npm run serve
```

Default: `http://localhost:3000`

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/sessions` | POST | Create analysis session |
| `/api/sessions/:id/events` | GET | WebSocket event stream |
| `/api/sessions/:id/gate` | POST | Submit gate decision |
| `/api/sessions/:id/download` | GET | Download work product |
| `/api/sessions/:id/derivatives` | POST | Generate derivative document |
| `/api/sessions/:id/conversation` | POST | Ask the team (SSE streaming) |
| `/api/engage` | POST | Agent-native engagement (sync + webhook) |
| `/api/auth/signup` | POST | User registration |
| `/api/auth/login` | POST | User login (sets cookie) |
| `/api/auth/google` | GET | Google OAuth redirect |
| `/api/auth/profile` | PUT | Update profile (incl. soul) |
| `/api/capabilities` | GET | Machine-readable service manifest |
| `/.well-known/agent.json` | GET | A2A agent card |
| `/dashboard/` | GET | Visual dashboard (if built) |

### Authentication

Two auth methods:

1. **Bearer token** (API clients/agents): `Authorization: Bearer shem_agent_...`
2. **Cookie** (browser users): `lavern_token` HttpOnly cookie via `/api/auth/login`

Register a client:
```bash
curl -X POST http://localhost:3000/api/clients \
  -H 'Content-Type: application/json' \
  -d '{"type": "agent", "name": "My Bot"}'
```

### Configuration

All settings are environment-variable configurable. See `.env.example` for the full list.

```bash
cp .env.example .env
# Edit .env with your values
```

Key variables:
- `ANTHROPIC_API_KEY` — Your Anthropic API key
- `SHEM_PORT` — Server port (default: 3000)
- `SHEM_MODEL` — Primary model (default: claude-opus-4-6)
- `SHEM_DEFAULT_BUDGET` — Per-session budget in USD (default: 5.0)

## Project Structure

```
src/
├── agents/          # 65 agent prompts (58 specialists + 7 orchestrators)
├── api/             # Fastify API server + WebSocket
│   ├── middleware/   # Auth, validation, x402 payment
│   └── routes/      # 20 route modules
├── assembly/        # Document assembly + format conversion (HTML, DOCX)
├── claw/            # Clawern (13 modules: watch, plan, process, deliver, heartbeat)
├── db/              # SQLite persistence (users, tokens, sessions, matters)
├── documents/       # Document parser (PDF, DOCX, MD, TXT)
├── events/          # Event bus for real-time streaming
├── gates/           # Human gate resolvers (readline, async, webhook, auto-approve)
├── hooks/           # Audit logging, gate enforcement, cost tracking
├── knowledge-base/  # Reference document collections (FTS)
├── mcp/tools/       # 19 MCP tool modules
├── router/          # LLM request router + deterministic fallback
├── session/         # Session state + session manager
├── workflows/       # 8 workflow templates + executor
├── config.ts        # Centralized configuration
└── index.ts         # CLI entry point

viz/                 # React dashboard (23 feature directories)
├── landing/         # Landing, QuickStart, YOLO launcher
├── briefing/        # LLM intake + document upload
├── staffing/        # Strategy, team selection, agent cards
├── working/         # Live progress (23 components)
├── delivery/        # Tabbed delivery (12 components)
├── my-page/         # Profile + soul editor
├── my-cases/        # Session history
├── cowork/          # Cowork folder mode (File System Access API)
└── components/      # Shared (GateDialog, ErrorToast, LavernMark)

tests/               # 1249+ tests across 74 files
SOUL.md              # Default firm personality (CLI/Claw fallback)
CLAUDE.md            # Project documentation
```

## License

UNLICENSED — Private
