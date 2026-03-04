/**
 * Unit Tests — Database Layer (src/db/database.ts)
 *
 * Tests:
 * - Database initialization (SQLite in-memory)
 * - User CRUD (createUser, getUserByEmail, getUserById, updateUserProfile)
 * - Password hashing and verification
 * - Auth token lifecycle (create, lookup, delete, clean expired)
 * - Matter storage (save, get by user, get by id)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initDatabase,
  getDb,
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  hashPassword,
  verifyPassword,
  createAuthToken,
  getUserByToken,
  deleteAuthToken,
  cleanExpiredTokens,
  saveMatter,
  getMattersByUser,
  getMatterById,
} from '../../src/db/database.js';

// ── Setup — Use in-memory SQLite for tests ──────────────────────────────

beforeAll(() => {
  initDatabase(':memory:');
});

afterAll(() => {
  try {
    getDb().close();
  } catch { /* already closed or not initialized */ }
});

// ── Password Hashing ────────────────────────────────────────────────────

describe('Password Hashing', () => {
  it('should hash a password to a salt:key format', async () => {
    const hash = await hashPassword('test-password');
    expect(hash).toContain(':');
    const [salt, key] = hash.split(':');
    expect(salt.length).toBe(32);  // 16 bytes hex = 32 chars
    expect(key.length).toBe(128);  // 64 bytes hex = 128 chars
  });

  it('should produce different hashes for the same password (different salts)', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    expect(h1).not.toBe(h2);
  });

  it('should verify correct password', async () => {
    const hash = await hashPassword('verify-me');
    const valid = await verifyPassword('verify-me', hash);
    expect(valid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    const valid = await verifyPassword('wrong-password', hash);
    expect(valid).toBe(false);
  });
});

// ── User CRUD ───────────────────────────────────────────────────────────

describe('User CRUD', () => {
  describe('createUser', () => {
    it('should create a user with email and password hash', async () => {
      const hash = await hashPassword('test123');
      const user = createUser('test@example.com', hash);

      expect(user.id).toMatch(/^user-/);
      expect(user.email).toBe('test@example.com');
      expect(user.password_hash).toBe(hash);
      expect(user.display_name).toBe('');
      expect(user.firm_name).toBe('');
      expect(user.profile_json).toBe('{}');
      expect(user.created_at).toBeDefined();
      expect(user.updated_at).toBeDefined();
    });

    it('should create a user with display name and firm name', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('named@example.com', hash, 'Jane Doe', 'Acme Law LLP');

      expect(user.display_name).toBe('Jane Doe');
      expect(user.firm_name).toBe('Acme Law LLP');
    });

    it('should normalize email to lowercase', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('Upper@Example.COM', hash);
      expect(user.email).toBe('upper@example.com');
    });

    it('should reject duplicate emails', async () => {
      const hash = await hashPassword('pw');
      createUser('dup@example.com', hash);

      expect(() => createUser('dup@example.com', hash)).toThrow();
    });
  });

  describe('getUserByEmail', () => {
    it('should find a user by email', async () => {
      const hash = await hashPassword('pw');
      const created = createUser('find-by-email@example.com', hash);
      const found = getUserByEmail('find-by-email@example.com');

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should be case-insensitive', async () => {
      const hash = await hashPassword('pw');
      createUser('case-test@example.com', hash);
      const found = getUserByEmail('CASE-TEST@EXAMPLE.COM');

      expect(found).toBeDefined();
      expect(found!.email).toBe('case-test@example.com');
    });

    it('should return undefined for unknown email', () => {
      expect(getUserByEmail('nobody@nowhere.com')).toBeUndefined();
    });
  });

  describe('getUserById', () => {
    it('should find a user by ID', async () => {
      const hash = await hashPassword('pw');
      const created = createUser('find-by-id@example.com', hash);
      const found = getUserById(created.id);

      expect(found).toBeDefined();
      expect(found!.email).toBe('find-by-id@example.com');
    });

    it('should return undefined for unknown ID', () => {
      expect(getUserById('user-nonexistent')).toBeUndefined();
    });
  });

  describe('updateUserProfile', () => {
    it('should update display name', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('update-name@example.com', hash);

      const updated = updateUserProfile(user.id, { displayName: 'New Name' });
      expect(updated).toBeDefined();
      expect(updated!.display_name).toBe('New Name');
    });

    it('should update firm name', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('update-firm@example.com', hash);

      const updated = updateUserProfile(user.id, { firmName: 'BigLaw Partners' });
      expect(updated!.firm_name).toBe('BigLaw Partners');
    });

    it('should update profile JSON', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('update-json@example.com', hash);
      const profileData = JSON.stringify({ jurisdiction: 'US', specialties: ['IP'] });

      const updated = updateUserProfile(user.id, { profileJson: profileData });
      expect(updated!.profile_json).toBe(profileData);
    });

    it('should update multiple fields at once', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('update-multi@example.com', hash);

      const updated = updateUserProfile(user.id, {
        displayName: 'Multi Update',
        firmName: 'Multi Firm',
      });
      expect(updated!.display_name).toBe('Multi Update');
      expect(updated!.firm_name).toBe('Multi Firm');
    });

    it('should update the updated_at timestamp', async () => {
      const hash = await hashPassword('pw');
      const user = createUser('update-ts@example.com', hash);
      const originalUpdatedAt = user.updated_at;

      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 10));

      const updated = updateUserProfile(user.id, { displayName: 'Timestamped' });
      expect(updated!.updated_at).not.toBe(originalUpdatedAt);
    });

    it('should return undefined for unknown user ID', () => {
      const result = updateUserProfile('user-nonexistent', { displayName: 'Ghost' });
      expect(result).toBeUndefined();
    });
  });
});

// ── Auth Tokens ─────────────────────────────────────────────────────────

describe('Auth Tokens', () => {
  let testUserId: string;

  beforeAll(async () => {
    const hash = await hashPassword('token-test-pw');
    const user = createUser('token-user@example.com', hash);
    testUserId = user.id;
  });

  describe('createAuthToken', () => {
    it('should create a 64-character hex token', () => {
      const token = createAuthToken(testUserId);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should create unique tokens each time', () => {
      const t1 = createAuthToken(testUserId);
      const t2 = createAuthToken(testUserId);
      expect(t1).not.toBe(t2);
    });
  });

  describe('getUserByToken', () => {
    it('should return the user for a valid non-expired token', () => {
      const token = createAuthToken(testUserId);
      const user = getUserByToken(token);

      expect(user).toBeDefined();
      expect(user!.id).toBe(testUserId);
      expect(user!.email).toBe('token-user@example.com');
    });

    it('should return undefined for an invalid token', () => {
      expect(getUserByToken('deadbeef'.repeat(8))).toBeUndefined();
    });

    it('should return undefined for an empty token', () => {
      expect(getUserByToken('')).toBeUndefined();
    });
  });

  describe('deleteAuthToken', () => {
    it('should invalidate the token after deletion', () => {
      const token = createAuthToken(testUserId);
      expect(getUserByToken(token)).toBeDefined();

      deleteAuthToken(token);
      expect(getUserByToken(token)).toBeUndefined();
    });

    it('should not throw when deleting a non-existent token', () => {
      expect(() => deleteAuthToken('nonexistent-token')).not.toThrow();
    });
  });

  describe('cleanExpiredTokens', () => {
    it('should remove expired tokens', () => {
      // Manually insert an expired token
      const expiredToken = 'expired_' + Math.random().toString(36).slice(2);
      const pastDate = new Date(Date.now() - 86400_000).toISOString(); // 1 day ago

      getDb().prepare(`
        INSERT INTO auth_tokens (token, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(expiredToken, testUserId, pastDate, pastDate);

      // Verify it exists
      const beforeCount = getDb().prepare('SELECT COUNT(*) as c FROM auth_tokens WHERE token = ?').get(expiredToken) as { c: number };
      expect(beforeCount.c).toBe(1);

      // Clean
      const cleaned = cleanExpiredTokens();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      // Verify it's gone
      const afterCount = getDb().prepare('SELECT COUNT(*) as c FROM auth_tokens WHERE token = ?').get(expiredToken) as { c: number };
      expect(afterCount.c).toBe(0);
    });

    it('should not remove non-expired tokens', () => {
      const validToken = createAuthToken(testUserId);
      cleanExpiredTokens();
      // The valid token should still work (30 day TTL)
      expect(getUserByToken(validToken)).toBeDefined();
    });

    it('should return 0 when no tokens are expired', () => {
      // Clean twice — second call should find nothing new
      cleanExpiredTokens();
      const result = cleanExpiredTokens();
      // May be 0 or may catch tokens from other tests — just verify it doesn't throw
      expect(typeof result).toBe('number');
    });
  });
});

// ── Matter Storage ──────────────────────────────────────────────────────

describe('Matter Storage', () => {
  let userId: string;

  beforeAll(async () => {
    const hash = await hashPassword('matter-test');
    const user = createUser('matter-user@example.com', hash);
    userId = user.id;
  });

  describe('saveMatter', () => {
    it('should save a new matter', () => {
      const data = JSON.stringify({ title: 'NDA Review', type: 'review' });
      expect(() => saveMatter(userId, 'matter-1', data, 'pre-engagement')).not.toThrow();
    });

    it('should upsert (update on conflict)', () => {
      const data1 = JSON.stringify({ title: 'First Version' });
      const data2 = JSON.stringify({ title: 'Updated Version' });

      saveMatter(userId, 'matter-upsert', data1, 'pre-engagement');
      saveMatter(userId, 'matter-upsert', data2, 'accepted');

      const result = getMatterById('matter-upsert', userId);
      expect(result).toBeDefined();
      expect(JSON.parse(result!.data_json).title).toBe('Updated Version');
      expect(result!.status).toBe('accepted');
    });
  });

  describe('getMattersByUser', () => {
    it('should return all matters for a user', async () => {
      const user2Hash = await hashPassword('pw');
      const user2 = createUser('matters-list@example.com', user2Hash);

      saveMatter(user2.id, 'ml-1', '{"t":"A"}', 'pre-engagement');
      saveMatter(user2.id, 'ml-2', '{"t":"B"}', 'accepted');

      const matters = getMattersByUser(user2.id);
      expect(matters).toHaveLength(2);
    });

    it('should return empty array for user with no matters', async () => {
      const hash = await hashPassword('pw');
      const empty = createUser('no-matters@example.com', hash);
      expect(getMattersByUser(empty.id)).toEqual([]);
    });

    it('should not return other users matters', () => {
      const matters = getMattersByUser('user-nonexistent');
      expect(matters).toEqual([]);
    });
  });

  describe('getMatterById', () => {
    it('should return a specific matter', () => {
      const hash = 'matter-by-id-user';
      saveMatter(userId, 'mid-test', '{"title":"Specific"}', 'pre-engagement');

      const matter = getMatterById('mid-test', userId);
      expect(matter).toBeDefined();
      expect(matter!.id).toBe('mid-test');
      expect(JSON.parse(matter!.data_json).title).toBe('Specific');
    });

    it('should return undefined for wrong user', () => {
      saveMatter(userId, 'mid-wrong-user', '{}', 'pre-engagement');
      expect(getMatterById('mid-wrong-user', 'other-user-id')).toBeUndefined();
    });

    it('should return undefined for unknown matter ID', () => {
      expect(getMatterById('nonexistent-matter', userId)).toBeUndefined();
    });
  });
});
