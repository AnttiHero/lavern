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

  // ── Provider ──────────────────────────────────────────────────────────
  provider: (process.env.MARBLE_PROVIDER ?? 'anthropic') as 'anthropic' | 'mistral',

  // ── Models ─────────────────────────────────────────────────────────────
  defaultModel: process.env.SHEM_MODEL ?? 'claude-opus-4-6',
  routerModel: process.env.SHEM_ROUTER_MODEL ?? 'claude-sonnet-4-5-20250929',

  // ── Mistral (EU-Sovereign Alternative) ──────────────────────────────
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY ?? '',
    baseUrl: process.env.MISTRAL_BASE_URL ?? 'https://api.mistral.ai/v1',
    defaultModel: process.env.MISTRAL_MODEL ?? 'mistral-large-latest',
    routerModel: process.env.MISTRAL_ROUTER_MODEL ?? 'mistral-small-latest',
    assemblyModel: process.env.MISTRAL_ASSEMBLY_MODEL ?? 'mistral-large-latest',
  },

  // ── API ────────────────────────────────────────────────────────────────
  port: parseInt(process.env.SHEM_PORT ?? '3000', 10),
  host: process.env.SHEM_HOST ?? '0.0.0.0',
  corsOrigins: process.env.SHEM_CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000',
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
  /** Max login attempts per window per IP (default: 5/min) */
  rateLimitAuthLoginMax: parseInt(process.env.SHEM_RATE_LIMIT_AUTH_LOGIN_MAX ?? '5', 10),
  /** Max signup attempts per window per IP (default: 3/min) */
  rateLimitAuthSignupMax: parseInt(process.env.SHEM_RATE_LIMIT_AUTH_SIGNUP_MAX ?? '3', 10),
  /** Auth rate limit window in ms (default: 60 000 = 1 minute) */
  rateLimitAuthWindowMs: parseInt(process.env.SHEM_RATE_LIMIT_AUTH_WINDOW_MS ?? '60000', 10),

  // ── Payment (x402 — USDC on Base) ───────────────────────────────────
  x402Enabled: process.env.SHEM_X402_ENABLED === 'true',
  x402RecipientAddress: process.env.SHEM_X402_RECIPIENT ?? '',

  // ── Stripe Billing ────────────────────────────────────────────────────
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    /** URL to redirect to after successful checkout */
    successUrl: process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:5173/?billing=success',
    /** URL to redirect to if checkout is cancelled */
    cancelUrl: process.env.STRIPE_CANCEL_URL ?? 'http://localhost:5173/?billing=cancelled',
    /** Plans: price ID → plan name mapping. Set via env or use defaults. */
    plans: {
      starter:      { monthlyCapUsd: 50,  maxSessionBudget: 10, label: 'Starter' },
      professional: { monthlyCapUsd: 200, maxSessionBudget: 25, label: 'Professional' },
      enterprise:   { monthlyCapUsd: 1000, maxSessionBudget: 50, label: 'Enterprise' },
    },
  },

  // ── Email (Resend) ─────────────────────────────────────────────────────
  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.MARBLE_EMAIL_FROM ?? 'Marble <hello@marble.legal>',
    appUrl: process.env.MARBLE_APP_URL ?? 'http://localhost:5173',
  },

  // ── Billable Hours (v22: Credit System) ────────────────────────────────
  billableHours: {
    /** USD cost per 1 billable hour (default $0.10). 50 hours ≈ $5 of compute. */
    rate: parseFloat(process.env.MARBLE_BILLABLE_HOUR_RATE ?? '0.10'),
    /** Welcome hours granted on signup with invite code */
    welcomeHours: parseInt(process.env.MARBLE_WELCOME_HOURS ?? '50', 10),
    /** When true, signup requires an invite code from the waitlist */
    waitlistEnabled: process.env.MARBLE_WAITLIST_ENABLED !== 'false',
    /** Admin key for waitlist management endpoints (X-Admin-Key header) */
    adminKey: process.env.MARBLE_ADMIN_KEY ?? '',
    /** Hour packs — one-time purchases, never expire */
    packs: {
      quick: { hours: 25,  priceEurCents: 500,  label: 'Quick Top-Off' },
      standard: { hours: 100, priceEurCents: 1900, label: 'Hour Pack' },
      bulk: { hours: 500, priceEurCents: 8900, label: 'Bulk' },
    } as Record<string, { hours: number; priceEurCents: number; label: string }>,
  },

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
  version: '0.10.0',
} as const;
