/**
 * Database Layer — SQLite persistence for users, sessions, matters, and knowledge base.
 *
 * Uses better-sqlite3 (synchronous, fast, zero-config).
 * The DB file lives at ./data/lavern.db by default.
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
import { createLogger } from '../utils/logger.js';
import type { SessionState } from '../session/session-state.js';

const logger = createLogger('DB');

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
  // Audit fix H9: under concurrent writers (load test, viral share, parallel
  // billing updates) without a busy_timeout, SQLite throws SQLITE_BUSY
  // immediately. 5s wait gives WAL writers room to drain.
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  logger.info('database_initialized', resolvedPath);
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

    -- ── Shared agents (public share + import) ────────────────────────
    -- Custom agents the user has explicitly opted-in to share publicly.
    -- The token is the URL slug. profile_json is the full AgentProfile
    -- including provenance + avatar. Owner can revoke (delete by id).
    CREATE TABLE IF NOT EXISTS shared_agents (
      token        TEXT PRIMARY KEY,
      owner_id     TEXT REFERENCES users(id),
      owner_name   TEXT DEFAULT '',
      profile_json TEXT NOT NULL,
      view_count   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shared_agents_owner ON shared_agents(owner_id);

    -- ── Shared teams (public share — full lineup) ────────────────────
    -- Same opt-in pattern as shared_agents, but stores an array of full
    -- AgentProfile JSON (1..6 members) plus an optional team title.
    -- The team OG image renders the front cards in a grid.
    CREATE TABLE IF NOT EXISTS shared_teams (
      token        TEXT PRIMARY KEY,
      owner_id     TEXT REFERENCES users(id),
      owner_name   TEXT DEFAULT '',
      title        TEXT DEFAULT '',
      team_json    TEXT NOT NULL,
      view_count   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shared_teams_owner ON shared_teams(owner_id);
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

  // Sync triggers — keep FTS index in sync with kb_chunks table.
  // Audit fix LOW: only swallow "already exists" errors. If FTS5 module is
  // unavailable on this SQLite build, propagate so the operator notices —
  // otherwise KB search silently returns empty results forever.
  const swallowAlreadyExists = (fn: () => void, what: string): void => {
    try { fn(); } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes('already exists')) return;
      throw new Error(`FTS5 trigger setup failed for ${what}: ${msg}`);
    }
  };

  swallowAlreadyExists(() => db.exec(`
    CREATE TRIGGER kb_chunks_ai AFTER INSERT ON kb_chunks BEGIN
      INSERT INTO kb_chunks_fts(rowid, heading, content) VALUES (new.rowid, new.heading, new.content);
    END;
  `), 'kb_chunks_ai');

  swallowAlreadyExists(() => db.exec(`
    CREATE TRIGGER kb_chunks_ad AFTER DELETE ON kb_chunks BEGIN
      INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, heading, content) VALUES('delete', old.rowid, old.heading, old.content);
    END;
  `), 'kb_chunks_ad');

  swallowAlreadyExists(() => db.exec(`
    CREATE TRIGGER kb_chunks_au AFTER UPDATE ON kb_chunks BEGIN
      INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, heading, content) VALUES('delete', old.rowid, old.heading, old.content);
      INSERT INTO kb_chunks_fts(rowid, heading, content) VALUES (new.rowid, new.heading, new.content);
    END;
  `), 'kb_chunks_au');

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

    -- v0.14.2: Global daily Anthropic spend counter (circuit breaker).
    -- Aggregates spend across ALL users/sessions for a given UTC date,
    -- incremented on every session.updateCost() call. When total exceeds
    -- LAVERN_DAILY_ANTHROPIC_CAP_USD, new session creation is denied.
    CREATE TABLE IF NOT EXISTS daily_spend (
      date_utc   TEXT PRIMARY KEY,
      total_usd  REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  // v26 migration: Referral system columns
  try {
    db.exec(`ALTER TABLE users ADD COLUMN referral_code TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN referred_by TEXT`);
  } catch { /* column already exists */ }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`);

  // v23 migration: User tokens (password reset + email verification) + user columns
  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN low_balance_warned_at TEXT`);
  } catch { /* column already exists */ }

  // v0.12 migration: Google OAuth provider support
  try {
    db.exec(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'password'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`);
  } catch { /* column already exists */ }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      type       TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ut_user ON user_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_ut_expires ON user_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_ut_type ON user_tokens(type);
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
  email_verified?: number;
  auth_provider?: string;
  google_id?: string;
}

export function createUser(email: string, passwordHash: string, displayName?: string, firmName?: string): DbUser {
  const id = `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO users (id, email, password_hash, display_name, firm_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, displayName ?? '', firmName ?? '', now, now);

  const user = getUserById(id);
  if (!user) throw new Error(`[DB] Failed to create user — INSERT succeeded but SELECT for ${id} returned nothing`);
  return user;
}

export function getUserByEmail(email: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as DbUser | undefined;
}

export function getUserById(id: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function getUserByGoogleId(googleId: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as DbUser | undefined;
}

export function linkGoogleAccount(userId: string, googleId: string): void {
  getDb().prepare('UPDATE users SET google_id = ?, auth_provider = ? WHERE id = ?').run(googleId, 'google', userId);
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
//
// Audit follow-up: tokens are hashed at rest (SHA-256). The plaintext
// token only exists in the response that creates it (set as cookie) and
// in the request that presents it. The DB column stores the hash, so a
// SQLite leak (backup, stolen laptop, GDPR export gone wrong) does NOT
// expose live sessions. API client keys (`api_clients.api_key_hash`)
// already follow this pattern; this brings auth tokens to parity.
//
// Migration: existing plaintext token rows are auto-migrated on first
// lookup — see `getUserByToken` below. New tokens are always written
// hashed. Old rows are progressively rewritten as users hit the system.

const TOKEN_TTL_DAYS = 30;

function hashAuthToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createAuthToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  getDb().prepare(`
    INSERT INTO auth_tokens (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hashAuthToken(token), userId, expiresAt.toISOString(), now.toISOString());

  return token;
}

export function getUserByToken(token: string): DbUser | undefined {
  const tokenHash = hashAuthToken(token);
  const now = new Date().toISOString();
  const db = getDb();

  // Look up by hash (the new format).
  let row = db.prepare(`
    SELECT u.* FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token = ? AND t.expires_at > ?
  `).get(tokenHash, now) as DbUser | undefined;
  if (row) return row;

  // Fallback: legacy plaintext rows (pre-hash deploy). If we find one,
  // rewrite it as the hash on the way out so it's hashed for next time.
  // This lets pre-existing sessions survive the rollout without forcing
  // every user to re-login.
  row = db.prepare(`
    SELECT u.* FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token = ? AND t.expires_at > ?
  `).get(token, now) as DbUser | undefined;
  if (row) {
    try {
      db.prepare(`UPDATE auth_tokens SET token = ? WHERE token = ?`).run(tokenHash, token);
    } catch { /* race or already migrated; non-fatal */ }
    return row;
  }

  return undefined;
}

export function deleteAuthToken(token: string): void {
  // Delete by hash (new format) AND by plaintext (legacy) so sign-out works
  // either way during the migration window.
  const db = getDb();
  db.prepare('DELETE FROM auth_tokens WHERE token = ? OR token = ?').run(hashAuthToken(token), token);
}

export function cleanExpiredTokens(): number {
  const result = getDb().prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(new Date().toISOString());
  return result.changes;
}

// ── User Tokens (Password Reset + Email Verification) ──────────────────

/** Create a password reset token (expires per config.auth.resetTokenTtlMs). */
export function createPasswordResetToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.auth.resetTokenTtlMs);
  getDb().prepare(`
    INSERT INTO user_tokens (token, user_id, type, expires_at, created_at)
    VALUES (?, ?, 'reset', ?, ?)
  `).run(token, userId, expiresAt.toISOString(), now.toISOString());
  return token;
}

/** Create an email verification token (expires per config.auth.verifyTokenTtlMs). */
export function createVerificationToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.auth.verifyTokenTtlMs);
  getDb().prepare(`
    INSERT INTO user_tokens (token, user_id, type, expires_at, created_at)
    VALUES (?, ?, 'verify', ?, ?)
  `).run(token, userId, expiresAt.toISOString(), now.toISOString());
  return token;
}

interface UserToken { token: string; user_id: string; type: string; expires_at: string; created_at: string; used_at: string | null }

/** Look up a password reset token that hasn't been used and hasn't expired. */
export function getPasswordResetToken(token: string): UserToken | undefined {
  return getDb().prepare(`
    SELECT * FROM user_tokens WHERE token = ? AND type = 'reset' AND used_at IS NULL AND expires_at > ?
  `).get(token, new Date().toISOString()) as UserToken | undefined;
}

/** Look up an email verification token that hasn't been used and hasn't expired. */
export function getVerificationToken(token: string): UserToken | undefined {
  return getDb().prepare(`
    SELECT * FROM user_tokens WHERE token = ? AND type = 'verify' AND used_at IS NULL AND expires_at > ?
  `).get(token, new Date().toISOString()) as UserToken | undefined;
}

/**
 * Atomically consume a token (mark as used only if not already consumed).
 * Returns true if the token was consumed, false if it was already used
 * (prevents race conditions where concurrent requests reuse the same token).
 */
export function markTokenUsed(token: string): boolean {
  const result = getDb().prepare(
    `UPDATE user_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL`
  ).run(new Date().toISOString(), token);
  return result.changes > 0;
}

/** Invalidate all unused tokens of a given type for a user (e.g., after password reset, invalidate older reset tokens). */
export function invalidateUserTokens(userId: string, type: 'reset' | 'verify'): void {
  getDb().prepare(`UPDATE user_tokens SET used_at = ? WHERE user_id = ? AND type = ? AND used_at IS NULL`)
    .run(new Date().toISOString(), userId, type);
}

/** Update a user's password hash. */
export function updatePasswordHash(userId: string, passwordHash: string): void {
  getDb().prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(passwordHash, new Date().toISOString(), userId);
}

/** Delete all auth tokens for a user (force re-login everywhere after password reset). */
export function deleteAllUserAuthTokens(userId: string): void {
  getDb().prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(userId);
}

/** Mark a user's email as verified. */
export function setEmailVerified(userId: string): void {
  getDb().prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), userId);
}

/** Check if a user's email is verified. */
export function isEmailVerified(userId: string): boolean {
  const row = getDb().prepare(`SELECT email_verified FROM users WHERE id = ?`).get(userId) as { email_verified: number } | undefined;
  return row?.email_verified === 1;
}

/** Set low-balance warning timestamp (dedup: only warn once per credit cycle). */
export function setLowBalanceWarnedAt(userId: string): void {
  getDb().prepare(`UPDATE users SET low_balance_warned_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), userId);
}

/** Get when low-balance warning was last sent (null if not warned or after top-up). */
export function getLowBalanceWarnedAt(userId: string): string | null {
  const row = getDb().prepare(`SELECT low_balance_warned_at FROM users WHERE id = ?`).get(userId) as { low_balance_warned_at: string | null } | undefined;
  return row?.low_balance_warned_at ?? null;
}

/** Clear low-balance warning flag (called internally when user tops up). */
function clearLowBalanceWarning(userId: string): void {
  getDb().prepare(`UPDATE users SET low_balance_warned_at = NULL WHERE id = ?`).run(userId);
}

/** Clean expired and used user tokens (password reset + email verification). */
export function cleanExpiredUserTokens(): number {
  const result = getDb().prepare('DELETE FROM user_tokens WHERE expires_at < ? OR used_at IS NOT NULL').run(new Date().toISOString());
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

    // NOTE: Daily spend tracking happens in real time via session.updateCost()
    // (which calls recordSpend() with each delta). Do NOT record again here —
    // that would double-count and falsely trip the circuit breaker.

    // v25: Release hold before debiting actual cost (hold was placed at session start)
    releaseHold(session.id);

    // v21: Track per-user monthly usage
    if (userId && session.accumulatedCost > 0) {
      incrementUserUsage(userId, session.accumulatedCost);
      // v22: Debit billable hours
      const hoursUsed = session.accumulatedCost / config.billableHours.rate;
      const debited = debitBillableHours(userId, hoursUsed, `Session ${session.id}`, session.id);
      if (!debited) {
        logger.warn('insufficient_hours', { userId, sessionId: session.id, hoursUsed: hoursUsed.toFixed(2) });
      } else {
        // v23: Check if balance is low — schedule warning email (dedup via low_balance_warned_at)
        const newBalance = getUserBillableHours(userId);
        if (newBalance < config.auth.lowBalanceThresholdHours && !getLowBalanceWarnedAt(userId)) {
          setLowBalanceWarnedAt(userId);
          // Fire email after transaction (imported lazily to avoid circular deps)
          const user = getUserById(userId);
          if (user) {
            import('../email/send.js').then(({ sendLowBalanceEmail }) => {
              sendLowBalanceEmail(user.email, { balance: newBalance, threshold: config.auth.lowBalanceThresholdHours })
                .catch(err => logger.error('low_balance_email_failed', err));
            }).catch(err => logger.error('email_module_import_failed', err));
          }
        }
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

/**
 * Write the archive row immediately (before assembly), so the delivery view
 * can find the session even if the server restarts during assembly.
 * No billing — billing still happens in archiveSession() at session_end.
 */
export function preArchiveSessionRow(session: SessionState, userId: string | null): void {
  const db = getDb();
  const now = new Date().toISOString();
  const startedAt = session.genericWorkflow?.startedAt ?? session.workflow.startedAt;

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
  });

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
    'assembling',
    session.workflowTemplateId ?? null,
    JSON.stringify(session.selectedTeam),
    session.debate.findings.length,
    session.debate.resolutions.length,
    session.accumulatedCost,
    session.budgetUsd,
    session.finalOutput || null,
    null, // assembled_document not ready yet
    summaryJson,
    startedAt ?? now,
    null, // not completed yet
    null,
  );
}

/**
 * After assembly completes, update the archive row with the assembled document
 * and final cost. Called from executor.ts after assembleDocument() returns.
 */
export function updateArchivedDocument(
  sessionId: string,
  assembledDocument: string,
  finalCostUsd: number,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE session_archive
    SET assembled_document = ?, cost_usd = ?, status = 'completed', completed_at = COALESCE(completed_at, ?)
    WHERE id = ?
  `).run(assembledDocument || null, finalCostUsd, now, sessionId);
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

// ── Admin: Per-User Spend Aggregation ───────────────────────────────────

export interface UserSpendRow {
  userId: string | null;
  email: string | null;
  sessions: number;
  totalUsd: number;
  avgUsd: number;
  maxUsd: number;
  lastSessionAt: string | null;
}

/**
 * Aggregate session spend by user within a UTC date range.
 *
 * - `sinceIso` / `untilIso` are inclusive ISO-8601 timestamps filtered against
 *   `session_archive.completed_at`. The daily spend tracker uses
 *   `completed_at` as the canonical "when the money was spent" field because
 *   cost is finalized at archive time, not at session creation.
 * - Anonymous sessions (user_id IS NULL) are bucketed into a single row
 *   with userId=null. That's useful for spotting unauth API traffic spikes.
 * - Ordered by totalUsd desc so the noisiest spenders surface first — the
 *   primary operational question when a trajectory alert fires.
 */
export function getUserSpendBreakdown(
  sinceIso: string,
  untilIso: string,
  limit = 50,
): UserSpendRow[] {
  return getDb().prepare(`
    SELECT
      sa.user_id AS userId,
      u.email AS email,
      COUNT(*) AS sessions,
      COALESCE(SUM(sa.cost_usd), 0) AS totalUsd,
      COALESCE(AVG(sa.cost_usd), 0) AS avgUsd,
      COALESCE(MAX(sa.cost_usd), 0) AS maxUsd,
      MAX(sa.completed_at) AS lastSessionAt
    FROM session_archive sa
    LEFT JOIN users u ON u.id = sa.user_id
    WHERE sa.completed_at >= ? AND sa.completed_at <= ?
    GROUP BY sa.user_id
    ORDER BY totalUsd DESC
    LIMIT ?
  `).all(sinceIso, untilIso, limit) as UserSpendRow[];
}

// ── Archive Retention ────────────────────────────────────────────────────

/**
 * Delete archived sessions older than the specified number of days.
 * Returns the count of deleted rows.
 *
 * Audit fix M13: gate on `status` so we only purge truly-finished engagements.
 * The previous bare DELETE could vaporize an `assembling` row mid-read on a
 * long retention window. Rows where completed_at IS NULL are also skipped
 * because `NULL < anything` is false in SQLite — covers the same case
 * defensively.
 */
export function cleanOldArchives(retentionDays: number): number {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare(
    `DELETE FROM session_archive
     WHERE completed_at < ?
       AND completed_at IS NOT NULL
       AND status IN ('completed', 'failed', 'halted')`
  ).run(cutoff);
  return result.changes;
}

/**
 * Audit fix H10: clean up holds left behind by sessions that crashed before
 * they could archive (or by hard server restarts). Without this, the hold
 * permanently reduces a user's available balance. Run at server boot.
 *
 * `maxAgeMs` is typically `config.sessionTtlMs` — a hold older than the
 * session's max lifetime can't possibly belong to a still-running session.
 * Returns the count of holds released.
 */
export function sweepStaleHolds(maxAgeMs: number): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const result = getDb().prepare(
    `DELETE FROM billable_hours
     WHERE type = 'hold'
       AND created_at < ?`
  ).run(cutoff);
  return result.changes;
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

// ── Daily Anthropic spend counter (circuit breaker) ────────────────────
//
// Tracks global LLM spend across all users/sessions for a UTC date. Used by
// the budget circuit breaker to refuse new session creation once a daily
// cap is exceeded — the "don't let a bug burn the Anthropic account" fuse.

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Atomically add to today's global spend counter and return the new total. */
export function incrementDailySpend(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return getDailySpend();
  }
  const d = getDb();
  const date = todayUtc();
  const now = new Date().toISOString();

  // Upsert then read back — atomic within SQLite's serialized access.
  const tx = d.transaction(() => {
    d.prepare(`
      INSERT INTO daily_spend (date_utc, total_usd, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(date_utc) DO UPDATE SET
        total_usd = total_usd + excluded.total_usd,
        updated_at = excluded.updated_at
    `).run(date, amountUsd, now);
    const row = d.prepare(`SELECT total_usd FROM daily_spend WHERE date_utc = ?`)
      .get(date) as { total_usd: number } | undefined;
    return row?.total_usd ?? 0;
  });
  return tx();
}

/** Read today's global spend total. Returns 0 if no row for today. */
export function getDailySpend(): number {
  const row = getDb()
    .prepare(`SELECT total_usd FROM daily_spend WHERE date_utc = ?`)
    .get(todayUtc()) as { total_usd: number } | undefined;
  return row?.total_usd ?? 0;
}

/**
 * Check whether a Stripe event has already been processed.
 * Used for webhook idempotency — Stripe retries deliveries aggressively on
 * transient errors, and without this guard we'd send duplicate receipt
 * emails (creditBillableHours is already reference-id idempotent).
 */
export function isStripeEventProcessed(eventId: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM billing_events WHERE stripe_session_id = ? LIMIT 1`)
    .get(eventId) as { 1: number } | undefined;
  return !!row;
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
      const existing = db.prepare(`SELECT id FROM billable_hours WHERE reference_id = ? AND type != 'debit'`).get(referenceId);
      if (existing) {
        logger.info('duplicate_credit_skipped', referenceId);
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
    // Re-arm low-balance warning when user tops up
    clearLowBalanceWarning(userId);
  })();
  return credited;
}

/** Place a hold on billable hours at session start (prevents TOCTOU between balance check and debit).
 *  The hold is a negative ledger entry with type='hold'. Released by releaseHold() at session end. */
export function holdBillableHours(userId: string, amount: number, sessionId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  let success = false;
  db.transaction(() => {
    // Don't double-hold the same session
    const existing = db.prepare(`SELECT 1 FROM billable_hours WHERE reference_id = ? AND type = 'hold'`).get(`hold:${sessionId}`);
    if (existing) { success = true; return; }
    const current = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as balance FROM billable_hours WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)`).get(userId, now) as { balance: number }).balance;
    if (current < amount) { success = false; return; }
    const id = `bh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO billable_hours (id, user_id, type, amount, balance_after, description, reference_id, created_at)
      VALUES (?, ?, 'hold', ?, ?, ?, ?, ?)
    `).run(id, userId, -amount, current - amount, `Hold for session ${sessionId}`, `hold:${sessionId}`, now);
    success = true;
  })();
  return success;
}

/** Release a hold placed by holdBillableHours(). Call at session end before debiting actual cost. */
export function releaseHold(sessionId: string): void {
  getDb().prepare(`DELETE FROM billable_hours WHERE reference_id = ? AND type = 'hold'`).run(`hold:${sessionId}`);
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

// ── Referral System ──────────────────────────────────────────────────────

/** Generate and set a referral code for a user (first 8 chars of user ID hex suffix). */
export function ensureReferralCode(userId: string): string {
  const user = getDb().prepare(`SELECT referral_code FROM users WHERE id = ?`).get(userId) as { referral_code: string | null } | undefined;
  if (user?.referral_code) return user.referral_code;

  // Generate from user ID suffix + random bytes for uniqueness
  const code = `ref-${crypto.randomBytes(4).toString('hex')}`;
  getDb().prepare(`UPDATE users SET referral_code = ? WHERE id = ?`).run(code, userId);
  return code;
}

/** Look up a user by referral code. */
export function getUserByReferralCode(code: string): DbUser | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE referral_code = ?`).get(code) as DbUser | undefined;
}

/** Set the referred_by field on a user. */
export function setReferredBy(userId: string, referrerId: string): void {
  getDb().prepare(`UPDATE users SET referred_by = ? WHERE id = ?`).run(referrerId, userId);
}

/** Get referral stats for a user. */
export function getReferralStats(userId: string): { referralCode: string; referralCount: number; hoursEarned: number } {
  const code = ensureReferralCode(userId);
  const row = getDb().prepare(`SELECT COUNT(*) as cnt FROM users WHERE referred_by = ?`).get(userId) as { cnt: number };
  // Each referral credits configurable hours (tracked via billable_hours with type='referral')
  const earned = getDb().prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM billable_hours WHERE user_id = ? AND type = 'referral'
  `).get(userId) as { total: number };
  return { referralCode: code, referralCount: row.cnt, hoursEarned: earned.total };
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
  // Audit fix C3: include user-authored share artifacts in the GDPR
  // portability bundle (Article 20).
  sharedAgents: Array<{ token: string; profile_json: string; created_at: string }>;
  sharedTeams: Array<{ token: string; title: string; team_json: string; created_at: string }>;
} {
  const d = getDb();
  const profile = getUserById(userId);
  const sessions = d.prepare(`SELECT * FROM session_archive WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as ArchivedSession[];
  const usage = d.prepare(`SELECT month, total_cost_usd, engagement_count FROM user_usage WHERE user_id = ? ORDER BY month DESC`).all(userId) as Array<{ month: string; total_cost_usd: number; engagement_count: number }>;
  const billingEvents = d.prepare(`SELECT type, amount_cents, plan, created_at FROM billing_events WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as Array<{ type: string; amount_cents: number; plan: string | null; created_at: string }>;
  const billableHours = d.prepare(`SELECT * FROM billable_hours WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as BillableHoursEntry[];
  const auditLog = d.prepare(`SELECT timestamp, action, resource FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1000`).all(userId) as Array<{ timestamp: string; action: string; resource: string | null }>;
  const sharedAgents = d.prepare(`SELECT token, profile_json, created_at FROM shared_agents WHERE owner_id = ? ORDER BY created_at DESC`).all(userId) as Array<{ token: string; profile_json: string; created_at: string }>;
  const sharedTeams = d.prepare(`SELECT token, title, team_json, created_at FROM shared_teams WHERE owner_id = ? ORDER BY created_at DESC`).all(userId) as Array<{ token: string; title: string; team_json: string; created_at: string }>;

  return { profile, sessions, usage, billingEvents, billableHours, auditLog, sharedAgents, sharedTeams };
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

    // Revoke all auth tokens and user tokens (reset/verify)
    d.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(userId);
    d.prepare(`DELETE FROM user_tokens WHERE user_id = ?`).run(userId);

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

    // Audit fix C3: GDPR Article 17 — erase publicly-shared agent and team
    // cards. Both tables embed `owner_name` and `profile_json`/`team_json`
    // which contain user-authored content; leaving them public after erasure
    // violates right-to-be-forgotten.
    d.prepare(`DELETE FROM shared_agents WHERE owner_id = ?`).run(userId);
    d.prepare(`DELETE FROM shared_teams WHERE owner_id = ?`).run(userId);

    // Anonymize audit log entries (keep timestamps/actions for analytics)
    d.prepare(`UPDATE audit_log SET ip = NULL, user_agent = NULL WHERE user_id = ?`).run(userId);

    // Audit this action (inside transaction so it's visible even if we fail)
    logAuditEvent({ userId, action: 'account_deleted', resource: 'auth', detail: { anonymizedAt: now } });
  })();

  return true;
}

// ── Shared Agents ──────────────────────────────────────────────────────

export interface SharedAgentRow {
  token: string;
  ownerId: string | null;
  ownerName: string;
  profileJson: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Insert or replace a shared-agent row (rotates token if provided). */
export function upsertSharedAgent(
  token: string,
  ownerId: string | null,
  ownerName: string,
  profileJson: string,
): void {
  const d = getDb();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO shared_agents (token, owner_id, owner_name, profile_json, view_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      owner_id = excluded.owner_id,
      owner_name = excluded.owner_name,
      profile_json = excluded.profile_json,
      updated_at = excluded.updated_at
  `).run(token, ownerId, ownerName, profileJson, now, now);
}

/** Look up a shared agent by token. Returns null if not found. */
export function getSharedAgent(token: string): SharedAgentRow | null {
  const d = getDb();
  const row = d.prepare(`
    SELECT token, owner_id, owner_name, profile_json, view_count, created_at, updated_at
    FROM shared_agents WHERE token = ?
  `).get(token) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    token: row.token as string,
    ownerId: (row.owner_id as string | null) ?? null,
    ownerName: (row.owner_name as string) ?? '',
    profileJson: row.profile_json as string,
    viewCount: (row.view_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Increment view counter (best-effort, non-blocking semantics). */
export function bumpSharedAgentViews(token: string): void {
  const d = getDb();
  d.prepare(`UPDATE shared_agents SET view_count = view_count + 1 WHERE token = ?`).run(token);
}

/** Owner-only revoke. Returns true if a row was deleted. */
export function deleteSharedAgent(token: string, ownerId: string): boolean {
  const d = getDb();
  const r = d.prepare(`DELETE FROM shared_agents WHERE token = ? AND owner_id = ?`).run(token, ownerId);
  return r.changes > 0;
}

// ── Shared teams ────────────────────────────────────────────────────────

export interface SharedTeamRow {
  token: string;
  ownerId: string | null;
  ownerName: string;
  title: string;
  teamJson: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Insert or replace a shared-team row (rotates token if provided). */
export function upsertSharedTeam(
  token: string,
  ownerId: string | null,
  ownerName: string,
  title: string,
  teamJson: string,
): void {
  const d = getDb();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO shared_teams (token, owner_id, owner_name, title, team_json, view_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      owner_id = excluded.owner_id,
      owner_name = excluded.owner_name,
      title = excluded.title,
      team_json = excluded.team_json,
      updated_at = excluded.updated_at
  `).run(token, ownerId, ownerName, title, teamJson, now, now);
}

export function getSharedTeam(token: string): SharedTeamRow | null {
  const d = getDb();
  const row = d.prepare(`
    SELECT token, owner_id, owner_name, title, team_json, view_count, created_at, updated_at
    FROM shared_teams WHERE token = ?
  `).get(token) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    token: row.token as string,
    ownerId: (row.owner_id as string | null) ?? null,
    ownerName: (row.owner_name as string) ?? '',
    title: (row.title as string) ?? '',
    teamJson: row.team_json as string,
    viewCount: (row.view_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function bumpSharedTeamViews(token: string): void {
  const d = getDb();
  d.prepare(`UPDATE shared_teams SET view_count = view_count + 1 WHERE token = ?`).run(token);
}

export function deleteSharedTeam(token: string, ownerId: string): boolean {
  const d = getDb();
  const r = d.prepare(`DELETE FROM shared_teams WHERE token = ? AND owner_id = ?`).run(token, ownerId);
  return r.changes > 0;
}
