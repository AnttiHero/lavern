/**
 * Centralized Configuration — Single source of truth for all settings.
 *
 * All configurable values live here. Environment variables override defaults.
 * Import `config` anywhere you need a setting instead of using string literals.
 */

import * as os from 'node:os';
import * as path from 'node:path';

/** Parse an integer from env, falling back to default if the value is invalid. */
function safeInt(envVal: string | undefined, fallback: number): number {
  if (envVal === undefined) return fallback;
  const parsed = parseInt(envVal, 10);
  if (isNaN(parsed)) {
    console.warn(`[CONFIG] Invalid integer "${envVal}" — using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Parse a float from env, falling back to default if the value is invalid. */
function safeFloat(envVal: string | undefined, fallback: number): number {
  if (envVal === undefined) return fallback;
  const parsed = parseFloat(envVal);
  if (isNaN(parsed)) {
    console.warn(`[CONFIG] Invalid number "${envVal}" — using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

export const config = {
  // ── Paths ──────────────────────────────────────────────────────────────
  auditDir: process.env.SHEM_AUDIT_DIR ?? './audit-logs',
  memoryDir: process.env.SHEM_MEMORY_DIR ?? '.shem/memory',
  reportsDir: process.env.SHEM_REPORTS_DIR ?? '.shem/reports',
  baselinesDir: process.env.SHEM_BASELINES_DIR ?? '.shem/baselines',
  dbPath: process.env.SHEM_DB_PATH ?? './data/lavern.db',

  // ── Provider ──────────────────────────────────────────────────────────
  provider: (process.env.LAVERN_PROVIDER ?? 'anthropic') as 'anthropic' | 'mistral' | 'managed',

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
  port: safeInt(process.env.SHEM_PORT, 3000),
  host: process.env.SHEM_HOST ?? '0.0.0.0',
  corsOrigins: process.env.SHEM_CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000',
  baseUrl: process.env.SHEM_BASE_URL ?? 'http://localhost:3000',
  trustProxy: process.env.SHEM_TRUST_PROXY === 'true',
  /** Max upload file size in bytes (default: 10 MB) */
  maxUploadBytes: safeInt(process.env.SHEM_MAX_UPLOAD_BYTES, 10_000_000),

  // ── Rate Limiting ───────────────────────────────────────────────────
  /** Max requests per window per IP (default: 100/min) */
  rateLimitMax: safeInt(process.env.SHEM_RATE_LIMIT_MAX, 100),
  /** Rate limit window in ms (default: 60 000 = 1 minute) */
  rateLimitWindowMs: safeInt(process.env.SHEM_RATE_LIMIT_WINDOW_MS, 60_000),
  /** Max session-creation requests per window per IP (default: 10/min) */
  rateLimitSessionMax: safeInt(process.env.SHEM_RATE_LIMIT_SESSION_MAX, 10),
  /** Max login attempts per window per IP (default: 5/min) */
  rateLimitAuthLoginMax: safeInt(process.env.SHEM_RATE_LIMIT_AUTH_LOGIN_MAX, 5),
  /** Max signup attempts per window per IP (default: 3/min) */
  rateLimitAuthSignupMax: safeInt(process.env.SHEM_RATE_LIMIT_AUTH_SIGNUP_MAX, 3),
  /** Auth rate limit window in ms (default: 60 000 = 1 minute) */
  rateLimitAuthWindowMs: safeInt(process.env.SHEM_RATE_LIMIT_AUTH_WINDOW_MS, 60_000),

  // ── Payment (x402 — USDC on Base) ───────────────────────────────────
  x402Enabled: process.env.SHEM_X402_ENABLED === 'true',
  x402RecipientAddress: process.env.SHEM_X402_RECIPIENT ?? '',

  // ── Stripe Billing ────────────────────────────────────────────────────
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
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
    from: process.env.LAVERN_EMAIL_FROM ?? 'Lavern <hello@lavern.ai>',
    appUrl: process.env.LAVERN_APP_URL ?? 'http://localhost:5173',
  },

  // ── Auth Tokens & Recovery ────────────────────────────────────────────
  auth: {
    /** Password reset token TTL in ms (default: 1 hour) */
    resetTokenTtlMs: safeInt(process.env.LAVERN_RESET_TOKEN_TTL_MS, 60 * 60 * 1000),
    /** Email verification token TTL in ms (default: 24 hours) */
    verifyTokenTtlMs: safeInt(process.env.LAVERN_VERIFY_TOKEN_TTL_MS, 24 * 60 * 60 * 1000),
    /** Low balance warning threshold in hours (default: 5h) */
    lowBalanceThresholdHours: safeFloat(process.env.LAVERN_LOW_BALANCE_HOURS, 5),
    /** Rate limit for forgot-password (per window, default: 3) */
    rateLimitForgotPasswordMax: safeInt(process.env.SHEM_RATE_LIMIT_FORGOT_PASSWORD_MAX, 3),
    /** Rate limit for resend-verification (per window, default: 3) */
    rateLimitResendVerificationMax: safeInt(process.env.SHEM_RATE_LIMIT_RESEND_VERIFY_MAX, 3),
  },

  // ── Google OAuth ───────────────────────────────────────────────────────
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback',
  },

  // ── Voice (Deepgram STT + ElevenLabs TTS) ─────────────────────────────
  voice: {
    deepgramApiKey: process.env.LAVERN_DEEPGRAM_API_KEY ?? '',
    elevenlabsApiKey: process.env.LAVERN_ELEVENLABS_API_KEY ?? '',
    elevenlabsVoiceId: process.env.LAVERN_ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — warm female
    elevenlabsModelId: process.env.LAVERN_ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5',
  },

  // ── Billable Hours (v22: Credit System) ────────────────────────────────
  billableHours: {
    /** USD cost per 1 billable hour (default $0.10). 50 hours ≈ $5 of compute. */
    rate: safeFloat(process.env.LAVERN_BILLABLE_HOUR_RATE, 0.10),
    /** Welcome hours granted on signup with invite code */
    welcomeHours: safeInt(process.env.LAVERN_WELCOME_HOURS, 50),
    /** Free trial hours granted on signup without invite code (0 = no trial) */
    freeTrialHours: safeInt(process.env.LAVERN_FREE_TRIAL_HOURS, 10),
    /** Hours credited to both referrer and referee on successful referral */
    referralHours: safeInt(process.env.LAVERN_REFERRAL_HOURS, 10),
    /** When true, signup requires an invite code from the waitlist */
    waitlistEnabled: process.env.LAVERN_WAITLIST_ENABLED !== 'false',
    /** Admin key for waitlist management endpoints (X-Admin-Key header) */
    adminKey: process.env.LAVERN_ADMIN_KEY ?? '',
    /** Hour packs — one-time purchases, never expire */
    packs: {
      quick: { hours: 25,  priceEurCents: 500,  label: 'Quick Top-Off' },
      standard: { hours: 100, priceEurCents: 1900, label: 'Hour Pack' },
      bulk: { hours: 500, priceEurCents: 8900, label: 'Bulk' },
    } as Record<string, { hours: number; priceEurCents: number; label: string }>,
  },

  // ── Budgets ────────────────────────────────────────────────────────────
  defaultBudgetUsd: safeFloat(process.env.SHEM_DEFAULT_BUDGET, 5.0),
  routerBudgetUsd: 0.01,
  /** Platform-wide daily spend cap in USD. When reached, new sessions are rejected
   *  (in-flight sessions finish normally). Resets at midnight UTC. Tracker is
   *  real-time: recordSpend() is called on every session cost update, persisted
   *  to SQLite, and hydrated on startup so the fuse survives restarts. Set to 0
   *  to disable. Default: $500 — a realistic envelope for 1500+ test users. */
  dailySpendCapUsd: safeFloat(process.env.LAVERN_DAILY_SPEND_CAP_USD, 500.0),
  /** Webhook URL to notify the owner when daily spend reaches 80% of cap. */
  ownerAlertWebhook: process.env.LAVERN_OWNER_WEBHOOK ?? '',

  // ── Sessions ─────────────────────────────────────────────────────────
  /** Session TTL in ms before eviction (default: 4 hours) */
  sessionTtlMs: safeInt(process.env.SHEM_SESSION_TTL_MS, 4 * 60 * 60 * 1000),
  /** Max concurrent sessions (default: 100) */
  maxSessions: safeInt(process.env.SHEM_MAX_SESSIONS, 100),

  // ── Orchestrator ───────────────────────────────────────────────────────
  defaultMaxTurns: safeInt(process.env.SHEM_MAX_TURNS, 80),
  genericMaxTurns: safeInt(process.env.SHEM_GENERIC_MAX_TURNS, 60),

  // ── Gates ──────────────────────────────────────────────────────────────
  /** Webhook gate timeout in ms (default: 30s) */
  gateWebhookTimeoutMs: safeInt(process.env.SHEM_GATE_WEBHOOK_TIMEOUT_MS, 30_000),

  // ── Logging ────────────────────────────────────────────────────────────
  logLevel: (process.env.SHEM_LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',

  // ── Claw Mode (Law Firm on Retainer) ──────────────────────────────────
  claw: {
    dir: process.env.LAVERN_CLAW_DIR ?? path.join(os.homedir(), '.lavern'),
    defaultBudget: safeFloat(process.env.LAVERN_CLAW_BUDGET, 50.0),
    defaultPerDocBudget: safeFloat(process.env.LAVERN_CLAW_PER_DOC_BUDGET, 10.0),
    defaultIntensity: 'standard' as const,
    defaultStyle: 'elegant' as const,
    defaultFormats: ['markdown', 'docx'] as readonly string[],
    scanIntervalMs: safeInt(process.env.LAVERN_CLAW_SCAN_INTERVAL, 30_000),
    // Security hardening (v0.8.1)
    maxFileSizeBytes: safeInt(process.env.LAVERN_CLAW_MAX_FILE_SIZE, 10 * 1024 * 1024),
    maxDocsPerScan: safeInt(process.env.LAVERN_CLAW_MAX_DOCS_PER_SCAN, 50),
    // Notifications
    webhookUrl: process.env.LAVERN_CLAW_WEBHOOK_URL ?? '',
    notifyMacOs: process.env.LAVERN_CLAW_MACOS_NOTIFY !== 'false',
    /** Notification dedup window in ms (default: 5 minutes) */
    notifyDedupMs: safeInt(process.env.LAVERN_CLAW_NOTIFY_DEDUP_MS, 5 * 60 * 1000),
    // Local model for confidential documents (Ollama OpenAI-compatible API)
    localModelUrl: process.env.LAVERN_LOCAL_MODEL_URL ?? 'http://localhost:11434',
    localModel: process.env.LAVERN_LOCAL_MODEL ?? '',       // e.g., 'llama3.1:8b'
    localAnalysisModel: process.env.LAVERN_LOCAL_ANALYSIS_MODEL ?? '', // e.g., 'llama3.1:70b'
    /** Model for Claw document processing (default: Sonnet for batch cost efficiency) */
    model: process.env.LAVERN_CLAW_MODEL ?? 'claude-sonnet-4-5-20250929',
    // Heartbeat — periodic check-in (v17)
    heartbeatEnabled: process.env.LAVERN_CLAW_HEARTBEAT !== 'false',
    heartbeatIntervalMs: safeInt(process.env.LAVERN_CLAW_HEARTBEAT_INTERVAL, 30 * 60 * 1000),
    // Precedent Board — institutional memory (v0.13)
    precedentDecayDays: safeInt(process.env.LAVERN_CLAW_PRECEDENT_DECAY_DAYS, 30),
    precedentArchiveDays: safeInt(process.env.LAVERN_CLAW_PRECEDENT_ARCHIVE_DAYS, 90),
    precedentMaxOutcomes: safeInt(process.env.LAVERN_CLAW_PRECEDENT_MAX_OUTCOMES, 50),
    // Notification level: 'minimal' (counts only), 'summary' (default), 'full' (include evidence)
    notifyLevel: (process.env.LAVERN_CLAW_NOTIFY_LEVEL ?? 'summary') as 'minimal' | 'summary' | 'full',
    // Telegram notifications (v0.14)
    telegramToken: process.env.LAVERN_CLAW_TELEGRAM_TOKEN ?? '',
    telegramChatId: process.env.LAVERN_CLAW_TELEGRAM_CHAT_ID ?? '',
    // Email notifications for Claw alerts
    notifyEmail: process.env.LAVERN_CLAW_NOTIFY_EMAIL ?? '',
    // Weekly digest schedule
    digestDay: safeInt(process.env.LAVERN_CLAW_DIGEST_DAY, 1),    // 0=Sun, 1=Mon
    digestHour: safeInt(process.env.LAVERN_CLAW_DIGEST_HOUR, 9),  // Local hour
  },

  // ── Confidence Weights ─────────────────────────────────────────────────
  /** Weights for the overall confidence score (must sum to ~1.0). Tunable. */
  confidenceWeights: {
    findings: safeFloat(process.env.LAVERN_CONFIDENCE_W_FINDINGS, 0.3),
    resolutions: safeFloat(process.env.LAVERN_CONFIDENCE_W_RESOLUTIONS, 0.2),
    verification: safeFloat(process.env.LAVERN_CONFIDENCE_W_VERIFICATION, 0.3),
    evaluator: safeFloat(process.env.LAVERN_CONFIDENCE_W_EVALUATOR, 0.2),
  },

  // ── Archive Retention ──────────────────────────────────────────────────
  /** Days to retain session archives before auto-cleanup (default: 180) */
  archiveRetentionDays: safeInt(process.env.SHEM_ARCHIVE_RETENTION_DAYS, 180),

  // ── Version ────────────────────────────────────────────────────────────
  version: '0.14.0',
} as const;

// ── Production Startup Validation ──────────────────────────────────────
// In production, CRITICAL env vars cause immediate exit(1).
// Non-critical missing vars produce warnings only.

export function validateProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const fatal: string[] = [];
  const warnings: string[] = [];

  // ── Critical — server cannot function without these ──
  if (!process.env.ANTHROPIC_API_KEY && config.provider === 'anthropic') {
    fatal.push('ANTHROPIC_API_KEY is not set — all agent workflows will fail');
  }

  // ── Important but not fatal — degraded email functionality ──
  if (!process.env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY is not set — email notifications disabled (verification, reset, alerts)');
  }

  // ── Non-critical — degraded but functional ──
  if (!process.env.STRIPE_SECRET_KEY) {
    warnings.push('STRIPE_SECRET_KEY is not set — billing disabled');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push('STRIPE_WEBHOOK_SECRET is not set — webhooks will fail signature verification');
  }
  if (!process.env.LAVERN_ADMIN_KEY) {
    warnings.push('LAVERN_ADMIN_KEY is not set — admin endpoints disabled');
  }

  // Detect localhost defaults that should be overridden in production
  if (config.corsOrigins.includes('localhost')) {
    warnings.push('SHEM_CORS_ORIGINS still contains localhost — set to production domain');
  }
  if (config.stripe.successUrl.includes('localhost')) {
    warnings.push('STRIPE_SUCCESS_URL still points to localhost — set to production URL');
  }
  if (config.email.appUrl.includes('localhost')) {
    warnings.push('LAVERN_APP_URL still points to localhost — set to production URL');
  }
  if (config.baseUrl.includes('localhost')) {
    warnings.push('SHEM_BASE_URL still points to localhost — set to production URL');
  }

  // ── Fatal: exit immediately ──
  if (fatal.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: Missing critical environment variables               ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    fatal.forEach(f => console.error(`  ✗ ${f}`));
    console.error('\nServer cannot start. Set the required variables and try again.\n');
    process.exit(1);
  }

  // ── Warnings: log and continue ──
  if (warnings.length > 0) {
    console.warn('\n╔══════════════════════════════════════════════════════════════╗');
    console.warn('║  PRODUCTION CONFIGURATION WARNINGS                          ║');
    console.warn('╚══════════════════════════════════════════════════════════════╝');
    warnings.forEach(w => console.warn(`  ▸ ${w}`));
    console.warn('');
  }
}

// Run validation at import time (module load)
validateProductionConfig();
