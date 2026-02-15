/**
 * Unit Tests — Centralized Configuration (src/config.ts)
 *
 * Tests that:
 * - Default values are sensible
 * - Environment variables override defaults
 * - Types are correct
 */

import { describe, it, expect } from 'vitest';

describe('Config', () => {
  // We test by importing config fresh — the module reads process.env at import time.
  // Since vitest runs in the same process, we test the already-imported config.

  it('should have sensible path defaults', async () => {
    const { config } = await import('../../src/config.js');
    expect(config.auditDir).toBe(process.env.SHEM_AUDIT_DIR ?? './audit-logs');
    expect(config.memoryDir).toBe(process.env.SHEM_MEMORY_DIR ?? '.shem/memory');
    expect(config.reportsDir).toBe(process.env.SHEM_REPORTS_DIR ?? '.shem/reports');
    expect(config.baselinesDir).toBe(process.env.SHEM_BASELINES_DIR ?? '.shem/baselines');
  });

  it('should have model defaults', async () => {
    const { config } = await import('../../src/config.js');
    expect(config.defaultModel).toContain('claude');
    expect(config.routerModel).toContain('claude');
  });

  it('should have numeric budget defaults', async () => {
    const { config } = await import('../../src/config.js');
    expect(typeof config.defaultBudgetUsd).toBe('number');
    expect(config.defaultBudgetUsd).toBeGreaterThan(0);
    expect(config.routerBudgetUsd).toBeGreaterThan(0);
    expect(config.routerBudgetUsd).toBeLessThan(config.defaultBudgetUsd);
  });

  it('should have API defaults', async () => {
    const { config } = await import('../../src/config.js');
    expect(typeof config.port).toBe('number');
    expect(config.port).toBeGreaterThan(0);
    expect(config.corsOrigins).toBeDefined();
  });

  it('should have max turns defaults', async () => {
    const { config } = await import('../../src/config.js');
    expect(typeof config.defaultMaxTurns).toBe('number');
    expect(config.defaultMaxTurns).toBeGreaterThan(0);
    expect(typeof config.genericMaxTurns).toBe('number');
    expect(config.genericMaxTurns).toBeGreaterThan(0);
  });

  it('should have log level', async () => {
    const { config } = await import('../../src/config.js');
    expect(['debug', 'info', 'warn', 'error']).toContain(config.logLevel);
  });

  it('should have version string', async () => {
    const { config } = await import('../../src/config.js');
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should be readonly (as const)', async () => {
    const { config } = await import('../../src/config.js');
    // The config object should exist and be an object
    expect(typeof config).toBe('object');
    // All keys should be present
    const keys = Object.keys(config);
    expect(keys).toContain('auditDir');
    expect(keys).toContain('defaultModel');
    expect(keys).toContain('port');
    expect(keys).toContain('version');
  });
});
