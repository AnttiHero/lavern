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
 *   --model <model>            Model to use (default: claude-opus-4-6)
 *   --debug                    Enable debug logging
 *   --serve                    Start API server instead of CLI
 *   --port <port>              API server port (default: 3000)
 *   --request <text>           Free-text request (routes through dispatch)
 *   --workflow <id>            Force a specific workflow template
 */

import { runTheShem } from './orchestrator.js';
import { dispatch } from './dispatch.js';
import type { DocumentContext, Moment, Audience, Jurisdiction, LegalRequest } from './types/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as net from 'node:net';

// ── Pre-flight Checks ──────────────────────────────────────────────────

interface PreflightResult {
  check: string;
  ok: boolean;
  detail?: string;
}

async function runPreflightChecks(options: { port?: number; requireApiKey?: boolean } = {}): Promise<PreflightResult[]> {
  const results: PreflightResult[] = [];

  // 1. API key present
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (options.requireApiKey !== false) {
    results.push({
      check: 'ANTHROPIC_API_KEY',
      ok: !!apiKey && apiKey.length > 10,
      detail: apiKey ? 'configured' : 'MISSING — set ANTHROPIC_API_KEY in .env or environment',
    });
  }

  // 2. Data directory writable
  const dbPath = process.env.SHEM_DB_PATH ?? './data/whiteshoe.db';
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
  const auditDir = process.env.SHEM_AUDIT_DIR ?? './audit-logs';
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
    const port = portIndex >= 0 ? parseInt(args[portIndex + 1] || '3000', 10) : 3000;

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

      console.log(`Combined mode — API server + Claw Mode on port ${port}...`);
      const { startApiServer } = await import('./api/server.js');
      await startApiServer(port);
      // Start Claw Mode in background (watch mode, never exits)
      const { runClaw } = await import('./claw/index.js');
      await runClaw(['start']);
      return;
    }

    // Pre-flight checks before starting server
    const preflightResults = await runPreflightChecks({ port, requireApiKey: true });
    const preflightOk = printPreflightResults(preflightResults);
    if (!preflightOk) {
      const critical = preflightResults.filter(r => !r.ok && r.check !== 'Disk space');
      if (critical.length > 0) {
        console.error('  Aborting due to critical pre-flight failures.\n');
        process.exit(1);
      }
      // Non-critical warnings (disk space) — continue with warning
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
\u2551                        THE SHEM v6                           \u2551
\u2551              "We know what's written in the Golem's mouth"   \u2551
\u2551                                                              \u2551
\u2551         The world's first driverless law firm.               \u2551
\u2551         Multi-agent legal design system.                     \u2551
\u255a${'═'.repeat(62)}\u255d

Usage:
  whiteshoe <document-path> [options]                  Document redesign (legal-design pipeline)
  whiteshoe --request "text" [options]                 Route through dispatch (auto-selects workflow)
  whiteshoe --request "text" --workflow id             Force specific workflow

Claw Mode (Law Firm on Retainer):
  whiteshoe claw init                                  Onboard — create client profile
  whiteshoe claw start [options]                       Start the firm (watch + process)
  whiteshoe claw status                                Show current state
  whiteshoe claw start --once                          Batch mode — process all, then exit
  whiteshoe claw start --dry-run                       Preview what would be processed
  whiteshoe claw daemon install                        Install as macOS LaunchAgent
  whiteshoe claw daemon uninstall                      Remove LaunchAgent
  whiteshoe claw daemon status                         Show daemon service status
  whiteshoe claw daemon logs                           Tail daemon log files

CLI Options:
  --moment <moment>          User moment (default: signup)
                             signup, checkout, exit, dispute, renewal, onboarding
  --audience <audience>      Target audience (default: consumer)
                             consumer, smb, enterprise, employee
  --jurisdiction <region>    Jurisdiction (default: US)
                             US, EU, UK, CA, AU
  --budget <amount>          Max budget in USD (default: 5.00)
  --model <model>            Model (default: claude-opus-4-6)
  --debug                    Enable debug logging
  --request <text>           Free-text legal request (routes through dispatch)
  --workflow <id>            Force a specific workflow (counsel, review, adversarial, roundtable, full-bench, legal-design)
  --help                     Show this help

API Server:
  --serve                    Start API + WebSocket server
  --serve --claw             API + Claw Mode together (Mac Mini mode)
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
      maxBudgetUsd: options.budget ? parseFloat(options.budget as string) : undefined,
      model: options.model as string | undefined,
      logLevel: options.debug ? 'debug' : 'info',
      cwd: request.documentPath ? path.dirname(request.documentPath) : process.cwd(),
    });
  } else {
    // Legacy mode: document path required
    const { documentPath: resolvedPath, context, options: parsedOptions } = parseDocumentArgs(args);

    await runTheShem(resolvedPath, context, {
      maxBudgetUsd: parsedOptions.budget ? parseFloat(parsedOptions.budget as string) : undefined,
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
