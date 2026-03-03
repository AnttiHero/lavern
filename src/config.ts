/**
 * Centralized Configuration — Single source of truth for all settings.
 *
 * All configurable values live here. Environment variables override defaults.
 * Import `config` anywhere you need a setting instead of using string literals.
 */

import * as os from 'node:os';
import * as path from 'node:path';

export const config = {
  // ── Paths ──────────────────────────────────────────────────────────────
  auditDir: process.env.SHEM_AUDIT_DIR ?? './audit-logs',
  memoryDir: process.env.SHEM_MEMORY_DIR ?? '.shem/memory',
  reportsDir: process.env.SHEM_REPORTS_DIR ?? '.shem/reports',
  baselinesDir: process.env.SHEM_BASELINES_DIR ?? '.shem/baselines',
  dbPath: process.env.SHEM_DB_PATH ?? './data/marble.db',

  // ── Models ─────────────────────────────────────────────────────────────
  defaultModel: process.env.SHEM_MODEL ?? 'claude-opus-4-6',
  routerModel: process.env.SHEM_ROUTER_MODEL ?? 'claude-sonnet-4-5-20250929',

  // ── API ────────────────────────────────────────────────────────────────
  port: parseInt(process.env.SHEM_PORT ?? '3000', 10),
  corsOrigins: process.env.SHEM_CORS_ORIGINS ?? '*',
  baseUrl: process.env.SHEM_BASE_URL ?? 'http://localhost:3000',

  // ── Payment (x402 — USDC on Base) ───────────────────────────────────
  x402Enabled: process.env.SHEM_X402_ENABLED === 'true',
  x402RecipientAddress: process.env.SHEM_X402_RECIPIENT ?? '',

  // ── Budgets ────────────────────────────────────────────────────────────
  defaultBudgetUsd: parseFloat(process.env.SHEM_DEFAULT_BUDGET ?? '5.0'),
  routerBudgetUsd: 0.01,

  // ── Orchestrator ───────────────────────────────────────────────────────
  defaultMaxTurns: parseInt(process.env.SHEM_MAX_TURNS ?? '80', 10),
  genericMaxTurns: parseInt(process.env.SHEM_GENERIC_MAX_TURNS ?? '60', 10),

  // ── Logging ────────────────────────────────────────────────────────────
  logLevel: (process.env.SHEM_LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',

  // ── Cost Tiers (v8: Law Firm) ─────────────────────────────────────────
  costTiers: {
    opus:   { model: 'claude-opus-4-6',            multiplier: 3.0, label: 'Partner / Senior (Opus)' },
    sonnet: { model: 'claude-sonnet-4-5-20250929',  multiplier: 1.0, label: 'Associate / Specialist (Sonnet)' },
    haiku:  { model: 'claude-haiku-3-5-20250929',   multiplier: 0.3, label: 'Junior / Paralegal (Haiku)' },
  },

  // ── Claw Mode (Law Firm on Retainer) ──────────────────────────────────
  claw: {
    dir: process.env.MARBLE_CLAW_DIR ?? path.join(os.homedir(), '.marble'),
    defaultBudget: parseFloat(process.env.MARBLE_CLAW_BUDGET ?? '50.0'),
    defaultPerDocBudget: parseFloat(process.env.MARBLE_CLAW_PER_DOC_BUDGET ?? '10.0'),
    defaultIntensity: 'standard' as const,
    defaultStyle: 'elegant' as const,
    defaultFormats: ['markdown', 'docx'] as readonly string[],
    scanIntervalMs: parseInt(process.env.MARBLE_CLAW_SCAN_INTERVAL ?? '30000', 10),
  },

  // ── Version ────────────────────────────────────────────────────────────
  version: '0.8.0',
} as const;
