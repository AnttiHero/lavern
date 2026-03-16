/**
 * Database Layer — SQLite persistence for users, sessions, matters, and knowledge base.
 *
 * Uses better-sqlite3 (synchronous, fast, zero-config).
 * The DB file lives at ./data/whiteshoe.db by default.
 *
 * Live sessions stay in-memory (SessionManager handles EventBus, WebSocket).
 * SQLite stores the archive: completed sessions, user accounts, matters.
 * Knowledge base: FTS5-indexed document chunks for agent reference materials.
 * Think of it as: RAM for live work, SQLite for the archive + knowledge.
 */

import Database from 'better-sqlite3';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config } from '../config.js';
import type { SessionState } from '../session/session-state.js';

// ── Singleton ────────────────────────────────────────────────────────────

let db: Database.Database | null = null;

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? config.dbPath;
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  console.log(`[DB] SQLite initialized at ${resolvedPath}`);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ── Migrations ───────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT DEFAULT '',
      firm_name     TEXT DEFAULT '',
      profile_json  TEXT DEFAULT '{}',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_archive (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT REFERENCES users(id),
      title               TEXT DEFAULT 'Untitled',
      status              TEXT DEFAULT 'completed',
      workflow_id         TEXT,
      team_roles          TEXT DEFAULT '[]',
      findings_count      INTEGER DEFAULT 0,
      resolutions_count   INTEGER DEFAULT 0,
      cost_usd            REAL DEFAULT 0,
      budget_usd          REAL DEFAULT 0,
      final_output        TEXT,
      assembled_document  TEXT,
      summary_json        TEXT DEFAULT '{}',
      created_at          TEXT NOT NULL,
      completed_at        TEXT,
      duration_ms         INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS matters (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      data_json   TEXT NOT NULL,
      status      TEXT DEFAULT 'pre-engagement',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_archive_user ON session_archive(user_id);
    CREATE INDEX IF NOT EXISTS idx_matters_user ON matters(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

    -- API client registry (persists across server restarts)
    CREATE TABLE IF NOT EXISTS api_clients (
      id                     TEXT PRIMARY KEY,
      type                   TEXT NOT NULL DEFAULT 'human',
      name                   TEXT DEFAULT '',
      api_key_hash           TEXT NOT NULL UNIQUE,
      callback_url           TEXT,
      auto_approve_threshold REAL,
      capabilities           TEXT DEFAULT '[]',
      created_at             TEXT NOT NULL,
      last_active_at         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_clients_key_hash ON api_clients(api_key_hash);

    -- ── Knowledge Base (v15) ──────────────────────────────────────────
    -- Collections group related documents (e.g., "NDA Precedents", "Firm Playbook")
    CREATE TABLE IF NOT EXISTS kb_collections (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      doc_type    TEXT DEFAULT '',
      metadata    TEXT DEFAULT '{}',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    -- Each document uploaded to a collection
    CREATE TABLE IF NOT EXISTS kb_documents (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES kb_collections(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id),
      filename      TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      file_size     INTEGER NOT NULL,
      word_count    INTEGER DEFAULT 0,
      page_count    INTEGER DEFAULT 0,
      doc_type      TEXT DEFAULT '',
      jurisdiction  TEXT DEFAULT '',
      metadata      TEXT DEFAULT '{}',
      created_at    TEXT NOT NULL
    );

    -- Searchable chunks (one document → many chunks)
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id            TEXT PRIMARY KEY,
      document_id   TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES kb_collections(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id),
      heading       TEXT DEFAULT '',
      content       TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL,
      level         INTEGER DEFAULT 1,
      word_count    INTEGER DEFAULT 0,
      metadata      TEXT DEFAULT '{}',
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kb_collections_user ON kb_collections(user_id);
    CREATE INDEX IF NOT EXISTS idx_kb_documents_collection ON kb_documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_kb_documents_user ON kb_documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_document ON kb_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_collection ON kb_chunks(collection_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_user ON kb_chunks(user_id);
  `);

  // v17: Composite indexes for filtered KB searches (doc_type, jurisdiction)
  // Without these, metadata filters scan the entire kb_documents table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kb_documents_doc_type ON kb_documents(doc_type);
    CREATE INDEX IF NOT EXISTS idx_kb_documents_jurisdiction ON kb_documents(jurisdiction);
    CREATE INDEX IF NOT EXISTS idx_kb_documents_type_jurisdiction ON kb_documents(doc_type, jurisdiction);
  `);

  // FTS5 virtual table + sync triggers (must be separate from the main exec block
  // because CREATE VIRTUAL TABLE cannot be inside multi-statement exec on some versions)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
      heading, content, content='kb_chunks', content_rowid='rowid'
    );
  `);

  // Sync triggers — keep FTS index in sync with kb_chunks table
  // Use try/catch because triggers already existing is not an error we care about
  try {
    db.exec(`
      CREATE TRIGGER kb_chunks_ai AFTER INSERT ON kb_chunks BEGIN
        INSERT INTO kb_chunks_fts(rowid, heading, content) VALUES (new.rowid, new.heading, new.content);
      END;
    `);
  } catch { /* trigger already exists */ }

  try {
    db.exec(`
      CREATE TRIGGER kb_chunks_ad AFTER DELETE ON kb_chunks BEGIN
        INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, heading, content) VALUES('delete', old.rowid, old.heading, old.content);
      END;
    `);
  } catch { /* trigger already exists */ }

  try {
    db.exec(`
      CREATE TRIGGER kb_chunks_au AFTER UPDATE ON kb_chunks BEGIN
        INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, heading, content) VALUES('delete', old.rowid, old.heading, old.content);
        INSERT INTO kb_chunks_fts(rowid, heading, content) VALUES (new.rowid, new.heading, new.content);
      END;
    `);
  } catch { /* trigger already exists */ }

  // v18 migration: Add assembled_document column to session_archive
  // SQLite ALTER TABLE ADD COLUMN is safe — no-op if column already exists via CREATE TABLE
  try {
    db.exec(`ALTER TABLE session_archive ADD COLUMN assembled_document TEXT`);
  } catch { /* column already exists */ }

  // v19 migration: Add is_global flag to kb_collections for shared reference data
  try {
    db.exec(`ALTER TABLE kb_collections ADD COLUMN is_global INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_collections_global ON kb_collections(is_global)`);

  // v20 migration: Make session_archive.user_id nullable (was NOT NULL REFERENCES users(id)).
  // Anonymous / unauthenticated sessions (QuickStart, smoke tests) have no users row,
  // so the foreign key constraint caused every archival to fail with SQLITE_CONSTRAINT_FOREIGNKEY.
  // SQLite cannot ALTER column constraints, so we recreate the table if it has the old schema.
  try {
    const info = db.prepare(`PRAGMA table_info(session_archive)`).all() as Array<{ name: string; notnull: number }>;
    const userIdCol = info.find((c) => c.name === 'user_id');
    if (userIdCol && userIdCol.notnull === 1) {
      db.exec(`
        BEGIN;
        ALTER TABLE session_archive RENAME TO session_archive_old;
        CREATE TABLE session_archive (
          id                  TEXT PRIMARY KEY,
          user_id             TEXT REFERENCES users(id),
          title               TEXT DEFAULT 'Untitled',
          status              TEXT DEFAULT 'completed',
          workflow_id         TEXT,
          team_roles          TEXT DEFAULT '[]',
          findings_count      INTEGER DEFAULT 0,
          resolutions_count   INTEGER DEFAULT 0,
          cost_usd            REAL DEFAULT 0,
          budget_usd          REAL DEFAULT 0,
          final_output        TEXT,
          assembled_document  TEXT,
          summary_json        TEXT DEFAULT '{}',
          created_at          TEXT NOT NULL,
          completed_at        TEXT,
          duration_ms         INTEGER DEFAULT 0
        );
        INSERT INTO session_archive SELECT * FROM session_archive_old;
        DROP TABLE session_archive_old;
        CREATE INDEX IF NOT EXISTS idx_session_archive_user ON session_archive(user_id);
        COMMIT;
      `);
    }
  } catch { /* migration already applied or table doesn't exist yet */ }

  // v21 migration: Billing — Stripe columns on users + user_usage table + audit_log
  try {
    db.exec(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN plan_expires_at TEXT`);
  } catch { /* column already exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_usage (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          TEXT NOT NULL REFERENCES users(id),
      month            TEXT NOT NULL,
      total_cost_usd   REAL DEFAULT 0,
      engagement_count INTEGER DEFAULT 0,
      UNIQUE(user_id, month)
    );
    CREATE INDEX IF NOT EXISTS idx_user_usage_user_month ON user_usage(user_id, month);

    CREATE TABLE IF NOT EXISTS billing_events (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id),
      type              TEXT NOT NULL,
      stripe_session_id TEXT,
      amount_cents      INTEGER DEFAULT 0,
      currency          TEXT DEFAULT 'usd',
      plan              TEXT,
      metadata          TEXT DEFAULT '{}',
      created_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp  TEXT NOT NULL,
      user_id    TEXT,
      action     TEXT NOT NULL,
      resource   TEXT,
      ip         TEXT,
      user_agent TEXT,
      detail     TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);

    -- v22: Waitlist + Billable Hours
    CREATE TABLE IF NOT EXISTS waitlist (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      status      TEXT DEFAULT 'waiting',
      invite_code TEXT UNIQUE,
      source      TEXT DEFAULT 'website',
      created_at  TEXT NOT NULL,
      invited_at  TEXT,
      joined_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
    CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
    CREATE INDEX IF NOT EXISTS idx_waitlist_invite_code ON waitlist(invite_code);

    CREATE TABLE IF NOT EXISTS billable_hours (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id),
      type          TEXT NOT NULL,
      amount        REAL NOT NULL,
      balance_after REAL NOT NULL,
      description   TEXT,
      reference_id  TEXT,
      expires_at    TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bh_user ON billable_hours(user_id);
    CREATE INDEX IF NOT EXISTS idx_bh_created ON billable_hours(created_at);
    CREATE INDEX IF NOT EXISTS idx_bh_reference ON billable_hours(reference_id);
    CREATE INDEX IF NOT EXISTS idx_billing_events_stripe ON billing_events(stripe_session_id);
  `);
}

// ── Password Hashing ─────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  if (keyBuf.length !== SCRYPT_KEYLEN) return false;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(keyBuf, derivedKey));
    });
  });
}

// ── User Queries ─────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  firm_name: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
}

export function createUser(email: string, passwordHash: string, displayName?: string, firmName?: string): DbUser {
  const id = `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO users (id, email, password_hash, display_name, firm_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, displayName ?? '', firmName ?? '', now, now);

  return getUserById(id)!;
}

export function getUserByEmail(email: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as DbUser | undefined;
}

export function getUserById(id: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function updateUserProfile(id: string, updates: { displayName?: string; firmName?: string; profileJson?: string }): DbUser | undefined {
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.displayName !== undefined) { sets.push('display_name = ?'); values.push(updates.displayName); }
  if (updates.firmName !== undefined) { sets.push('firm_name = ?'); values.push(updates.firmName); }
  if (updates.profileJson !== undefined) { sets.push('profile_json = ?'); values.push(updates.profileJson); }

  values.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getUserById(id);
}

// ── Auth Token Queries ───────────────────────────────────────────────────

const TOKEN_TTL_DAYS = 30;

export function createAuthToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  getDb().prepare(`
    INSERT INTO auth_tokens (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt.toISOString(), now.toISOString());

  return token;
}

export function getUserByToken(token: string): DbUser | undefined {
  const row = getDb().prepare(`
    SELECT u.* FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token = ? AND t.expires_at > ?
  `).get(token, new Date().toISOString()) as DbUser | undefined;

  return row;
}

export function deleteAuthToken(token: string): void {
  getDb().prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
}

export function cleanExpiredTokens(): number {
  const result = getDb().prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(new Date().toISOString());
  return result.changes;
}

// ── Session Archive Queries ──────────────────────────────────────────────

export interface ArchivedSession {
  id: string;
  user_id: string;
  title: string;
  status: string;
  workflow_id: string | null;
  team_roles: string;
  findings_count: number;
  resolutions_count: number;
  cost_usd: number;
  budget_usd: number;
  final_output: string | null;
  assembled_document: string | null;
  summary_json: string;
  created_at: string;
  completed_at: string | null;
  duration_ms: number;
}

export function archiveSession(session: SessionState, userId: string | null): void {
  const db = getDb();
  const now = new Date().toISOString();
  const startedAt = session.genericWorkflow?.startedAt ?? session.workflow.startedAt;
  const durationMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;

  // Determine session status from halt state
  const status = session.isHalted()
    ? (session.haltReason?.includes('timeout') ? 'failed' : 'halted')
    : 'completed';

  const summaryJson = JSON.stringify({
    debate: {
      findingsCount: session.debate.findings.length,
      challengesCount: session.debate.challenges.length,
      resolutionsCount: session.debate.resolutions.length,
    },
    topFindings: session.debate.findings.slice(0, 10).map(f => ({
      severity: f.severity,
      content: f.content,
      agent: f.agentRole,
    })),
    resolutions: session.debate.resolutions.map(r => ({
      topic: r.debateTopic,
      resolution: r.resolution,
    })),
    beforeScores: session.beforeScores,
    afterScores: session.afterScores,
    verification: {
      total: session.verificationResults.length,
      passed: session.verificationResults.filter(v => v.passed).length,
    },
  });

  // Wrap everything in a transaction so usage/debit/archive stay consistent
  db.transaction(() => {
    // Guard against double-archival: check if this session was already archived before debiting.
    // Without this check, INSERT OR IGNORE silently skips the row insert while the debit/usage
    // increments still execute, causing double charges.
    const alreadyArchived = db.prepare(`SELECT 1 FROM session_archive WHERE id = ?`).get(session.id);
    if (alreadyArchived) return;

    // v21: Track per-user monthly usage
    if (userId && session.accumulatedCost > 0) {
      incrementUserUsage(userId, session.accumulatedCost);
      // v22: Debit billable hours
      const hoursUsed = session.accumulatedCost / config.billableHours.rate;
      const debited = debitBillableHours(userId, hoursUsed, `Session ${session.id}`, session.id);
      if (!debited) {
        console.warn(`[BILLING] Insufficient billable hours for user ${userId} — session ${session.id} cost ${hoursUsed.toFixed(2)}h but debit failed (balance too low). Session archived without debit.`);
      }
    }

    db.prepare(`
      INSERT OR IGNORE INTO session_archive
      (id, user_id, title, status, workflow_id, team_roles, findings_count,
       resolutions_count, cost_usd, budget_usd, final_output, assembled_document,
       summary_json, created_at, completed_at, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      userId,
      session.matterRecord?.title ?? 'Untitled Analysis',
      status,
      session.workflowTemplateId ?? null,
      JSON.stringify(session.selectedTeam),
      session.debate.findings.length,
      session.debate.resolutions.length,
      session.accumulatedCost,
      session.budgetUsd,
      session.finalOutput || null,
      session.assembledDocument || null,
      summaryJson,
      startedAt ?? now,
      now,
      durationMs,
    );
  })();
}

export function getSessionArchive(userId: string, limit = 50): ArchivedSession[] {
  return getDb().prepare(`
    SELECT * FROM session_archive WHERE user_id = ?
    ORDER BY completed_at DESC LIMIT ?
  `).all(userId, limit) as ArchivedSession[];
}

export function getArchivedSession(sessionId: string, userId: string): ArchivedSession | undefined {
  return getDb().prepare(`
    SELECT * FROM session_archive WHERE id = ? AND user_id = ?
  `).get(sessionId, userId) as ArchivedSession | undefined;
}

/** Find archived session by ID without user filter (for session restore on restart). */
export function getArchivedSessionById(sessionId: string): ArchivedSession | undefined {
  return getDb().prepare(`
    SELECT * FROM session_archive WHERE id = ?
  `).get(sessionId) as ArchivedSession | undefined;
}

/** Get all archived sessions (no user filter — for unauthenticated / demo mode). */
export function getAllSessionArchive(limit = 50): ArchivedSession[] {
  return getDb().prepare(`
    SELECT * FROM session_archive ORDER BY completed_at DESC LIMIT ?
  `).all(limit) as ArchivedSession[];
}

/** Get most recent archived sessions (no user filter — for session listing fallback). */
export function getRecentArchivedSessions(limit = 10): ArchivedSession[] {
  return getDb().prepare(`
    SELECT * FROM session_archive ORDER BY completed_at DESC LIMIT ?
  `).all(limit) as ArchivedSession[];
}

// ── Reputation Metrics ──────────────────────────────────────────────────

export interface ReputationMetrics {
  totalEngagements: number;
  successRate: number | null;
  avgVerificationPassRate: number | null;
  avgDeliveryTimeMs: number | null;
  avgCostUsd: number | null;
  workflowBreakdown: Array<{ workflowId: string; count: number }>;
}

/**
 * Aggregate reputation metrics from the session archive.
 * Cold-start safe: returns totalEngagements: 0 with null metrics when no history.
 */
export function getReputationMetrics(): ReputationMetrics {
  const db = getDb();

  // Total engagements
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM session_archive').get() as { cnt: number };
  const totalEngagements = countRow.cnt;

  if (totalEngagements === 0) {
    return {
      totalEngagements: 0,
      successRate: null,
      avgVerificationPassRate: null,
      avgDeliveryTimeMs: null,
      avgCostUsd: null,
      workflowBreakdown: [],
    };
  }

  // Success rate (status = 'completed' vs total)
  const successRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM session_archive WHERE status = 'completed'"
  ).get() as { cnt: number };
  const successRate = Math.round((successRow.cnt / totalEngagements) * 100) / 100;

  // Average verification pass rate (from summary_json)
  const sessions = db.prepare(
    'SELECT summary_json, duration_ms, cost_usd FROM session_archive'
  ).all() as Array<{ summary_json: string; duration_ms: number; cost_usd: number }>;

  let totalVerifRate = 0;
  let verifCount = 0;
  let totalDuration = 0;
  let totalCost = 0;

  for (const s of sessions) {
    try {
      const summary = JSON.parse(s.summary_json);
      if (summary.verification && summary.verification.total > 0) {
        totalVerifRate += summary.verification.passed / summary.verification.total;
        verifCount++;
      }
    } catch { /* skip malformed JSON */ }
    totalDuration += s.duration_ms;
    totalCost += s.cost_usd;
  }

  const avgVerificationPassRate = verifCount > 0
    ? Math.round((totalVerifRate / verifCount) * 100) / 100
    : null;
  const avgDeliveryTimeMs = Math.round(totalDuration / totalEngagements);
  const avgCostUsd = Math.round((totalCost / totalEngagements) * 100) / 100;

  // Workflow breakdown
  const workflowRows = db.prepare(
    'SELECT workflow_id, COUNT(*) as cnt FROM session_archive WHERE workflow_id IS NOT NULL GROUP BY workflow_id ORDER BY cnt DESC'
  ).all() as Array<{ workflow_id: string; cnt: number }>;

  return {
    totalEngagements,
    successRate,
    avgVerificationPassRate,
    avgDeliveryTimeMs,
    avgCostUsd,
    workflowBreakdown: workflowRows.map(r => ({ workflowId: r.workflow_id, count: r.cnt })),
  };
}

// ── Matter Queries ───────────────────────────────────────────────────────

export function saveMatter(userId: string, matterId: string, dataJson: string, status: string): void {
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO matters (id, user_id, data_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data_json = excluded.data_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(matterId, userId, dataJson, status, now, now);
}

export function getMattersByUser(userId: string): Array<{ id: string; data_json: string; status: string; created_at: string }> {
  return getDb().prepare(`
    SELECT id, data_json, status, created_at FROM matters
    WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as Array<{ id: string; data_json: string; status: string; created_at: string }>;
}

export function getMatterById(matterId: string, userId: string): { id: string; data_json: string; status: string } | undefined {
  return getDb().prepare(`
    SELECT id, data_json, status FROM matters WHERE id = ? AND user_id = ?
  `).get(matterId, userId) as { id: string; data_json: string; status: string } | undefined;
}

// ── API Client Persistence ──────────────────────────────────────────────

export interface DbApiClient {
  id: string;
  type: string;
  name: string;
  api_key_hash: string;
  callback_url: string | null;
  auto_approve_threshold: number | null;
  capabilities: string;
  created_at: string;
  last_active_at: string | null;
}

export function saveApiClient(client: {
  id: string;
  type: string;
  name: string;
  apiKeyHash: string;
  callbackUrl?: string;
  autoApproveThreshold?: number;
  capabilities?: string[];
  registeredAt: string;
}): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO api_clients
    (id, type, name, api_key_hash, callback_url, auto_approve_threshold, capabilities, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client.id,
    client.type,
    client.name || '',
    client.apiKeyHash,
    client.callbackUrl || null,
    client.autoApproveThreshold ?? null,
    JSON.stringify(client.capabilities || []),
    client.registeredAt,
  );
}

export function getApiClientByKeyHash(keyHash: string): DbApiClient | undefined {
  return getDb().prepare(`
    SELECT * FROM api_clients WHERE api_key_hash = ?
  `).get(keyHash) as DbApiClient | undefined;
}

export function getAllApiClients(): DbApiClient[] {
  return getDb().prepare(`SELECT * FROM api_clients ORDER BY created_at DESC`).all() as DbApiClient[];
}

export function removeApiClient(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM api_clients WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function updateApiClientLastActive(id: string): void {
  getDb().prepare(`UPDATE api_clients SET last_active_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

// ── Billing & Usage ─────────────────────────────────────────────────────

/** Get current month string (YYYY-MM). */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Set Stripe customer ID on user. */
export function setUserStripeCustomer(userId: string, stripeCustomerId: string): void {
  getDb().prepare(`UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?`)
    .run(stripeCustomerId, new Date().toISOString(), userId);
}

/** Set user plan (free, starter, professional, enterprise). */
export function setUserPlan(userId: string, plan: string, expiresAt?: string): void {
  getDb().prepare(`UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = ? WHERE id = ?`)
    .run(plan, expiresAt || null, new Date().toISOString(), userId);
}

/** Get user's plan info. */
export function getUserPlan(userId: string): { plan: string; plan_expires_at: string | null; stripe_customer_id: string | null } | undefined {
  return getDb().prepare(`SELECT plan, plan_expires_at, stripe_customer_id FROM users WHERE id = ?`)
    .get(userId) as { plan: string; plan_expires_at: string | null; stripe_customer_id: string | null } | undefined;
}

/** Record a billing event. */
export function recordBillingEvent(event: {
  id: string;
  userId: string;
  type: string;
  stripeSessionId?: string;
  amountCents?: number;
  currency?: string;
  plan?: string;
  metadata?: Record<string, unknown>;
}): void {
  getDb().prepare(`
    INSERT INTO billing_events (id, user_id, type, stripe_session_id, amount_cents, currency, plan, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.userId,
    event.type,
    event.stripeSessionId || null,
    event.amountCents ?? 0,
    event.currency ?? 'usd',
    event.plan || null,
    JSON.stringify(event.metadata || {}),
    new Date().toISOString(),
  );
}

/** Get user's usage for the current month. */
export function getUserMonthlyUsage(userId: string, month?: string): { total_cost_usd: number; engagement_count: number } {
  const m = month ?? currentMonth();
  const row = getDb().prepare(`
    SELECT total_cost_usd, engagement_count FROM user_usage WHERE user_id = ? AND month = ?
  `).get(userId, m) as { total_cost_usd: number; engagement_count: number } | undefined;
  return row ?? { total_cost_usd: 0, engagement_count: 0 };
}

/** Increment user's monthly usage after session completion. */
export function incrementUserUsage(userId: string, costUsd: number): void {
  const m = currentMonth();
  getDb().prepare(`
    INSERT INTO user_usage (user_id, month, total_cost_usd, engagement_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, month) DO UPDATE SET
      total_cost_usd = total_cost_usd + excluded.total_cost_usd,
      engagement_count = engagement_count + 1
  `).run(userId, m, costUsd);
}

// ── Waitlist ────────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  invite_code: string | null;
  source: string;
  created_at: string;
  invited_at: string | null;
  joined_at: string | null;
}

/** Add an email to the waitlist. Returns the entry (or existing if duplicate). */
export function addWaitlistEntry(email: string, source = 'website'): WaitlistEntry {
  const normalized = email.toLowerCase().trim();
  const existing = getDb().prepare(`SELECT * FROM waitlist WHERE email = ?`).get(normalized) as WaitlistEntry | undefined;
  if (existing) return existing;

  const id = `wl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO waitlist (id, email, status, source, created_at) VALUES (?, ?, 'waiting', ?, ?)
  `).run(id, normalized, source, now);
  return { id, email: normalized, status: 'waiting', invite_code: null, source, created_at: now, invited_at: null, joined_at: null };
}

/** Get a waitlist entry by email. */
export function getWaitlistEntry(email: string): WaitlistEntry | undefined {
  return getDb().prepare(`SELECT * FROM waitlist WHERE email = ?`).get(email.toLowerCase().trim()) as WaitlistEntry | undefined;
}

/** Get a waitlist entry by invite code. */
export function getWaitlistEntryByCode(code: string): WaitlistEntry | undefined {
  return getDb().prepare(`SELECT * FROM waitlist WHERE invite_code = ?`).get(code) as WaitlistEntry | undefined;
}

/** Invite a waitlisted email — generates an invite code, sets status to 'invited'. */
export function inviteWaitlistEntry(email: string): string {
  const normalized = email.toLowerCase().trim();
  const code = `inv-${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  const result = getDb().prepare(`
    UPDATE waitlist SET status = 'invited', invite_code = ?, invited_at = ? WHERE email = ? AND status = 'waiting'
  `).run(code, now, normalized);
  if (result.changes === 0) throw new Error(`No waiting entry for ${normalized}`);
  return code;
}

/** Mark an invite code as used after signup. */
export function markInviteUsed(code: string, userId: string): boolean {
  const now = new Date().toISOString();
  const result = getDb().prepare(`
    UPDATE waitlist SET status = 'joined', joined_at = ? WHERE invite_code = ? AND status = 'invited'
  `).run(now, code);
  return result.changes > 0;
}

/** List waitlist entries (admin). */
export function getWaitlistEntries(opts?: { status?: string; limit?: number }): WaitlistEntry[] {
  const limit = opts?.limit ?? 200;
  if (opts?.status) {
    return getDb().prepare(`SELECT * FROM waitlist WHERE status = ? ORDER BY created_at ASC LIMIT ?`).all(opts.status, limit) as WaitlistEntry[];
  }
  return getDb().prepare(`SELECT * FROM waitlist ORDER BY created_at ASC LIMIT ?`).all(limit) as WaitlistEntry[];
}

/** Count waitlist entries by status. */
export function countWaitlist(): { waiting: number; invited: number; joined: number; total: number } {
  const rows = getDb().prepare(`SELECT status, COUNT(*) as cnt FROM waitlist GROUP BY status`).all() as Array<{ status: string; cnt: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r.cnt;
  const total = rows.reduce((s, r) => s + r.cnt, 0);
  return { waiting: counts.waiting ?? 0, invited: counts.invited ?? 0, joined: counts.joined ?? 0, total };
}

// ── Billable Hours (Credit Ledger) ──────────────────────────────────────

export interface BillableHoursEntry {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  reference_id: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Get user's current billable hours balance (excludes expired credits). */
export function getUserBillableHours(userId: string): number {
  const now = new Date().toISOString();
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(amount), 0) as balance FROM billable_hours
    WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
  `).get(userId, now) as { balance: number };
  return row.balance;
}

/** Credit billable hours to a user (positive ledger entry). Idempotent when referenceId is provided. */
export function creditBillableHours(
  userId: string,
  amount: number,
  type: string,
  description: string,
  expiresAt?: string | null,
  referenceId?: string | null,
): boolean {
  const db = getDb();
  let credited = false;
  const now = new Date().toISOString();
  db.transaction(() => {
    // Idempotency guard — prevent double-crediting from webhook retries
    if (referenceId) {
      const existing = db.prepare(`SELECT id FROM billable_hours WHERE reference_id = ?`).get(referenceId);
      if (existing) {
        console.log(`[BILLING] Duplicate credit attempt for reference ${referenceId} — skipping`);
        return; // credited stays false
      }
    }
    const current = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as balance FROM billable_hours WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)`).get(userId, now) as { balance: number }).balance;
    const id = `bh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO billable_hours (id, user_id, type, amount, balance_after, description, reference_id, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, amount, current + amount, description, referenceId ?? null, expiresAt ?? null, now);
    credited = true;
  })();
  return credited;
}

/** Debit billable hours from a user (negative ledger entry). Returns false if insufficient balance.
 *  Idempotent when referenceId is provided — duplicate debits for the same reference are skipped. */
export function debitBillableHours(
  userId: string,
  amount: number,
  description: string,
  referenceId?: string | null,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  let success = false;
  db.transaction(() => {
    // Idempotency guard: skip if a debit with this referenceId already exists (prevents double-debit on re-archival)
    if (referenceId) {
      const existing = db.prepare(`SELECT 1 FROM billable_hours WHERE reference_id = ? AND type = 'debit'`).get(referenceId);
      if (existing) { success = true; return; }
    }
    const current = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as balance FROM billable_hours WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)`).get(userId, now) as { balance: number }).balance;
    if (current < amount) {
      success = false;
      return;
    }
    const id = `bh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO billable_hours (id, user_id, type, amount, balance_after, description, reference_id, created_at)
      VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)
    `).run(id, userId, -amount, current - amount, description, referenceId ?? null, now);
    success = true;
  })();
  return success;
}

/** Get billable hours ledger history for a user. */
export function getBillableHoursHistory(userId: string, limit = 50): BillableHoursEntry[] {
  return getDb().prepare(`
    SELECT * FROM billable_hours WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit) as BillableHoursEntry[];
}

// ── Audit Log ───────────────────────────────────────────────────────────

/** Record an action in the audit log. */
export function logAuditEvent(event: {
  userId?: string;
  action: string;
  resource?: string;
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
}): void {
  getDb().prepare(`
    INSERT INTO audit_log (timestamp, user_id, action, resource, ip, user_agent, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    event.userId || null,
    event.action,
    event.resource || null,
    event.ip || null,
    event.userAgent || null,
    JSON.stringify(event.detail || {}),
  );
}

/** Get recent audit log entries. */
export function getAuditLog(opts?: { userId?: string; limit?: number; after?: string }): Array<{
  id: number; timestamp: string; user_id: string | null; action: string; resource: string | null;
}> {
  const limit = opts?.limit ?? 100;
  if (opts?.userId) {
    return getDb().prepare(`
      SELECT id, timestamp, user_id, action, resource FROM audit_log
      WHERE user_id = ? ${opts.after ? 'AND timestamp > ?' : ''}
      ORDER BY id DESC LIMIT ?
    `).all(...(opts.after ? [opts.userId, opts.after, limit] : [opts.userId, limit])) as any[];
  }
  return getDb().prepare(`
    SELECT id, timestamp, user_id, action, resource FROM audit_log
    ${opts?.after ? 'WHERE timestamp > ?' : ''}
    ORDER BY id DESC LIMIT ?
  `).all(...(opts?.after ? [opts.after, limit] : [limit])) as any[];
}

/** Delete audit entries older than N days. */
export function rotateAuditLog(retainDays = 90): number {
  const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare(`DELETE FROM audit_log WHERE timestamp < ?`).run(cutoff);
  return result.changes;
}

// ── GDPR Data Export & Deletion ─────────────────────────────────────────

/**
 * Export all user data for GDPR data portability (Article 20).
 * Returns profile, sessions, billing, usage — everything tied to this user.
 */
export function exportUserData(userId: string): {
  profile: DbUser | undefined;
  sessions: ArchivedSession[];
  usage: Array<{ month: string; total_cost_usd: number; engagement_count: number }>;
  billingEvents: Array<{ type: string; amount_cents: number; plan: string | null; created_at: string }>;
  billableHours: BillableHoursEntry[];
  auditLog: Array<{ timestamp: string; action: string; resource: string | null }>;
} {
  const d = getDb();
  const profile = getUserById(userId);
  const sessions = d.prepare(`SELECT * FROM session_archive WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as ArchivedSession[];
  const usage = d.prepare(`SELECT month, total_cost_usd, engagement_count FROM user_usage WHERE user_id = ? ORDER BY month DESC`).all(userId) as Array<{ month: string; total_cost_usd: number; engagement_count: number }>;
  const billingEvents = d.prepare(`SELECT type, amount_cents, plan, created_at FROM billing_events WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as Array<{ type: string; amount_cents: number; plan: string | null; created_at: string }>;
  const billableHours = d.prepare(`SELECT * FROM billable_hours WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as BillableHoursEntry[];
  const auditLog = d.prepare(`SELECT timestamp, action, resource FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1000`).all(userId) as Array<{ timestamp: string; action: string; resource: string | null }>;

  return { profile, sessions, usage, billingEvents, billableHours, auditLog };
}

/**
 * Soft-delete user account for GDPR right to erasure (Article 17).
 * Anonymizes PII but retains anonymized records for analytics integrity.
 */
export function softDeleteUser(userId: string): boolean {
  const d = getDb();
  const user = getUserById(userId);
  if (!user) return false;

  const now = new Date().toISOString();
  const anonymizedEmail = `deleted-${crypto.randomBytes(8).toString('hex')}@redacted.local`;

  d.transaction(() => {
    // Anonymize user profile
    d.prepare(`
      UPDATE users SET
        email = ?,
        password_hash = 'DELETED',
        display_name = 'Deleted User',
        firm_name = '',
        profile_json = '{}',
        stripe_customer_id = NULL,
        plan = 'deleted',
        plan_expires_at = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(anonymizedEmail, now, userId);

    // Revoke all auth tokens
    d.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(userId);

    // Anonymize session archive titles (keep cost/timing data for analytics)
    d.prepare(`UPDATE session_archive SET title = 'Deleted', final_output = NULL, assembled_document = NULL WHERE user_id = ?`).run(userId);

    // Clean up billing/usage records (retain anonymized analytics)
    d.prepare(`DELETE FROM billable_hours WHERE user_id = ?`).run(userId);
    d.prepare(`DELETE FROM billing_events WHERE user_id = ?`).run(userId);

    // Clean up matters
    d.prepare(`DELETE FROM matters WHERE user_id = ?`).run(userId);

    // Clean up knowledge base collections/documents/chunks
    d.prepare(`DELETE FROM kb_chunks WHERE user_id = ?`).run(userId);
    d.prepare(`DELETE FROM kb_documents WHERE user_id = ?`).run(userId);
    d.prepare(`DELETE FROM kb_collections WHERE user_id = ? AND is_global = 0`).run(userId);

    // Anonymize audit log entries (keep timestamps/actions for analytics)
    d.prepare(`UPDATE audit_log SET ip = NULL, user_agent = NULL WHERE user_id = ?`).run(userId);

    // Audit this action (inside transaction so it's visible even if we fail)
    logAuditEvent({ userId, action: 'account_deleted', resource: 'auth', detail: { anonymizedAt: now } });
  })();

  return true;
}
