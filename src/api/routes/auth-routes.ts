/**
 * Auth Routes — User signup, login, logout, and profile management.
 *
 * Uses cookie-based auth (lavern_token HttpOnly cookie).
 * Passwords hashed with Node's built-in crypto.scrypt.
 *
 * POST  /api/auth/signup              — Create account
 * POST  /api/auth/login               — Login
 * POST  /api/auth/logout              — Logout
 * GET   /api/auth/me                  — Get current user
 * PUT   /api/auth/profile             — Update profile
 * POST  /api/auth/forgot-password     — Request password reset email
 * POST  /api/auth/reset-password      — Reset password with token
 * POST  /api/auth/verify-email        — Verify email with token
 * POST  /api/auth/resend-verification — Resend verification email
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
  deleteAllUserAuthTokens,
  hashPassword,
  verifyPassword,
  logAuditEvent,
  exportUserData,
  softDeleteUser,
  getWaitlistEntryByCode,
  markInviteUsed,
  creditBillableHours,
  createPasswordResetToken,
  getPasswordResetToken,
  markTokenUsed,
  invalidateUserTokens,
  updatePasswordHash,
  createVerificationToken,
  getVerificationToken,
  setEmailVerified,
  isEmailVerified,
  getUserByReferralCode,
  setReferredBy,
  ensureReferralCode,
} from '../../db/database.js';
import { validateBody } from '../middleware/validation.js';
import { parseCookieToken } from '../middleware/auth.js';
import { config } from '../../config.js';
import { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail, sendReferralEmail } from '../../email/send.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AUTH');

// ── Schemas ──────────────────────────────────────────────────────────────

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().max(200).optional(),
  firmName: z.string().max(200).optional(),
  inviteCode: z.string().max(50).optional(),
  referralCode: z.string().max(50).optional(),
}).strict();

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
}).strict();

const ForgotPasswordSchema = z.object({
  email: z.string().email().max(200),
}).strict();

const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
}).strict();

const VerifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
}).strict();

const ProfileUpdateSchema = z.object({
  displayName: z.string().max(200).optional(),
  firmName: z.string().max(200).optional(),
  profileJson: z.string().max(50000).optional().refine(
    val => { if (!val) return true; try { JSON.parse(val); return true; } catch { return false; } },
    { message: 'profileJson must be valid JSON' },
  ),
}).strict();

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
}).strict();

// ── Cookie helpers ───────────────────────────────────────────────────────

const COOKIE_NAME = 'lavern_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Secure flag must be omitted on plain HTTP (localhost dev). Check both
// NODE_ENV and the base URL — NODE_ENV is often unset in local runs, and
// the cookie is silently dropped by every browser if Secure is set over HTTP.
const isLocalDev =
  config.isDevelopment ||
  config.baseUrl.startsWith('http://localhost') ||
  config.baseUrl.startsWith('http://127.0.0.1');
const SECURE_FLAG = isLocalDev ? '' : '; Secure';

function setAuthCookie(reply: FastifyReply, token: string): void {
  const cookie = `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${SECURE_FLAG}`;
  reply.header('Set-Cookie', cookie);
}

function clearAuthCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${SECURE_FLAG}`);
}

function sanitizeUser(user: { id: string; email: string; display_name: string; firm_name: string; profile_json: string; email_verified?: number }) {
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
    emailVerified: !!(user.email_verified),
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
    // Signup gate — set LAVERN_SIGNUP_DISABLED=true to block new registrations
    if (config.signupDisabled) {
      return reply.status(503).send({ error: 'We are not accepting new accounts at this time. Join the waitlist at lavern.ai.' });
    }

    const body = validateBody(SignupSchema, request, reply);
    if (!body) return;

    // Normalize email before any lookups to prevent case/whitespace duplicates
    body.email = body.email.toLowerCase().trim();

    // Check for existing user
    const existing = getUserByEmail(body.email);
    if (existing) {
      return reply.status(409).send({ error: 'An account with this email already exists.' });
    }

    // v24: Validate invite code if provided (optional — free trial without code)
    if (body.inviteCode) {
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

    // v24: Credit hours — invite code users get full welcome hours, others get free trial
    if (body.inviteCode) {
      markInviteUsed(body.inviteCode, user.id);
      creditBillableHours(
        user.id,
        config.billableHours.welcomeHours,
        'welcome',
        `Welcome to Lavern — ${config.billableHours.welcomeHours} billable hours on us.`,
      );
    } else if (config.billableHours.freeTrialHours > 0) {
      creditBillableHours(
        user.id,
        config.billableHours.freeTrialHours,
        'welcome',
        `Free trial — ${config.billableHours.freeTrialHours} billable hours to get started.`,
      );
    }

    // v26: Referral — credit both referrer and referee
    if (body.referralCode) {
      const referrer = getUserByReferralCode(body.referralCode);
      if (referrer && referrer.id !== user.id) {
        const hours = config.billableHours.referralHours;
        setReferredBy(user.id, referrer.id);
        creditBillableHours(user.id, hours, 'referral', `Referral bonus — welcome to Lavern.`);
        creditBillableHours(referrer.id, hours, 'referral', `Referral bonus — someone joined with your link.`);
        // Notify referrer
        sendReferralEmail(referrer.email, referrer.display_name, hours).catch(err => logger.error('referral_email_failed', err));
      }
    }

    // Welcome email — fire-and-forget
    sendWelcomeEmail(body.email, body.displayName).catch(err => logger.error('welcome_email_failed', err));

    // v23: Send email verification link
    const verifyToken = createVerificationToken(user.id);
    const verifyUrl = `${config.email.appUrl}/#/verify-email?token=${verifyToken}`;
    sendVerificationEmail(body.email, verifyUrl).catch(err => logger.error('verification_email_failed', err));

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
      // Constant-time delay to prevent email enumeration via timing attack.
      // verifyPassword() takes ~100ms (scrypt), so match that latency for
      // non-existent users to make both paths indistinguishable.
      await new Promise(r => setTimeout(r, 80 + Math.random() * 40));
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

  // ── POST /api/auth/change-password ────────────────────────────────────

  fastify.post('/api/auth/change-password', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Session expired.' });
    }

    const body = validateBody(ChangePasswordSchema, request, reply);
    if (!body) return;

    // Verify current password
    const isValid = await verifyPassword(body.currentPassword, user.password_hash);
    if (!isValid) {
      return reply.status(400).send({ error: 'Current password is incorrect.' });
    }

    // Update password hash
    const newHash = await hashPassword(body.newPassword);
    updatePasswordHash(user.id, newHash);

    // Invalidate all other sessions (force re-login everywhere else)
    deleteAllUserAuthTokens(user.id);

    // Issue a new token for the current session
    const newToken = createAuthToken(user.id);
    setAuthCookie(reply, newToken);

    logAuditEvent({ userId: user.id, action: 'password_changed', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
    return reply.send({ success: true, message: 'Password changed successfully.' });
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
    reply.header('Content-Disposition', 'attachment; filename="lavern-data-export.json"');
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

  // ── POST /api/auth/forgot-password ──────────────────────────────────

  fastify.post('/api/auth/forgot-password', {
    config: {
      rateLimit: {
        max: config.auth.rateLimitForgotPasswordMax,
        timeWindow: config.rateLimitAuthWindowMs,
      },
    },
  }, async (request, reply) => {
    const body = validateBody(ForgotPasswordSchema, request, reply);
    if (!body) return;

    // Audit follow-up: constant-time response window. Without this floor,
    // the existing-user branch did a DB write (createPasswordResetToken) +
    // queued an email; the non-existing-user branch did nothing. The
    // measurable delta lets a remote attacker enumerate registered emails
    // by timing the response. Same mitigation as login (per v0.11.2).
    const startedAt = Date.now();
    const MIN_RESPONSE_MS = 200;

    const email = body.email.toLowerCase().trim();
    logAuditEvent({ action: 'forgot_password', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'], detail: { email } });

    // Always return 200 to prevent email enumeration via status code.
    const user = getUserByEmail(email);
    if (user) {
      const token = createPasswordResetToken(user.id);
      const resetUrl = `${config.email.appUrl}/#/reset-password?token=${token}`;
      sendPasswordResetEmail(email, resetUrl).catch(err => logger.error('reset_email_failed', err));
    }

    // Pad to MIN_RESPONSE_MS so existing vs. non-existing emails are
    // indistinguishable by timing.
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
    }

    return reply.send({ success: true, message: 'If an account with that email exists, we sent a password reset link.' });
  });

  // ── POST /api/auth/reset-password ───────────────────────────────────

  fastify.post('/api/auth/reset-password', {
    config: {
      rateLimit: {
        max: config.rateLimitAuthLoginMax,
        timeWindow: config.rateLimitAuthWindowMs,
      },
    },
  }, async (request, reply) => {
    const body = validateBody(ResetPasswordSchema, request, reply);
    if (!body) return;

    const tokenRow = getPasswordResetToken(body.token);
    if (!tokenRow) {
      return reply.status(400).send({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Atomically consume the token FIRST to prevent race conditions
    if (!markTokenUsed(body.token)) {
      return reply.status(400).send({ error: 'This reset link has already been used. Please request a new one.' });
    }

    const newHash = await hashPassword(body.password);
    // Wrap remaining writes in a transaction for consistency
    const { getDb } = await import('../../db/database.js');
    getDb().transaction(() => {
      updatePasswordHash(tokenRow.user_id, newHash);
      invalidateUserTokens(tokenRow.user_id, 'reset');
      deleteAllUserAuthTokens(tokenRow.user_id); // Force re-login everywhere
    })();

    logAuditEvent({ userId: tokenRow.user_id, action: 'password_reset', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });

    return reply.send({ success: true, message: 'Password has been reset. Please sign in with your new password.' });
  });

  // ── POST /api/auth/verify-email ─────────────────────────────────────

  fastify.post('/api/auth/verify-email', async (request, reply) => {
    const body = validateBody(VerifyEmailSchema, request, reply);
    if (!body) return;

    const tokenRow = getVerificationToken(body.token);
    if (!tokenRow) {
      return reply.status(400).send({ error: 'Invalid or expired verification link. Please request a new one.' });
    }

    // Atomically consume the token FIRST to prevent race conditions
    if (!markTokenUsed(body.token)) {
      return reply.status(400).send({ error: 'This verification link has already been used. Please request a new one.' });
    }

    setEmailVerified(tokenRow.user_id);

    logAuditEvent({ userId: tokenRow.user_id, action: 'email_verified', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });

    return reply.send({ success: true, message: 'Email verified successfully.' });
  });

  // ── POST /api/auth/resend-verification ──────────────────────────────

  fastify.post('/api/auth/resend-verification', {
    config: {
      rateLimit: {
        max: config.auth.rateLimitResendVerificationMax,
        timeWindow: config.rateLimitAuthWindowMs,
      },
    },
  }, async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Session expired.' });
    }

    if (isEmailVerified(user.id)) {
      return reply.send({ success: true, alreadyVerified: true, message: 'Email is already verified.' });
    }

    const verifyToken = createVerificationToken(user.id);
    const verifyUrl = `${config.email.appUrl}/#/verify-email?token=${verifyToken}`;
    sendVerificationEmail(user.email, verifyUrl).catch(err => logger.error('verification_email_failed', err));

    return reply.send({ success: true, message: 'Verification email sent.' });
  });
}
