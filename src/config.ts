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
  host: process.env.SHEM_HOST ?? '0.0.0.0',
  corsOrigins: process.env.SHEM_CORS_ORIGINS ?? '*',
  baseUrl: process.env.SHEM_BASE_URL ?? 'http://localhost:3000',
  trustProxy: process.env.SHEM_TRUST_PROXY === 'true',
  /** Max upload file size in bytes (default: 10 MB) */
  maxUploadBytes: parseInt(process.env.SHEM_MAX_UPLOAD_BYTES ?? String(10_000_000), 10),

  // ── Rate Limiting ───────────────────────────────────────────────────
  /** Max requests per window per IP (default: 100/min) */
  rateLimitMax: parseInt(process.env.SHEM_RATE_LIMIT_MAX ?? '100', 10),
  /** Rate limit window in ms (default: 60 000 = 1 minute) */
  rateLimitWindowMs: parseInt(process.env.SHEM_RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  /** Max session-creation requests per window per IP (default: 10/min) */
  rateLimitSessionMax: parseInt(process.env.SHEM_RATE_LIMIT_SESSION_MAX ?? '10', 10),

  // ── Payment (x402 — USDC on Base) ───────────────────────────────────
  x402Enabled: process.env.SHEM_X402_ENABLED === 'true',
  x402RecipientAddress: process.env.SHEM_X402_RECIPIENT ?? '',

  // ── Budgets ────────────────────────────────────────────────────────────
  defaultBudgetUsd: parseFloat(process.env.SHEM_DEFAULT_BUDGET ?? '5.0'),
  routerBudgetUsd: 0.01,

  // ── Sessions ─────────────────────────────────────────────────────────
  /** Session TTL in ms before eviction (default: 4 hours) */
  sessionTtlMs: parseInt(process.env.SHEM_SESSION_TTL_MS ?? String(4 * 60 * 60 * 1000), 10),
  /** Max concurrent sessions (default: 100) */
  maxSessions: parseInt(process.env.SHEM_MAX_SESSIONS ?? '100', 10),

  // ── Orchestrator ───────────────────────────────────────────────────────
  defaultMaxTurns: parseInt(process.env.SHEM_MAX_TURNS ?? '80', 10),
  genericMaxTurns: parseInt(process.env.SHEM_GENERIC_MAX_TURNS ?? '60', 10),

  // ── Gates ──────────────────────────────────────────────────────────────
  /** Webhook gate timeout in ms (default: 30s) */
  gateWebhookTimeoutMs: parseInt(process.env.SHEM_GATE_WEBHOOK_TIMEOUT_MS ?? '30000', 10),

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
    // Security hardening (v0.8.1)
    maxFileSizeBytes: parseInt(process.env.MARBLE_CLAW_MAX_FILE_SIZE ?? String(10 * 1024 * 1024), 10),
    maxDocsPerScan: parseInt(process.env.MARBLE_CLAW_MAX_DOCS_PER_SCAN ?? '50', 10),
    // Notifications
    webhookUrl: process.env.MARBLE_CLAW_WEBHOOK_URL ?? '',
    notifyMacOs: process.env.MARBLE_CLAW_MACOS_NOTIFY !== 'false',
    /** Notification dedup window in ms (default: 5 minutes) */
    notifyDedupMs: parseInt(process.env.MARBLE_CLAW_NOTIFY_DEDUP_MS ?? String(5 * 60 * 1000), 10),
    // Local model for confidential documents (Ollama OpenAI-compatible API)
    localModelUrl: process.env.MARBLE_LOCAL_MODEL_URL ?? 'http://localhost:11434',
    localModel: process.env.MARBLE_LOCAL_MODEL ?? '',       // e.g., 'llama3.1:8b'
    localAnalysisModel: process.env.MARBLE_LOCAL_ANALYSIS_MODEL ?? '', // e.g., 'llama3.1:70b'
    // Heartbeat — periodic check-in (v17)
    heartbeatEnabled: process.env.MARBLE_CLAW_HEARTBEAT !== 'false',
    heartbeatIntervalMs: parseInt(
      process.env.MARBLE_CLAW_HEARTBEAT_INTERVAL ?? String(30 * 60 * 1000), 10
    ), // 30 min default
  },

  // ── Version ────────────────────────────────────────────────────────────
  version: '0.9.0',
} as const;
