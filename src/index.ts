#!/usr/bin/env node

/**
 * The Shem — CLI & API Entry Point
 *
 * v5: Dual-mode entry point with Router-based dispatch.
 *
 * CLI mode (default):
 *   npx tsx src/index.ts <document-path> [options]         — Legal design pipeline (backward compat)
 *   npx tsx src/index.ts --request "text" [options]        — Route through dispatch
 *   npx tsx src/index.ts --request "text" --workflow id    — Force specific workflow
 *
 * API mode:
 *   npx tsx src/index.ts --serve [--port 3000]
 *
 * Options:
 *   --moment <moment>          User moment: signup, checkout, exit, dispute, renewal, onboarding
 *   --audience <audience>      Target audience: consumer, smb, enterprise, employee
 *   --jurisdiction <region>    Jurisdiction: US, EU, UK, CA, AU
 *   --budget <amount>          Max budget in USD (default: 5.00)
 *   --model <model>            Model to use (default: claude-opus-4-7)
 *   --debug                    Enable debug logging
 *   --serve                    Start API server instead of CLI
 *   --port <port>              API server port (default: 3000)
 *   --request <text>           Free-text request (routes through dispatch)
 *   --workflow <id>            Force a specific workflow template
 */

// ── Raise libuv threadpool ceiling BEFORE any crypto/fs/dns call enters it ──
// Default is 4 threads. `crypto.scrypt` (password hashing) uses the pool, and
// under a signup surge 4 slots serialize sign-ups behind each other. Bumping
// to 16 gives ample headroom for 1500+ lawyers. MUST be set before any other
// import triggers pool work.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE ?? '16';

// ── Load .env before anything else so env vars are available at module init ──
import * as _fs from 'node:fs';
import * as _path from 'node:path';
{
  const envFile = _path.resolve(process.cwd(), '.env');
  if (_fs.existsSync(envFile)) {
    const lines = _fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { runTheShem } from './orchestrator.js';
import { dispatch } from './dispatch.js';
import type { DocumentContext, Moment, Audience, Jurisdiction, LegalRequest } from './types/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as net from 'node:net';
import { config } from './config.js';

// ── Pre-flight Checks ──────────────────────────────────────────────────

interface PreflightResult {
  check: string;
  ok: boolean;
  detail?: string;
}

async function runPreflightChecks(options: { port?: number; requireApiKey?: boolean } = {}): Promise<PreflightResult[]> {
  const results: PreflightResult[] = [];

  // 1. Provider readiness — Anthropic key (cloud), Ollama daemon (local), or
  //    Mistral key (EU sovereign). The pre-flight check adapts to the provider.
  const provider = config.provider;
  const apiKey = config.anthropic.apiKey;
  if (options.requireApiKey !== false) {
    if (provider === 'local') {
      const url = config.local.baseUrl;
      const model = config.local.defaultModel;
      let ok = false;
      let detail = '';
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${url.replace(/\/$/, '')}/api/tags`, { signal: controller.signal });
        clearTimeout(t);
        if (res.ok) {
          const data = await res.json() as { models?: Array<{ name?: string }> };
          const names = (data.models ?? []).map(m => m.name ?? '');
          if (names.some(n => n === model || n.startsWith(`${model}:`))) {
            ok = true;
            detail = `${model} ready at ${url}`;
          } else {
            detail = `Ollama running but ${model} not pulled. Run: ollama pull ${model}`;
          }
        } else {
          detail = `Ollama responded HTTP ${res.status} at ${url}`;
        }
      } catch (err) {
        detail = `Ollama unreachable at ${url} — is the menu-bar app running?`;
      }
      results.push({ check: 'Ollama (local model)', ok, detail });
    } else if (provider === 'mistral') {
      const mk = config.mistral.apiKey;
      results.push({
        check: 'MISTRAL_API_KEY',
        ok: !!mk && mk.length > 10,
        detail: mk ? 'configured' : 'MISSING — set MISTRAL_API_KEY in .env',
      });
    } else {
      results.push({
        check: 'ANTHROPIC_API_KEY',
        ok: !!apiKey && apiKey.length > 10,
        detail: apiKey ? 'configured' : 'MISSING — set ANTHROPIC_API_KEY in .env or environment',
      });
    }
  }

  // 2. Data directory writable
  const dbPath = config.dbPath;
  const dataDir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // Test write
    const testFile = path.join(dataDir, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    results.push({ check: 'Data directory', ok: true, detail: dataDir });
  } catch (err) {
    results.push({ check: 'Data directory', ok: false, detail: `Cannot write to ${dataDir}: ${err instanceof Error ? err.message : err}` });
  }

  // 3. Port available (API server mode only)
  if (options.port) {
    const portAvailable = await checkPort(options.port);
    results.push({
      check: `Port ${options.port}`,
      ok: portAvailable,
      detail: portAvailable ? 'available' : `EADDRINUSE — port ${options.port} is already in use`,
    });
  }

  // 4. Required directories exist (audit, memory)
  const auditDir = config.auditDir;
  try {
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }
    results.push({ check: 'Audit directory', ok: true, detail: auditDir });
  } catch {
    results.push({ check: 'Audit directory', ok: false, detail: `Cannot create ${auditDir}` });
  }

  // 5. Disk space (warn if < 1 GB)
  try {
    const stats = fs.statfsSync(dataDir);
    const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3);
    results.push({
      check: 'Disk space',
      ok: freeGb > 1,
      detail: `${freeGb.toFixed(1)} GB free${freeGb <= 1 ? ' — WARNING: low disk space' : ''}`,
    });
  } catch {
    results.push({ check: 'Disk space', ok: true, detail: 'statfs not available (skipped)' });
  }

  return results;
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

function printPreflightResults(results: PreflightResult[]): boolean {
  const allOk = results.every(r => r.ok);
  const icon = (ok: boolean) => ok ? '✓' : '✗';

  console.log('\n  Pre-flight checks:');
  for (const r of results) {
    const status = r.ok ? '\x1b[32m' : '\x1b[31m'; // green/red
    console.log(`    ${status}${icon(r.ok)}\x1b[0m ${r.check}: ${r.detail ?? ''}`);
  }
  console.log('');

  if (!allOk) {
    const critical = results.filter(r => !r.ok);
    console.error(`  ✗ ${critical.length} pre-flight check(s) failed. Fix the issues above before starting.`);
    console.error('');
  }

  return allOk;
}

function parseOptions(args: string[]): {
  positionalArgs: string[];
  options: Record<string, string | boolean>;
} {
  const positionalArgs: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'debug' || key === 'serve') {
        options[key] = true;
      } else {
        options[key] = args[++i] || '';
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  return { positionalArgs, options };
}

function parseDocumentArgs(args: string[]): {
  documentPath: string;
  context: DocumentContext;
  options: Record<string, string | boolean>;
} {
  const { positionalArgs, options } = parseOptions(args);

  const documentPath = positionalArgs[0];
  if (!documentPath) {
    console.error('Error: Document path is required.');
    console.error('Usage: npx tsx src/index.ts <document-path> [options]');
    console.error('');
    console.error('Example:');
    console.error('  npx tsx src/index.ts ./contract.txt --moment signup --audience consumer --jurisdiction EU');
    process.exit(1);
  }

  const resolvedPath = path.resolve(documentPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const context: DocumentContext = {
    moment: (options.moment as Moment) || 'signup',
    audience: (options.audience as Audience) || 'consumer',
    jurisdiction: (options.jurisdiction as Jurisdiction) || 'US',
    documentType: options.type as string | undefined,
    focus: options.focus as string | undefined,
  };

  return { documentPath: resolvedPath, context, options };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for --serve flag first
  if (args.includes('--serve')) {
    const portIndex = args.indexOf('--port');
    const _parsedPort = portIndex >= 0 ? parseInt(args[portIndex + 1] || '3000', 10) : 3000;
    const port = Number.isFinite(_parsedPort) && _parsedPort > 0 && _parsedPort <= 65535 ? _parsedPort : 3000;

    // Combined mode: --serve --claw — API server + Claw Mode together
    if (args.includes('--claw')) {
      const preflightResults = await runPreflightChecks({ port, requireApiKey: true });
      const preflightOk = printPreflightResults(preflightResults);
      if (!preflightOk) {
        const critical = preflightResults.filter(r => !r.ok && r.check !== 'Disk space');
        if (critical.length > 0) {
          console.error('  Aborting due to critical pre-flight failures.\n');
          process.exit(1);
        }
      }

      console.log(`Combined mode — API server + Clawern on port ${port}...`);
      const { startApiServer } = await import('./api/server.js');
      await startApiServer(port);
      // Start Claw Mode in background (watch mode, never exits)
      const { runClaw } = await import('./claw/index.js');
      await runClaw(['start']);
      return;
    }

    // Pre-flight checks before starting server.
    // For local provider, the Ollama check IS run (it's the actual readiness
    // signal — daemon must be running and the model pulled). For Anthropic
    // mode, the API key check is informational only — server starts in demo
    // mode without it (legacy behaviour preserved).
    const isLocal = config.provider === 'local';
    const preflightResults = await runPreflightChecks({ port, requireApiKey: isLocal });
    const preflightOk = printPreflightResults(preflightResults);
    if (!preflightOk) {
      const critical = preflightResults.filter(r => !r.ok && r.check !== 'Disk space');
      if (critical.length > 0) {
        console.error('  Aborting due to critical pre-flight failures.\n');
        process.exit(1);
      }
      // Non-critical warnings (disk space) — continue with warning
    }

    // Auto-copy .env.example → .env if no .env exists
    const envPath = path.join(process.cwd(), '.env');
    const examplePath = path.join(process.cwd(), '.env.example');
    if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      console.log('  📋 Created .env from .env.example — add your API keys to enable full functionality.\n');
    }

    const provider = config.provider;
    const hasAnthropicKey = !!config.anthropic.apiKey;

    if (provider === 'local') {
      const url = config.local.baseUrl;
      const model = config.local.defaultModel;
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  LOCAL MODE — on-device inference via Ollama                ║');
      console.log(`║  Endpoint: ${url.padEnd(48)} ║`);
      console.log(`║  Model:    ${model.padEnd(48)} ║`);
      console.log('║  Cost:     $0.00/run — nothing leaves this machine          ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
    } else if (provider === 'mistral') {
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  EU SOVEREIGN MODE — Mistral (Paris)                        ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
    } else if (!hasAnthropicKey) {
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  DEMO MODE — no ANTHROPIC_API_KEY detected                  ║');
      console.log('║  Dashboard, auth, and Clawern dashboard will work.          ║');
      console.log('║  Agent workflows require an API key in .env                 ║');
      console.log('║  (or set LAVERN_PROVIDER=local for on-device inference)     ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
    }

    console.log(`API server mode — starting on port ${port}...`);
    // Dynamic import to avoid loading Fastify unless needed
    const { startApiServer } = await import('./api/server.js');
    await startApiServer(port);
    return;
  }

  // Claw Mode — the firm on retainer
  if (args[0] === 'claw') {
    const { runClaw } = await import('./claw/index.js');
    await runClaw(args.slice(1));
    return;
  }

  // Show help
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
\u2554${'═'.repeat(62)}\u2557
\u2551                          LAVERN v0.14.5                      \u2551
\u2551                                                              \u2551
\u2551         The world's first driverless law firm.               \u2551
\u2551         Multi-agent legal design system.                     \u2551
\u2551                                                              \u2551
\u255a${'═'.repeat(62)}\u255d

Usage:
  lavern <document-path> [options]                  Document redesign (legal-design pipeline)
  lavern --request "text" [options]                 Route through dispatch (auto-selects workflow)
  lavern --request "text" --workflow id             Force specific workflow

Clawern (Law Firm on Retainer):
  lavern claw init                                  Onboard — create client profile
  lavern claw start [options]                       Start the firm (watch + process)
  lavern claw status                                Show current state
  lavern claw start --once                          Batch mode — process all, then exit
  lavern claw start --dry-run                       Preview what would be processed
  lavern claw daemon install                        Install as macOS LaunchAgent
  lavern claw daemon uninstall                      Remove LaunchAgent
  lavern claw daemon status                         Show daemon service status
  lavern claw daemon logs                           Tail daemon log files

CLI Options:
  --moment <moment>          User moment (default: signup)
                             signup, checkout, exit, dispute, renewal, onboarding
  --audience <audience>      Target audience (default: consumer)
                             consumer, smb, enterprise, employee
  --jurisdiction <region>    Jurisdiction (default: US)
                             US, EU, UK, CA, AU
  --budget <amount>          Max budget in USD (default: 5.00)
  --model <model>            Model (default: claude-opus-4-7)
  --debug                    Enable debug logging
  --request <text>           Free-text legal request (routes through dispatch)
  --workflow <id>            Force a specific workflow (counsel, review, adversarial, roundtable, full-bench, legal-design)
  --help                     Show this help

API Server:
  --serve                    Start API + WebSocket server
  --serve --claw             API + Clawern together (Mac Mini mode)
  --port <port>              Server port (default: 3000)

Examples:
  npx tsx src/index.ts ./terms-of-service.txt --moment signup --audience consumer --jurisdiction EU
  npx tsx src/index.ts --request "Review this NDA for red flags" --budget 3.00
  npx tsx src/index.ts ./contract.pdf --request "Review this contract" --workflow review
  npx tsx src/index.ts --request "What is force majeure?" --workflow counsel
  npx tsx src/index.ts --request "Research non-compete enforceability in California" --workflow adversarial
  npx tsx src/index.ts --serve --port 3000

What happens:
  1. The Router classifies your request and selects the minimum viable workflow
  2. Specialist agents analyze your document / answer your question
  3. The Evaluator Gate checks quality (automated, different model)
  4. You approve key decisions at human gates
  5. Output: redesigned document / contract review / legal answer + audit trail
`);
    return;
  }

  // Parse args
  const { positionalArgs, options } = parseOptions(args);

  // Determine mode: --request flag → dispatch mode, document path → legacy mode
  const requestText = options.request as string | undefined;
  const documentPath = positionalArgs[0];
  const forceWorkflow = options.workflow as string | undefined;

  if (requestText || forceWorkflow) {
    // v5: Dispatch mode — route through the Router
    const request: LegalRequest = {
      type: 'general',  // Router will classify
      requestText: requestText || undefined,
      documentPath: documentPath ? path.resolve(documentPath) : undefined,
      context: {
        moment: (options.moment as Moment) || undefined,
        audience: (options.audience as Audience) || undefined,
        jurisdiction: (options.jurisdiction as Jurisdiction) || undefined,
        documentType: options.type as string | undefined,
        focus: options.focus as string | undefined,
      },
    };

    // Validate document exists if provided
    if (request.documentPath && !fs.existsSync(request.documentPath)) {
      console.error(`Error: File not found: ${request.documentPath}`);
      process.exit(1);
    }

    await dispatch(request, {
      forceWorkflow,
      maxBudgetUsd: (() => { const b = options.budget ? parseFloat(options.budget as string) : undefined; return b !== undefined && Number.isFinite(b) && b > 0 ? b : undefined; })(),
      model: options.model as string | undefined,
      logLevel: options.debug ? 'debug' : 'info',
      cwd: request.documentPath ? path.dirname(request.documentPath) : process.cwd(),
    });
  } else {
    // Legacy mode: document path required
    const { documentPath: resolvedPath, context, options: parsedOptions } = parseDocumentArgs(args);

    await runTheShem(resolvedPath, context, {
      maxBudgetUsd: (() => { const b = parsedOptions.budget ? parseFloat(parsedOptions.budget as string) : undefined; return b !== undefined && Number.isFinite(b) && b > 0 ? b : undefined; })(),
      model: parsedOptions.model as string | undefined,
      logLevel: parsedOptions.debug ? 'debug' : 'info',
      cwd: path.dirname(resolvedPath),
    });
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
