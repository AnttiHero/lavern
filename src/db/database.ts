/**
 * Database Layer — SQLite persistence for users, sessions, matters, and knowledge base.
 *
 * Uses better-sqlite3 (synchronous, fast, zero-config).
 * The DB file lives at ./data/marble.db by default.
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
      user_id             TEXT NOT NULL REFERENCES users(id),
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
}

// ── Password Hashing ─────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
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
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(keyBuf, derivedKey));
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

export function archiveSession(session: SessionState, userId: string): void {
  const now = new Date().toISOString();
  const startedAt = session.genericWorkflow?.startedAt ?? session.workflow.startedAt;
  const durationMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;

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

  getDb().prepare(`
    INSERT OR REPLACE INTO session_archive
    (id, user_id, title, status, workflow_id, team_roles, findings_count,
     resolutions_count, cost_usd, budget_usd, final_output, assembled_document,
     summary_json, created_at, completed_at, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    userId,
    session.matterRecord?.title ?? 'Untitled Analysis',
    'completed',
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
