/**
 * Unit Tests — Claw Daemon systemd (src/claw/daemon-systemd.ts)
 *
 * Tests service file generation and structure.
 * Cannot test actual systemctl commands in CI — only validates output format.
 */

import { describe, it, expect } from 'vitest';
import { _generateServiceFile } from '../../src/claw/daemon-systemd.js';

describe('systemd service file generation', () => {
  const serviceContent = _generateServiceFile();

  it('produces valid INI-style content with required sections', () => {
    expect(serviceContent).toContain('[Unit]');
    expect(serviceContent).toContain('[Service]');
    expect(serviceContent).toContain('[Install]');
  });

  it('includes Description', () => {
    expect(serviceContent).toContain('Description=Lavern Clawern');
  });

  it('sets Type=simple', () => {
    expect(serviceContent).toContain('Type=simple');
  });

  it('includes ExecStart with a valid path', () => {
    expect(serviceContent).toMatch(/ExecStart=\/.+/);
  });

  it('sets Restart=on-failure', () => {
    expect(serviceContent).toContain('Restart=on-failure');
  });

  it('uses journal for stdout/stderr', () => {
    expect(serviceContent).toContain('StandardOutput=journal');
    expect(serviceContent).toContain('StandardError=journal');
  });

  it('sets NODE_ENV=production', () => {
    expect(serviceContent).toContain('Environment=NODE_ENV=production');
  });

  it('includes EnvironmentFile for API key', () => {
    expect(serviceContent).toMatch(/EnvironmentFile=-.*\.env/);
  });

  it('targets default.target for user services', () => {
    expect(serviceContent).toContain('WantedBy=default.target');
  });

  it('sets SyslogIdentifier', () => {
    expect(serviceContent).toContain('SyslogIdentifier=lavern-claw');
  });

  it('includes WorkingDirectory', () => {
    expect(serviceContent).toMatch(/WorkingDirectory=\/.+/);
  });

  it('sets RestartSec for crash recovery delay', () => {
    expect(serviceContent).toContain('RestartSec=10');
  });
});
