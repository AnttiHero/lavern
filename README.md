# Lavern

An agentic legal architecture. A law firm staffed with AI agents.

Lavern reviews documents, debates risks across a team of 65 AI agents, and delivers defensible outputs. It can work like a regular AI tool (you prompt it, it responds), or in **autonomous mode** (it watches a folder, reviews documents overnight, and sends you the findings).

> **Disclaimer:** This software assists with document analysis and legal design. It does not provide legal advice. Always verify outputs with qualified legal professionals.

**[Architecture Deep-Dive](https://lavern.ai/claw/how-it-works.html)** | **[lavern.ai](https://lavern.ai)**

## Quick Start

```bash
# Clone and install
git clone https://github.com/AnttiHero/Marble.git
cd Marble
npm install
cd viz && npm install && cd ..

# Start in demo mode (no API key needed)
npm run dev -- --serve

# Open dashboard
open http://localhost:3000
```

Demo mode gives you the full dashboard, auth system, and Clawern monitoring. To process documents, add your Anthropic API key to `.env`.

## What This Is

65 agents (58 specialists + 7 orchestrators) organized into 8 workflows, from quick legal questions to full adversarial review. Agents post findings with evidence, challenge each other through a formal debate protocol, and resolve disputes with auditable reasoning.

Every engagement produces two outputs: a user-facing deliverable and a complete legal review package with the full chain of reasoning.

**Key architectural ideas:**
- **Debate is the product.** Agents challenge each other's findings. Disagreement produces better results than consensus.
- **Three verification layers.** Evaluator gate, adversarial debate, 10-pass verification pipeline. Fail-closed.
- **Grounding verification.** Mechanical cross-reference of cited clauses against the parsed document. Zero LLM cost.
- **Human gates are mandatory.** Critical findings require human approval. The system raises concerns, humans decide.
- **Uncertainty is a feature.** Agents can decline to find when evidence is insufficient. Low confidence triggers escalation, not guessing.
- **Precedent Board.** Institutional memory that compounds across engagements. Every document reviewed makes the next review smarter.
- **Soul.** User-defined firm personality. Safety invariants (preservation rules, confidence thresholds) are firewalled from personality.

## Clawern (Autonomous Mode)

Drop files in a folder. Clawern reviews them overnight. Critical findings hit your phone.

```bash
npm run dev -- claw init       # Interactive setup
npm run dev -- claw validate   # Check configuration
npm run dev -- claw start      # Start watching
npm run dev -- claw pause      # Pause processing
npm run dev -- claw resume     # Resume processing
```

Features: 30-minute heartbeat, Telegram bot, email alerts, weekly digest, scheduled re-review, change detection, cost forecasting, portfolio intelligence, hybrid local+frontier processing, multi-client isolation, audit trail, Prometheus metrics.

## Dashboard

React SPA with editorial design language. WCAG AA accessible, responsive.

**Flow:** Landing → Briefing → Strategy → Team → Working → Delivery

The Working view is a live team chat room where you watch agents analyze, post findings, debate, and resolve disputes in real-time. The Delivery view includes confidence scores, grounding indicators, and the full audit trail.

## Development

```bash
npm test                  # 1507 tests across 92 files
npm run typecheck:all     # TSC check (backend + frontend)
npm run build             # Build backend
cd viz && npm run build   # Build dashboard
```

## API

```bash
npm run dev -- --serve    # Start API server (default: localhost:3000)
```

| Endpoint | Description |
|----------|-------------|
| `POST /api/sessions` | Create analysis session |
| `GET /api/sessions/:id/events` | WebSocket event stream |
| `POST /api/sessions/:id/gate` | Submit gate decision |
| `GET /api/sessions/:id/download` | Download work product |
| `POST /api/engage` | Agent-native engagement |
| `POST /api/auth/signup` | User registration |
| `GET /.well-known/agent.json` | A2A agent card |

See `.env.example` for configuration. Key variables:
- `ANTHROPIC_API_KEY` — Anthropic API key (optional in demo mode)
- `SHEM_PORT` — Server port (default: 3000)
- `SHEM_DEFAULT_BUDGET` — Per-session budget in USD (default: 5.0)

## Project Structure

```
src/
├── agents/          # 65 agent prompts + profiles + definitions
├── api/             # Fastify API server + WebSocket + middleware
├── assembly/        # Document assembly + format conversion + fidelity check
├── claw/            # Clawern: 22 modules (watch, plan, process, deliver,
│                    #   precedents, audit, backup, telegram, multi-client,
│                    #   hybrid analysis, anonymization, voice dispatch)
├── db/              # SQLite persistence
├── documents/       # Document parser (PDF, DOCX, MD, TXT) + sanitization
├── mcp/tools/       # 20 MCP tools (debate, scoring, verification, grounding,
│                    #   memory, knowledge base, quality checks)
├── workflows/       # 8 templates + executor
├── config.ts        # Centralized config (all env-var backed)
└── index.ts         # Entry point

viz/                 # React dashboard
├── landing/         # Landing, QuickStart
├── briefing/        # LLM-powered intake
├── staffing/        # Strategy + team selection
├── working/         # Live agent activity
├── delivery/        # Tabbed delivery with confidence scores
├── claw/            # Clawern monitoring dashboard
├── dispatch/        # Voice Dispatch
└── agent-builder/   # Custom agent builder

site/                # Marketing site (static, Netlify)
menubar/             # macOS menu bar app (SwiftUI)
tests/               # 1507 tests across 92 files
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Copyright (c) 2025-2026 Antti Innanen

See [NOTICE](NOTICE) for third-party attributions and dataset licenses.
