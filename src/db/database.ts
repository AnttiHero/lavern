/**
 * Database Layer — SQLite persistence for users, sessions, and matters.
 *
 * Uses better-sqlite3 (synchronous, fast, zero-config).
 * The DB file lives at ./data/marble.db by default.
 *
 * Live sessions stay in-memory (SessionManager handles EventBus, WebSocket).
 * SQLite stores the archive: completed sessions, user accounts, matters.
 * Think of it as: RAM for live work, SQLite for the archive.
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
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id),
      title             TEXT DEFAULT 'Untitled',
      status            TEXT DEFAULT 'completed',
      workflow_id       TEXT,
      team_roles        TEXT DEFAULT '[]',
      findings_count    INTEGER DEFAULT 0,
      resolutions_count INTEGER DEFAULT 0,
      cost_usd          REAL DEFAULT 0,
      budget_usd        REAL DEFAULT 0,
      final_output      TEXT,
      summary_json      TEXT DEFAULT '{}',
      created_at        TEXT NOT NULL,
      completed_at      TEXT,
      duration_ms       INTEGER DEFAULT 0
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
  `);
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
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
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
     resolutions_count, cost_usd, budget_usd, final_output, summary_json,
     created_at, completed_at, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
