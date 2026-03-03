# Marble (The Shem)

Multi-agent legal design system. Transforms legal documents through collaborative AI analysis and human-centered design.

> **Disclaimer:** This system assists with document design and accessibility. It does not provide legal advice. Always verify outputs with qualified legal professionals.

## Quick Start

```bash
# Install dependencies
npm install

# Run in CLI mode (interactive)
npm run dev -- ./path/to/document.pdf

# Run as API server
npm run serve

# Run as API server with custom port
npm run serve:dev
```

## Architecture

Marble uses a multi-agent pipeline where 66 specialist agents collaborate to analyze legal documents. Agents debate findings, challenge each other's conclusions, and produce dual artifacts: a user-facing deliverable and a legal review package.

### Core Concepts

- **Workflows** — 11 templates from quick queries (`counsel`) to full parallel expert panels (`roundtable`)
- **Debate Board** — Agents post findings, challenge each other, respond, and resolve
- **Human Gates** — Mandatory approval checkpoints before irreversible actions
- **Verification Pipeline** — 10-pass verification with self-check, cross-check, and score dimensions
- **Dual Artifacts** — Every engagement produces both a deliverable and an audit trail

### Claw Mode (Law Firm on Retainer)

Autonomous document processing. Drop files in a watched folder; Marble reviews them in the background and delivers analysis bundles. Supports dual-model confidentiality: documents matching sensitivity patterns (e.g., `*confidential*`, `*privileged*`) are analyzed entirely on-device using a local model (Ollama) to preserve attorney-client privilege.

```bash
# Initialize Claw Mode
npm run dev -- --claw init

# Start the daemon
npm run dev -- --claw start
```

## Development

```bash
# Run tests
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
| `/api/engage` | POST | Agent-native engagement (sync + webhook) |
| `/api/capabilities` | GET | Machine-readable service manifest |
| `/.well-known/agent.json` | GET | A2A agent card |
| `/dashboard/` | GET | Visual dashboard (if built) |

### Authentication

Two auth methods:

1. **Bearer token** (API clients/agents): `Authorization: Bearer shem_agent_...`
2. **Cookie** (browser users): `marble_token` HttpOnly cookie via `/api/auth/login`

Register a client:
```bash
curl -X POST http://localhost:3000/api/clients \
  -H 'Content-Type: application/json' \
  -d '{"type": "agent", "name": "My Bot"}'
```

### Configuration

All settings are environment-variable configurable. See `scripts/env.production.template` for the full list.

```bash
cp scripts/env.production.template .env
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
├── agents/          # 66 agent definitions and prompts
├── api/             # Fastify API server + WebSocket
│   ├── middleware/   # Auth, validation, payment
│   └── routes/      # Session, engage, matters, auth, claw, etc.
├── claw/            # Claw Mode (autonomous document processing)
├── db/              # SQLite persistence
├── documents/       # Document parser (PDF, DOCX, MD, TXT)
├── events/          # Event bus for real-time streaming
├── gates/           # Human gate resolvers
├── hooks/           # Audit logging, gate enforcement, cost tracking
├── knowledge-base/  # Reference document collections (FTS)
├── mcp/tools/       # 21 MCP tool modules
├── router/          # LLM request router + deterministic fallback
├── session/         # Session state + session manager
├── workflows/       # 11 workflow templates
├── config.ts        # Centralized configuration
└── index.ts         # CLI entry point

viz/                 # React + Phaser dashboard
tests/               # 557 tests across 31 files
scripts/             # Production templates, Caddyfile, keychain setup
```

## License

UNLICENSED — Private
