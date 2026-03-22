/**
 * Daemon Factory — Platform-aware daemon management.
 *
 * Routes daemon commands to the correct implementation:
 * - macOS → launchd (LaunchAgent plist)
 * - Linux → systemd (user service)
 *
 * Both platforms support the same CLI: install, uninstall, status, logs.
 */

import type { DaemonStatus } from './daemon.js';

function isMacOS(): boolean { return process.platform === 'darwin'; }
function isLinux(): boolean { return process.platform === 'linux'; }

function unsupported(): never {
  throw new Error(`Daemon mode is not supported on ${process.platform}. Use manual mode: lavern --serve --claw`);
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  if (isMacOS()) {
    const { getDaemonStatus } = await import('./daemon.js');
    return getDaemonStatus();
  }
  if (isLinux()) {
    const { getDaemonStatusSystemd } = await import('./daemon-systemd.js');
    return getDaemonStatusSystemd();
  }
  // Fallback: return not-installed status for unsupported platforms
  return { installed: false, running: false, label: 'lavern-claw', plistPath: '', logDir: '' };
}

export async function runDaemon(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'status';

  if (isMacOS()) {
    const daemon = await import('./daemon.js');
    // Remove the platform guard — we already know we're on macOS
    switch (subcommand) {
      case 'install': daemon.installDaemon(); break;
      case 'uninstall': daemon.uninstallDaemon(); break;
      case 'status': daemon.printDaemonStatus(); break;
      case 'logs': daemon.tailLogs(); break;
      default:
        console.log(`\nUnknown daemon command: ${subcommand}`);
        console.log('Usage: lavern claw daemon [install|uninstall|status|logs]\n');
    }
    return;
  }

  if (isLinux()) {
    const daemon = await import('./daemon-systemd.js');
    switch (subcommand) {
      case 'install': daemon.installDaemonSystemd(); break;
      case 'uninstall': daemon.uninstallDaemonSystemd(); break;
      case 'status': daemon.printDaemonStatusSystemd(); break;
      case 'logs': daemon.tailLogsSystemd(); break;
      default:
        console.log(`\nUnknown daemon command: ${subcommand}`);
        console.log('Usage: lavern claw daemon [install|uninstall|status|logs]\n');
    }
    return;
  }

  console.error(`\nDaemon mode is not supported on ${process.platform}.`);
  console.error('Supported: macOS (launchd), Linux (systemd).');
  console.error('For manual mode: lavern --serve --claw\n');
}
