/**
 * Lavern doctor — first-90-seconds health check.
 *
 * Surfaces the most common reasons a fresh install bounces:
 *   . Node version too old
 *   . better-sqlite3 native binding failed to compile
 *   . viz/ dashboard deps not installed
 *   . API ports already in use
 *   . No API key configured (informational, not fatal)
 *
 * Output is colour-coded when stdout is a TTY, plain otherwise (CI-safe).
 * Exit code: 0 if every required check passes, 1 if any required check
 * fails. Warnings (no API key, low disk) do not flip the exit code.
 */

import { existsSync, statfsSync } from 'node:fs';
import * as path from 'node:path';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);

const ttyColours = process.stdout.isTTY;
const c = {
  reset: ttyColours ? '\x1b[0m' : '',
  bold:  ttyColours ? '\x1b[1m' : '',
  dim:   ttyColours ? '\x1b[2m' : '',
  green: ttyColours ? '\x1b[32m' : '',
  red:   ttyColours ? '\x1b[31m' : '',
  amber: ttyColours ? '\x1b[33m' : '',
};

type Severity = 'pass' | 'warn' | 'fail';

interface Check {
  name: string;
  severity: Severity;
  detail?: string;
  hint?: string;
}

function icon(s: Severity): string {
  if (s === 'pass') return `${c.green}✓${c.reset}`;
  if (s === 'warn') return `${c.amber}!${c.reset}`;
  return `${c.red}✗${c.reset}`;
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function runChecks(repoRoot: string): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Node version
  const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({
    name: `Node v${process.versions.node}`,
    severity: nodeMajor >= 22 ? 'pass' : 'fail',
    hint: nodeMajor >= 22 ? undefined : 'Lavern requires Node 22+. Try: nvm install 22 && nvm use 22',
  });

  // 2. better-sqlite3 native binding loads
  try {
    require('better-sqlite3');
    checks.push({ name: 'better-sqlite3 native binding', severity: 'pass' });
  } catch (err) {
    checks.push({
      name: 'better-sqlite3 native binding',
      severity: 'fail',
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
      hint: 'Reinstall after ensuring a C/C++ toolchain is present.\n     macOS: xcode-select --install   Linux: apt install build-essential',
    });
  }

  // 3. Dashboard deps
  const vizNodeModules = path.join(repoRoot, 'viz', 'node_modules');
  checks.push({
    name: 'Dashboard deps (viz/node_modules)',
    severity: existsSync(vizNodeModules) ? 'pass' : 'fail',
    hint: existsSync(vizNodeModules) ? undefined : 'Run: cd viz && npm install',
  });

  // 4. Sample document present
  const samplePath = path.join(repoRoot, 'samples', 'sample-terms-of-service.txt');
  checks.push({
    name: 'Bundled sample (samples/sample-terms-of-service.txt)',
    severity: existsSync(samplePath) ? 'pass' : 'warn',
    hint: existsSync(samplePath) ? undefined : 'Sample file missing. Re-clone or fetch from GitHub.',
  });

  // 5. .env present
  const envPath = path.join(repoRoot, '.env');
  const envExamplePath = path.join(repoRoot, '.env.example');
  if (existsSync(envPath)) {
    checks.push({ name: '.env file', severity: 'pass' });
  } else if (existsSync(envExamplePath)) {
    checks.push({
      name: '.env file',
      severity: 'warn',
      detail: 'not yet created',
      hint: '.env will be auto-created from .env.example on first server start.',
    });
  } else {
    checks.push({ name: '.env file', severity: 'fail', detail: 'neither .env nor .env.example found' });
  }

  // 6. API key configured (info only, not required for demo mode)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.LAVERN_PROVIDER ?? 'anthropic';
  const providerKeyEnv: Record<string, string> = {
    mistral: 'MISTRAL_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    kimi: process.env.KIMI_API_KEY ? 'KIMI_API_KEY' : 'MOONSHOT_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  };
  const providerEnv = providerKeyEnv[provider];
  if (providerEnv) {
    const key = process.env[providerEnv];
    checks.push({
      name: `${providerEnv} (provider=${provider})`,
      severity: key && key.length > 10 ? 'pass' : 'fail',
      hint: key ? undefined : `Set ${providerEnv} in .env.`,
    });
  } else if (provider === 'local') {
    checks.push({ name: 'Ollama (provider=local)', severity: 'warn', detail: 'check skipped; doctor does not probe local model' });
  } else {
    checks.push({
      name: 'ANTHROPIC_API_KEY',
      severity: anthropicKey && anthropicKey.length > 10 ? 'pass' : 'warn',
      detail: anthropicKey ? 'configured' : 'not set',
      hint: anthropicKey ? undefined : 'Set ANTHROPIC_API_KEY in .env to run real engagements. The dashboard and demo tour work without it.',
    });
  }

  // 7. Data directory writable
  const dataDir = process.env.SHEM_DATA_DIR ?? path.join(homedir(), '.lavern');
  try {
    // attempt to create + write
    const fs = await import('node:fs');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const probe = path.join(dataDir, '.doctor-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    checks.push({ name: `Data directory (${dataDir})`, severity: 'pass' });
  } catch (err) {
    checks.push({
      name: `Data directory (${dataDir})`,
      severity: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 8. Port 3000 free
  const apiFree = await checkPort(3000);
  checks.push({
    name: 'Port 3000 (API server)',
    severity: apiFree ? 'pass' : 'warn',
    hint: apiFree ? undefined : 'Already in use. Free it, or set SHEM_PORT in .env to a free port.',
  });

  // 9. Port 5173 free
  const vizFree = await checkPort(5173);
  checks.push({
    name: 'Port 5173 (dashboard)',
    severity: vizFree ? 'pass' : 'warn',
    hint: vizFree ? undefined : 'Already in use. Vite will fall through to 5174 automatically, or stop the other process.',
  });

  // 10. Disk space
  try {
    const stats = statfsSync(dataDir);
    const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3);
    checks.push({
      name: 'Disk space',
      severity: freeGb > 1 ? 'pass' : 'warn',
      detail: `${freeGb.toFixed(1)} GB free`,
    });
  } catch {
    // statfs not available on this platform; skip silently
  }

  return checks;
}

export async function runDoctor(): Promise<number> {
  const repoRoot = process.cwd();

  console.log('');
  console.log(`${c.bold}Lavern doctor${c.reset}    ${c.dim}health check for the install${c.reset}`);
  console.log('');

  const checks = await runChecks(repoRoot);

  for (const ch of checks) {
    const detail = ch.detail ? `   ${c.dim}${ch.detail}${c.reset}` : '';
    console.log(`  ${icon(ch.severity)} ${ch.name}${detail}`);
    if (ch.hint) {
      const lines = ch.hint.split('\n');
      for (const line of lines) console.log(`     ${c.dim}${line}${c.reset}`);
    }
  }

  console.log('');

  const fails = checks.filter(c => c.severity === 'fail').length;
  const warns = checks.filter(c => c.severity === 'warn').length;

  if (fails > 0) {
    console.log(`  ${c.red}${fails} check${fails === 1 ? '' : 's'} failed.${c.reset} Fix the items marked ✗ above and re-run \`lavern doctor\`.`);
    console.log('');
    return 1;
  }

  if (warns > 0) {
    console.log(`  ${c.green}All required checks passed${c.reset} ${c.dim}(${warns} warning${warns === 1 ? '' : 's'})${c.reset}.`);
  } else {
    console.log(`  ${c.green}All checks passed.${c.reset}`);
  }
  console.log('');
  console.log('  Next:');
  console.log('');
  console.log(`    ${c.bold}Terminal 1${c.reset}   npm run serve:dev          ${c.dim}# API server on :3000${c.reset}`);
  console.log(`    ${c.bold}Terminal 2${c.reset}   cd viz && npm run dev      ${c.dim}# Dashboard on :5173${c.reset}`);
  console.log('');
  console.log(`    Then open ${c.bold}http://localhost:5173${c.reset}.`);
  console.log('');
  return 0;
}
