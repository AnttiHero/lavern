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
} from '../../db/database.js';
import { validateBody } from '../middleware/validation.js';
import { parseCookieToken } from '../middleware/auth.js';

// ── Schemas ──────────────────────────────────────────────────────────────

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().max(200).optional(),
  firmName: z.string().max(200).optional(),
}).strict();

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
}).strict();

const ProfileUpdateSchema = z.object({
  displayName: z.string().max(200).optional(),
  firmName: z.string().max(200).optional(),
  profileJson: z.string().max(50000).optional(),
}).strict();

// ── Cookie helpers ───────────────────────────────────────────────────────

const COOKIE_NAME = 'marble_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

const SECURE_FLAG = process.env.NODE_ENV === 'production' ? '; Secure' : '';

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

  fastify.post('/api/auth/signup', async (request, reply) => {
    const body = validateBody(SignupSchema, request, reply);
    if (!body) return;

    // Check for existing user
    const existing = getUserByEmail(body.email);
    if (existing) {
      return reply.status(409).send({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(body.password);
    const user = createUser(body.email, passwordHash, body.displayName, body.firmName);
    const token = createAuthToken(user.id);

    setAuthCookie(reply, token);
    return reply.status(201).send({ user: sanitizeUser(user) });
  });

  // ── POST /api/auth/login ───────────────────────────────────────────────

  fastify.post('/api/auth/login', async (request, reply) => {
    const body = validateBody(LoginSchema, request, reply);
    if (!body) return;

    const user = getUserByEmail(body.email);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const token = createAuthToken(user.id);
    setAuthCookie(reply, token);
    return reply.send({ user: sanitizeUser(user) });
  });

  // ── POST /api/auth/logout ──────────────────────────────────────────────

  fastify.post('/api/auth/logout', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (token) {
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

    return reply.send({ user: sanitizeUser(updated) });
  });
}
