/**
 * Google OAuth routes — "Continue with Google" login/signup.
 *
 * Flow:
 *   1. GET /api/auth/google          → redirect to Google consent screen
 *   2. GET /api/auth/google/callback  → exchange code, create/link user, set cookie, redirect
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  linkGoogleAccount,
  createAuthToken,
  logAuditEvent,
  creditBillableHours,
  setEmailVerified,
} from '../../db/database.js';
import { config } from '../../config.js';
import { sendWelcomeEmail } from '../../email/send.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('GOOGLE_AUTH');

const COOKIE_NAME = 'lavern_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const SECURE_FLAG = config.isDevelopment ? '' : '; Secure';

function setAuthCookie(reply: FastifyReply, token: string): void {
  const cookie = `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${SECURE_FLAG}`;
  reply.header('Set-Cookie', cookie);
}

// Store CSRF state tokens in-memory (short-lived, 10 min TTL)
const stateTokens = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [token, expires] of stateTokens) {
    if (now > expires) stateTokens.delete(token);
  }
}, 60_000);

export function registerGoogleAuthRoutes(fastify: FastifyInstance): void {
  // ── Step 1: Redirect to Google ──────────────────────────────────────
  fastify.get('/api/auth/google', async (_request, reply) => {
    if (!config.google.clientId) {
      return reply.status(503).send({ error: 'Google login is not configured.' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    stateTokens.set(state, Date.now() + 10 * 60 * 1000); // 10 min TTL

    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // ── Step 2: Google callback ─────────────────────────────────────────
  fastify.get('/api/auth/google/callback', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as Record<string, string>;

    // Handle user denial or error from Google
    if (oauthError) {
      logger.warn('oauth_denied', { error: oauthError });
      return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_denied`);
    }

    // Verify CSRF state
    if (!state || !stateTokens.has(state)) {
      logger.warn('oauth_invalid_state');
      return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
    }
    stateTokens.delete(state);

    if (!code) {
      return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: config.google.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        logger.error('oauth_token_exchange_failed', { status: tokenRes.status, body: err });
        return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
      }

      const tokenData = await tokenRes.json() as { access_token: string; id_token?: string };

      // Get user profile from Google
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileRes.ok) {
        logger.error('oauth_profile_failed', { status: profileRes.status });
        return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
      }

      const profile = await profileRes.json() as {
        sub: string;       // Google unique ID
        email: string;
        email_verified: boolean;
        name?: string;
        picture?: string;
      };

      if (!profile.email) {
        logger.error('oauth_no_email');
        return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
      }

      const email = profile.email.toLowerCase().trim();
      const googleId = profile.sub;
      const displayName = profile.name ?? '';

      // ── Account resolution logic ──
      let user = getUserByGoogleId(googleId);

      if (!user) {
        // Check if there's an existing email/password user
        const existingByEmail = getUserByEmail(email);

        if (existingByEmail) {
          // Only auto-link if the existing account's email is already verified
          // AND the Google profile claims the email is verified.
          // This prevents account takeover: an attacker can't create a Google
          // account with victim@example.com and auto-link to the victim's Lavern account.
          if (!existingByEmail.email_verified || !profile.email_verified) {
            logger.warn('google_link_blocked', {
              email,
              existingVerified: existingByEmail.email_verified,
              googleVerified: profile.email_verified,
            });
            return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
          }
          // Link Google to existing verified account
          linkGoogleAccount(existingByEmail.id, googleId);
          user = existingByEmail;
          logAuditEvent({ userId: user.id, action: 'google_link', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
          logger.info('google_account_linked', { userId: user.id, email });
        } else {
          // Create new user via Google
          const placeholderHash = `google:${crypto.randomBytes(32).toString('hex')}`;
          user = createUser(email, placeholderHash, displayName);
          linkGoogleAccount(user.id, googleId);
          setEmailVerified(user.id); // Google-verified email

          logAuditEvent({ userId: user.id, action: 'google_signup', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
          logger.info('google_user_created', { userId: user.id, email });

          // Credit free trial hours
          creditBillableHours(user.id, config.billableHours.freeTrialHours, 'welcome', 'Welcome to Lavern — free trial hours.');

          // Send welcome email
          sendWelcomeEmail(email, displayName).catch(err => logger.error('welcome_email_failed', err));
        }
      } else {
        // Existing Google user — just log in
        logAuditEvent({ userId: user.id, action: 'google_login', resource: 'auth', ip: request.ip, userAgent: request.headers['user-agent'] });
      }

      // Set auth cookie and redirect to app
      const authToken = createAuthToken(user.id);
      setAuthCookie(reply, authToken);

      return reply.redirect(`${config.email.appUrl}/#/?oauth=success`);
    } catch (err) {
      logger.error('oauth_callback_error', err);
      return reply.redirect(`${config.email.appUrl}/#/login?error=oauth_failed`);
    }
  });
}
