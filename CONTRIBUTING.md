# Contributing to Lavern

Thanks for your interest in contributing. This guide will help you get started.

## Getting Started

```bash
git clone https://github.com/AnttiHero/Marble.git
cd Marble
npm install
cd viz && npm install && cd ..
npm run dev -- --serve
```

The dashboard opens at `http://localhost:3000`. Demo mode works without an API key.

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run checks: `npm run typecheck:all && npm test`
4. Submit a pull request

## Code Standards

- **TypeScript** for all backend and frontend code
- **Zero TSC errors** required (both `src/` and `viz/`)
- **All tests must pass** before merging
- **Inline styles** in React components (project convention, not CSS modules)
- **No em dashes** in user-facing copy

## Adding a New Agent

1. Create prompt file: `src/agents/prompts/your-agent.ts`
2. Add profile: `src/agents/profiles.ts` (skills, personality, cost tier)
3. Add definition: `src/agents/definitions.ts` (prompt, tools, model, maxTurns)
4. Add to workflow: `src/workflows/templates/` (requiredAgents array)
5. Write tests

## Adding a New MCP Tool

Follow the factory pattern in `src/mcp/tools/verification-engine.ts`:
- Tool takes `SessionState` as closure
- Emit events via `session.events.emitEvent()`
- Return `{ content: [{ type: 'text', text: '...' }] }`
- Add to tool permissions in `src/permissions/`

## Non-Negotiable Rules

These apply to all contributions:

- **Human gates cannot be skipped or auto-approved**
- **Confidence thresholds cannot be relaxed**
- **Preservation categories are absolute** (monetary amounts, time periods, jurisdiction, etc.)
- **Every finding must include evidence**
- **The decline_to_find tool must remain available**
- **Live document always outranks stored precedent**

## Running Tests

```bash
npm test                    # All tests
npm run test:watch          # Watch mode
npm run test:integration    # Integration tests only
```

## Questions?

Open an issue. We're happy to help.
