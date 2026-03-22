/**
 * Daemon — systemd user service for Linux.
 *
 * Manages Claw Mode as a systemd user service (no root required).
 * Equivalent of daemon.ts (macOS LaunchAgent) for Linux servers.
 *
 * Commands mirror the macOS version:
 *   install   — Generate .service file + enable + start
 *   uninstall — Stop + disable + remove service file
 *   status    — Query service state + PID
 *   logs      — Follow journalctl output
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { ensureDir } from '../utils/fs-helpers.js';
import { config } from '../config.js';
import type { DaemonStatus } from './daemon.js';

// ── Constants ────────────────────────────────────────────────────────────

const SERVICE_NAME = 'lavern-claw';
const SERVICE_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const SERVICE_PATH = path.join(SERVICE_DIR, `${SERVICE_NAME}.service`);

function logDir(): string {
  return path.join(config.claw.dir, 'logs');
}

// ── Service File Generation ─────────────────────────────────────────────

function generateServiceFile(): string {
  const workDir = process.cwd();

  // Find node binary
  let nodePath: string;
  try {
    nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
  } catch {
    nodePath = '/usr/bin/node';
  }

  // Use compiled dist/ if available, else tsx
  const useCompiled = fs.existsSync(path.join(workDir, 'dist', 'index.js'));

  let execStart: string;
  if (useCompiled) {
    execStart = `${nodePath} ${path.join(workDir, 'dist', 'index.js')} --serve --claw`;
  } else {
    let tsxPath: string;
    try {
      tsxPath = execSync('which tsx', { encoding: 'utf-8' }).trim();
    } catch {
      tsxPath = path.join(workDir, 'node_modules', '.bin', 'tsx');
    }
    execStart = `${tsxPath} ${path.join(workDir, 'src', 'index.ts')} --serve --claw`;
  }

  // Environment file for API key (optional, dash prefix = don't fail if missing)
  const envFile = path.join(config.claw.dir, '.env');

  return `[Unit]
Description=Lavern Clawern — Law Firm on Retainer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execStart}
WorkingDirectory=${workDir}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
Environment=NODE_ENV=production
EnvironmentFile=-${envFile}

[Install]
WantedBy=default.target
`;
}

// ── Install ─────────────────────────────────────────────────────────────

export function installDaemonSystemd(): void {
  ensureDir(SERVICE_DIR);
  const logs = logDir();
  ensureDir(logs);

  // Write .env template if it doesn't exist
  const envFile = path.join(config.claw.dir, '.env');
  if (!fs.existsSync(envFile)) {
    fs.writeFileSync(envFile, '# Lavern Clawern environment\n# ANTHROPIC_API_KEY=sk-ant-...\n', { mode: 0o600 });
    console.log(`\nEnvironment file created at ${envFile}`);
    console.log('  Add your ANTHROPIC_API_KEY to this file.');
  }

  // Generate and write service file
  const serviceContent = generateServiceFile();
  fs.writeFileSync(SERVICE_PATH, serviceContent, 'utf-8');
  console.log(`\nService file written to ${SERVICE_PATH}`);

  // Reload + enable + start
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    execSync(`systemctl --user enable ${SERVICE_NAME}`, { stdio: 'inherit' });
    execSync(`systemctl --user start ${SERVICE_NAME}`, { stdio: 'inherit' });
    console.log(`\nService started: ${SERVICE_NAME}`);
    console.log(`\nThe firm is now running.`);
    console.log(`  Logs: journalctl --user-unit ${SERVICE_NAME} -f`);
    const host = config.baseUrl || `http://localhost:${config.port}`;
    console.log(`  Dashboard: ${host}/dashboard/`);
    console.log(`  API: ${host}/api/claw/status`);
    console.log(`\n  Stop: lavern claw daemon uninstall\n`);
  } catch (err) {
    console.error('Failed to start service:', err);
    console.log(`\nTry manually: systemctl --user start ${SERVICE_NAME}`);
  }
}

// ── Uninstall ───────────────────────────────────────────────────────────

export function uninstallDaemonSystemd(): void {
  if (!fs.existsSync(SERVICE_PATH)) {
    console.log(`\nNo service found at ${SERVICE_PATH}\n`);
    return;
  }

  try {
    execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: 'inherit' });
  } catch { /* may already be stopped */ }

  try {
    execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: 'inherit' });
  } catch { /* may already be disabled */ }

  fs.unlinkSync(SERVICE_PATH);

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
  } catch { /* best effort */ }

  console.log(`\nService stopped and removed.`);
  console.log(`The firm has closed for the day.\n`);
}

// ── Status ──────────────────────────────────────────────────────────────

export function getDaemonStatusSystemd(): DaemonStatus {
  const status: DaemonStatus = {
    installed: fs.existsSync(SERVICE_PATH),
    running: false,
    label: SERVICE_NAME,
    plistPath: SERVICE_PATH,
    logDir: logDir(),
  };

  if (status.installed) {
    try {
      const isActive = execSync(`systemctl --user is-active ${SERVICE_NAME} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      status.running = isActive === 'active';
    } catch {
      // Not running
    }

    if (status.running) {
      try {
        const pidOutput = execSync(`systemctl --user show -p MainPID ${SERVICE_NAME} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        const pidMatch = pidOutput.match(/MainPID=(\d+)/);
        if (pidMatch && pidMatch[1] !== '0') {
          status.pid = parseInt(pidMatch[1], 10);
        }
      } catch { /* PID unavailable */ }
    }
  }

  return status;
}

export function printDaemonStatusSystemd(): void {
  const status = getDaemonStatusSystemd();

  console.log(`\n  Service: ${status.label}`);
  console.log(`  Installed: ${status.installed ? 'yes' : 'no'}`);
  console.log(`  Running: ${status.running ? `yes (PID ${status.pid ?? 'unknown'})` : 'no'}`);
  console.log(`  Service file: ${status.plistPath}`);
  console.log(`  Logs: journalctl --user-unit ${SERVICE_NAME} -f\n`);

  if (!status.installed) {
    console.log('  Run `lavern claw daemon install` to start the firm.\n');
  }
}

// ── Tail Logs ───────────────────────────────────────────────────────────

export function tailLogsSystemd(): void {
  console.log(`\nFollowing logs for ${SERVICE_NAME}...\n`);

  try {
    const journal = spawn('journalctl', ['--user-unit', SERVICE_NAME, '-f', '--no-pager'], { stdio: 'inherit' });

    process.on('SIGINT', () => {
      journal.kill('SIGTERM');
      journal.on('exit', () => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    });
  } catch (err) {
    console.error('Failed to follow logs:', err);
    console.log(`Try manually: journalctl --user-unit ${SERVICE_NAME} -f\n`);
  }
}

// ── Exported for service file testing ───────────────────────────────────

export { generateServiceFile as _generateServiceFile };
