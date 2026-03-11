/**
 * Auth Routes — User signup, login, logout, and profile management.
 *
 * Uses cookie-based auth (marble_token HttpOnly cookie).
 * Passwords hashed with Node's built-in crypto.scrypt.
 *
 * POST  /api/auth/signup   — Create account
 * POST  /api/auth/login    — Login
 * POST  /api/auth/logout   — Logout
 * GET   /api/auth/me       — Get current user
 * PUT   /api/auth/profile  — Update profile
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByToken,
  updateUserProfile,
  createAuthToken,
  deleteAuthToken,
  hashPassword,
  verifyPassword,
  logAuditEvent,
  exportUserData,
  softDeleteUser,
  getWaitlistEntryByCode,
  markInviteUsed,
  creditBillableHours,
} from '../../db/database.js';
import { validateBody } from '../middleware/validation.js';
import { parseCookieToken } from '../middleware/auth.js';
import { config } from '../../config.js';
import { sendWelcomeEmail } from '../../email/send.js';

// ── Schemas ──────────────────────────────────────────────────────────────

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().max(200).optional(),
  firmName: z.string().max(200).optional(),
  inviteCode: z.string().max(50).optional(),
}).strict();

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
}).strict();

const ProfileUpdateSchema = z.object({
  displayName: z.string().max(200).optional(),
  firmName: z.string().max(200).optional(),
  profileJson: z.string().max(50000).optional().refine(
    val => { if (!val) return true; try { JSON.parse(val); return true; } catch { return false; } },
    { message: 'profileJson must be valid JSON' },
  ),
}).strict();

// ── Cookie helpers ───────────────────────────────────────────────────────

const COOKIE_NAME = 'marble_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

const SECURE_FLAG = process.env.NODE_ENV === 'development' ? '' : '; Secure';

function setAuthCookie(reply: FastifyReply, token: string): void {
  const cookie = `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${SECURE_FLAG}`;
  reply.header('Set-Cookie', cookie);
}

function clearAuthCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${SECURE_FLAG}`);
}

function sanitizeUser(user: { id: string; email: string; display_name: string; firm_name: string; profile_json: string }) {
  let profile = {};
  let profileCorrupted = false;
  try {
    profile = JSON.parse(user.profile_json);
  } catch (err) {
    if (user.profile_json && user.profile_json !== '{}') {
      console.error(`[AUTH] Corrupted profile JSON for user ${user.id}:`, err instanceof Error ? err.message : err);
      profileCorrupted = true;
    }
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    firmName: user.firm_name,
    profile,
    ...(profileCorrupted ? { profileCorrupted: true } : {}),
  };
}

// ── Routes ───────────────────────────────────────────────────────────────

export function registerUserAuthRoutes(fastify: FastifyInstance): void {

  // ── POST /api/auth/signup ──────────────────────────────────────────────

  fastify.post('/api/auth/signup', {
    config: {
      rateLimit: {
        max: config.rateLimitAuthSignupMax,
        timeWindow: config.rateLimitAuthWindowMs,
      },
    },
  }, async (request, reply) => {
    const body = validateBody(SignupSchema, request, reply);
    if (!body) return;

    // Normalize email before any lookups to prevent case/whitespace duplicates
    body.email = body.email.toLowerCase().trim();

    // Check for existing user
    const existing = getUserByEmail(body.email);
    if (existing) {
      return reply.status(409).send({ error: 'An account with this email already exists.' });
    }

    // v22: Waitlist gate — require invite code when enabled
    if (config.billableHours.waitlistEnabled) {
      if (!body.inviteCode) {
        return reply.status(403).send({ error: 'An invite code is required to sign up. Join the waitlist at marble.legal.' });
      }
      const waitlistEntry = getWaitlistEntryByCode(body.inviteCode);
      if (!waitlistEntry || waitlistEntry.status !== 'invited') {
        return reply.status(403).send({ error: 'Invalid or expired invite code.' });
      }
      if (waitlistEntry.email !== body.email.toLowerCase().trim()) {
        return reply.status(403).send({ error: 'This invite code was issued to a different email address.' });
      }
    }

    const passwordHash = await hashPassword(body.password);
    const user = createUser(body.email, passwordHash, body.displayName, body.firmName);
    const token = createAuthToken(user.id);

    logAuditEvent({ userId: user.id, action: 'signup', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
    setAuthCookie(reply, token);

    // v22: Mark invite used + credit welcome hours
    if (config.billableHours.waitlistEnabled && body.inviteCode) {
      markInviteUsed(body.inviteCode, user.id);
      creditBillableHours(
        user.id,
        config.billableHours.welcomeHours,
        'welcome',
        `Welcome to Marble — ${config.billableHours.welcomeHours} billable hours on us.`,
      );
    }

    // Welcome email — fire-and-forget
    sendWelcomeEmail(body.email, body.displayName).catch(err => console.error('[EMAIL] Welcome email failed:', err));

    return reply.status(201).send({ user: sanitizeUser(user) });
  });

  // ── POST /api/auth/login ───────────────────────────────────────────────

  fastify.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: config.rateLimitAuthLoginMax,
        timeWindow: config.rateLimitAuthWindowMs,
      },
    },
  }, async (request, reply) => {
    const body = validateBody(LoginSchema, request, reply);
    if (!body) return;

    const user = getUserByEmail(body.email.toLowerCase().trim());
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      logAuditEvent({ userId: user.id, action: 'login_failed', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const token = createAuthToken(user.id);
    logAuditEvent({ userId: user.id, action: 'login', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
    setAuthCookie(reply, token);
    return reply.send({ user: sanitizeUser(user) });
  });

  // ── POST /api/auth/logout ──────────────────────────────────────────────

  fastify.post('/api/auth/logout', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (token) {
      const user = getUserByToken(token);
      if (user) {
        logAuditEvent({ userId: user.id, action: 'logout', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
      }
      deleteAuthToken(token);
    }
    clearAuthCookie(reply);
    return reply.send({ success: true });
  });

  // ── GET /api/auth/me ───────────────────────────────────────────────────

  fastify.get('/api/auth/me', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired.' });
    }

    return reply.send({ user: sanitizeUser(user) });
  });

  // ── PUT /api/auth/profile ──────────────────────────────────────────────

  fastify.put('/api/auth/profile', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Session expired.' });
    }

    const body = validateBody(ProfileUpdateSchema, request, reply);
    if (!body) return;

    const updated = updateUserProfile(user.id, {
      displayName: body.displayName,
      firmName: body.firmName,
      profileJson: body.profileJson,
    });

    if (!updated) {
      return reply.status(404).send({ error: 'User not found.' });
    }

    logAuditEvent({ userId: user.id, action: 'profile_update', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
    return reply.send({ user: sanitizeUser(updated) });
  });

  // ── GET /api/auth/export — GDPR data portability (Article 20) ─────────

  fastify.get('/api/auth/export', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired.' });
    }

    logAuditEvent({ userId: user.id, action: 'data_export', resource: 'gdpr', ip: request.ip, userAgent: request.headers['user-agent'] });

    const data = exportUserData(user.id);

    // Return as JSON (frontend can convert to downloadable ZIP if desired)
    reply.header('Content-Disposition', 'attachment; filename="marble-data-export.json"');
    return reply.send({
      exportedAt: new Date().toISOString(),
      user: data.profile ? {
        id: data.profile.id,
        email: data.profile.email,
        displayName: data.profile.display_name,
        firmName: data.profile.firm_name,
        createdAt: data.profile.created_at,
      } : null,
      sessions: data.sessions.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        workflowId: s.workflow_id,
        costUsd: s.cost_usd,
        createdAt: s.created_at,
        completedAt: s.completed_at,
      })),
      usage: data.usage,
      billingEvents: data.billingEvents,
      auditLog: data.auditLog,
    });
  });

  // ── DELETE /api/auth/account — GDPR right to erasure (Article 17) ─────

  fastify.delete('/api/auth/account', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired.' });
    }

    // Require confirmation header to prevent accidental deletion
    const confirm = request.headers['x-confirm-delete'];
    if (confirm !== 'permanently-delete-my-account') {
      return reply.status(400).send({
        error: 'Account deletion requires confirmation.',
        message: 'Set header X-Confirm-Delete: permanently-delete-my-account',
      });
    }

    const deleted = softDeleteUser(user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'User not found.' });
    }

    clearAuthCookie(reply);
    return reply.send({
      success: true,
      message: 'Account data has been anonymized. Your sessions and usage data are retained in anonymized form for analytics.',
    });
  });
}
