/**
 * Billing Routes — Stripe integration for subscriptions and usage tracking.
 *
 * POST   /api/billing/checkout          — Create Stripe Checkout session
 * POST   /api/billing/webhook           — Stripe webhook handler
 * GET    /api/billing/status            — Get current user's billing status
 * GET    /api/billing/usage             — Get current user's monthly usage
 *
 * Plans: starter ($50/mo cap), professional ($200/mo cap), enterprise ($1000/mo cap)
 * Free tier: 3 engagements/month, $5 budget per session
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'node:crypto';
import { config } from '../../config.js';
import { parseCookieToken } from '../middleware/auth.js';
import {
  getUserByToken,
  getUserPlan,
  setUserPlan,
  setUserStripeCustomer,
  recordBillingEvent,
  getUserMonthlyUsage,
} from '../../db/database.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply): { id: string; email: string } | null {
  const token = parseCookieToken(request.headers.cookie);
  if (!token) {
    reply.status(401).send({ error: 'Authentication required' });
    return null;
  }
  const user = getUserByToken(token);
  if (!user) {
    reply.status(401).send({ error: 'Session expired' });
    return null;
  }
  return { id: user.id, email: user.email };
}

/** Get plan limits (monthly cap, per-session budget). */
export function getPlanLimits(plan: string): { monthlyCapUsd: number; maxSessionBudget: number; label: string } {
  const plans = config.stripe.plans as Record<string, { monthlyCapUsd: number; maxSessionBudget: number; label: string }>;
  if (plan in plans) return plans[plan];
  // Free tier defaults
  return { monthlyCapUsd: 15, maxSessionBudget: 5, label: 'Free' };
}

/** Check if user can start a new session (under monthly cap). */
export function canStartSession(userId: string): { allowed: boolean; reason?: string; remainingBudget: number } {
  const planInfo = getUserPlan(userId);
  const plan = planInfo?.plan ?? 'free';
  const limits = getPlanLimits(plan);
  const usage = getUserMonthlyUsage(userId);

  // Check plan expiry
  if (plan !== 'free' && planInfo?.plan_expires_at) {
    if (new Date(planInfo.plan_expires_at) < new Date()) {
      // Plan expired — treat as free
      const freeLimits = getPlanLimits('free');
      const remaining = freeLimits.monthlyCapUsd - usage.total_cost_usd;
      if (remaining <= 0) {
        return { allowed: false, reason: 'Plan expired and free tier budget exceeded', remainingBudget: 0 };
      }
      return { allowed: true, remainingBudget: remaining };
    }
  }

  const remaining = limits.monthlyCapUsd - usage.total_cost_usd;
  if (remaining <= 0) {
    return { allowed: false, reason: `Monthly budget of $${limits.monthlyCapUsd} exceeded`, remainingBudget: 0 };
  }

  return { allowed: true, remainingBudget: remaining };
}

// ── Routes ──────────────────────────────────────────────────────────────

export function registerBillingRoutes(fastify: FastifyInstance): void {

  // ── POST /api/billing/checkout ──────────────────────────────────────
  // Creates a Stripe Checkout Session for a plan subscription.
  fastify.post('/api/billing/checkout', async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const { plan } = request.body as { plan?: string } || {};
    if (!plan || !['starter', 'professional', 'enterprise'].includes(plan)) {
      return reply.status(400).send({ error: 'Invalid plan. Choose: starter, professional, enterprise' });
    }

    if (!config.stripe.secretKey) {
      return reply.status(503).send({ error: 'Billing not configured. Set STRIPE_SECRET_KEY.' });
    }

    try {
      // Dynamic import — only load Stripe when actually needed
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(config.stripe.secretKey);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: user.email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Marble ${getPlanLimits(plan).label}`,
              description: `Up to $${getPlanLimits(plan).monthlyCapUsd}/mo in AI analysis`,
            },
            unit_amount: plan === 'starter' ? 4900 : plan === 'professional' ? 14900 : 49900,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        metadata: { userId: user.id, plan },
        success_url: config.stripe.successUrl,
        cancel_url: config.stripe.cancelUrl,
      });

      return reply.send({ checkoutUrl: session.url, sessionId: session.id });
    } catch (err) {
      console.error('[BILLING] Stripe checkout error:', err);
      return reply.status(500).send({ error: 'Failed to create checkout session' });
    }
  });

  // ── POST /api/billing/webhook ───────────────────────────────────────
  // Stripe webhook — processes checkout.session.completed events.
  // This must be public (Stripe calls it), but verified via webhook signature.
  fastify.post('/api/billing/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    if (!config.stripe.secretKey || !config.stripe.webhookSecret) {
      return reply.status(503).send({ error: 'Billing webhooks not configured' });
    }

    const sig = request.headers['stripe-signature'] as string;
    if (!sig) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }

    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(config.stripe.secretKey);

      // Verify webhook signature
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as { metadata?: { userId?: string; plan?: string }; customer?: string; subscription?: string };
          const userId = session.metadata?.userId;
          const plan = session.metadata?.plan;

          if (userId && plan) {
            // Set plan (expires in 35 days — gives buffer for failed renewals)
            const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
            setUserPlan(userId, plan, expiresAt);

            if (session.customer) {
              setUserStripeCustomer(userId, session.customer as string);
            }

            recordBillingEvent({
              id: `bill-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              userId,
              type: 'checkout_completed',
              stripeSessionId: event.id,
              plan,
              metadata: { subscription: session.subscription },
            });

            console.log(`[BILLING] User ${userId} upgraded to ${plan}`);
          }
          break;
        }
        case 'customer.subscription.deleted': {
          // Subscription cancelled — downgrade to free
          const sub = event.data.object as { metadata?: { userId?: string } };
          const userId = sub.metadata?.userId;
          if (userId) {
            setUserPlan(userId, 'free');
            recordBillingEvent({
              id: `bill-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              userId,
              type: 'subscription_cancelled',
            });
            console.log(`[BILLING] User ${userId} subscription cancelled — downgraded to free`);
          }
          break;
        }
      }

      return reply.send({ received: true });
    } catch (err) {
      console.error('[BILLING] Webhook error:', err);
      return reply.status(400).send({ error: 'Webhook verification failed' });
    }
  });

  // ── GET /api/billing/status ─────────────────────────────────────────
  fastify.get('/api/billing/status', async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const planInfo = getUserPlan(user.id);
    const plan = planInfo?.plan ?? 'free';
    const limits = getPlanLimits(plan);
    const usage = getUserMonthlyUsage(user.id);

    const isExpired = plan !== 'free' && planInfo?.plan_expires_at
      ? new Date(planInfo.plan_expires_at) < new Date()
      : false;

    return reply.send({
      plan: isExpired ? 'free' : plan,
      planLabel: isExpired ? 'Free' : limits.label,
      monthlyCapUsd: isExpired ? getPlanLimits('free').monthlyCapUsd : limits.monthlyCapUsd,
      maxSessionBudget: isExpired ? getPlanLimits('free').maxSessionBudget : limits.maxSessionBudget,
      usage: {
        totalCostUsd: Math.round(usage.total_cost_usd * 100) / 100,
        engagementCount: usage.engagement_count,
        remainingBudget: Math.max(0, Math.round((limits.monthlyCapUsd - usage.total_cost_usd) * 100) / 100),
      },
      expiresAt: planInfo?.plan_expires_at ?? null,
      isExpired,
      stripeConfigured: !!config.stripe.secretKey,
    });
  });

  // ── GET /api/billing/usage ──────────────────────────────────────────
  fastify.get('/api/billing/usage', async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const usage = getUserMonthlyUsage(user.id);
    const planInfo = getUserPlan(user.id);
    const limits = getPlanLimits(planInfo?.plan ?? 'free');

    return reply.send({
      month: new Date().toISOString().slice(0, 7),
      totalCostUsd: Math.round(usage.total_cost_usd * 100) / 100,
      engagementCount: usage.engagement_count,
      monthlyCapUsd: limits.monthlyCapUsd,
      remainingBudget: Math.max(0, Math.round((limits.monthlyCapUsd - usage.total_cost_usd) * 100) / 100),
    });
  });
}
