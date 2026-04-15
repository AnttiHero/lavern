/**
 * Billing Routes — Stripe integration for subscriptions, packs, and usage tracking.
 *
 * POST   /api/billing/checkout          — Create Stripe Checkout session (subscription)
 * POST   /api/billing/checkout-pack     — Create Stripe Checkout session (one-time pack)
 * POST   /api/billing/webhook           — Stripe webhook handler
 * GET    /api/billing/status            — Get current user's billing status
 * GET    /api/billing/usage             — Get current user's monthly usage
 *
 * Plans: starter ($50/mo cap), professional ($200/mo cap), enterprise ($1000/mo cap)
 * Packs: quick (25h/€5), standard (100h/€19), bulk (500h/€89)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';
import { captureError } from '../../utils/sentry.js';
import { parseCookieToken } from '../middleware/auth.js';
import {
  getUserByToken,
  getUserById,
  getUserPlan,
  setUserPlan,
  setUserStripeCustomer,
  recordBillingEvent,
  isStripeEventProcessed,
  getUserMonthlyUsage,
  getUserBillableHours,
  creditBillableHours,
  getDb,
} from '../../db/database.js';
import { sendPaymentReceiptEmail } from '../../email/send.js';

// ── Schemas ───────────────────────────────────────────────────────────
const PackIntentSchema = z.object({ pack: z.enum(['quick', 'standard', 'bulk']) }).strict();
const CheckoutSchema = z.object({ plan: z.enum(['starter', 'professional', 'enterprise']) }).strict();
const CheckoutPackSchema = z.object({ pack: z.enum(['quick', 'standard', 'bulk']) }).strict();

const log = createLogger('BILLING');

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

/** Minimum viable session budget in USD — below this the session won't produce useful output. */
const MIN_SESSION_BUDGET_USD = 0.50;

/** Check if user can start a new session (under monthly cap or has billable hours). */
export function canStartSession(userId: string): { allowed: boolean; reason?: string; remainingBudget: number; remainingHours: number } {
  const balance = getUserBillableHours(userId);

  // If user has billable hours entries, use hours-based enforcement
  if (balance > 0) {
    const rate = config.billableHours.rate;
    const remainingBudget = balance * rate;
    if (remainingBudget < MIN_SESSION_BUDGET_USD) {
      return { allowed: false, reason: `Remaining balance (${balance.toFixed(1)}h / $${remainingBudget.toFixed(2)}) is too low for a session. Top up your billable hours to continue.`, remainingBudget, remainingHours: balance };
    }
    return { allowed: true, remainingBudget, remainingHours: balance };
  }

  // Fallback: legacy USD-based enforcement for pre-existing users without hours
  const planInfo = getUserPlan(userId);
  const plan = planInfo?.plan ?? 'free';
  const limits = getPlanLimits(plan);
  const usage = getUserMonthlyUsage(userId);

  if (plan !== 'free' && planInfo?.plan_expires_at) {
    if (new Date(planInfo.plan_expires_at) < new Date()) {
      const freeLimits = getPlanLimits('free');
      const remaining = freeLimits.monthlyCapUsd - usage.total_cost_usd;
      if (remaining <= 0) {
        return { allowed: false, reason: 'Plan expired and free tier budget exceeded', remainingBudget: 0, remainingHours: 0 };
      }
      return { allowed: true, remainingBudget: remaining, remainingHours: remaining / config.billableHours.rate };
    }
  }

  const remaining = limits.monthlyCapUsd - usage.total_cost_usd;
  if (remaining <= 0 || remaining < MIN_SESSION_BUDGET_USD) {
    return { allowed: false, reason: 'No billable hours remaining. Purchase more or upgrade your plan.', remainingBudget: Math.max(0, remaining), remainingHours: Math.max(0, remaining) / config.billableHours.rate };
  }

  return { allowed: true, remainingBudget: remaining, remainingHours: remaining / config.billableHours.rate };
}

// ── Routes ──────────────────────────────────────────────────────────────

export function registerBillingRoutes(fastify: FastifyInstance): void {

  // ── GET /api/billing/stripe-config ─────────────────────────────────
  // Public — returns Stripe publishable key for frontend initialization.
  fastify.get('/api/billing/stripe-config', async (_request, reply) => {
    return reply.send({
      publishableKey: config.stripe.publishableKey || null,
    });
  });

  // ── POST /api/billing/pack-intent ──────────────────────────────────
  // Creates a Stripe PaymentIntent for Apple Pay / Google Pay inline payments.
  fastify.post('/api/billing/pack-intent', {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const parsed = PackIntentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid pack. Choose: quick, standard, bulk' });
    }
    const { pack } = parsed.data;
    const packDef = config.billableHours.packs[pack];

    if (!config.stripe.secretKey) {
      return reply.status(503).send({ error: 'Billing not configured. Set STRIPE_SECRET_KEY.' });
    }

    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(config.stripe.secretKey);

      const intent = await stripe.paymentIntents.create({
        amount: packDef.priceEurCents,
        currency: 'eur',
        metadata: { userId: user.id, type: 'pack', pack, hours: String(packDef.hours) },
        automatic_payment_methods: { enabled: true },
      });

      return reply.send({ clientSecret: intent.client_secret });
    } catch (err) {
      log.error('PaymentIntent creation failed', err);
      return reply.status(500).send({ error: 'Failed to create payment intent' });
    }
  });

  // ── POST /api/billing/checkout ──────────────────────────────────────
  // Creates a Stripe Checkout Session for a plan subscription.
  fastify.post('/api/billing/checkout', {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const parsed = CheckoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid plan. Choose: starter, professional, enterprise' });
    }
    const { plan } = parsed.data;

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
              name: `Lavern ${getPlanLimits(plan).label}`,
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
      log.error('Stripe checkout session creation failed', err);
      return reply.status(500).send({ error: 'Failed to create checkout session' });
    }
  });

  // ── POST /api/billing/checkout-pack ──────────────────────────────────
  // Creates a Stripe Checkout Session for a one-time hour pack purchase.
  fastify.post('/api/billing/checkout-pack', {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const parsed = CheckoutPackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid pack. Choose: quick, standard, bulk' });
    }
    const { pack } = parsed.data;
    const packDef = config.billableHours.packs[pack];

    if (!config.stripe.secretKey) {
      return reply.status(503).send({ error: 'Billing not configured. Set STRIPE_SECRET_KEY.' });
    }

    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(config.stripe.secretKey);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Lavern ${packDef.label} — ${packDef.hours} Billable Hours`,
              description: `${packDef.hours} billable hours. Never expires.`,
            },
            unit_amount: packDef.priceEurCents,
          },
          quantity: 1,
        }],
        metadata: { userId: user.id, type: 'pack', pack, hours: String(packDef.hours) },
        success_url: config.stripe.successUrl,
        cancel_url: config.stripe.cancelUrl,
      });

      return reply.send({ checkoutUrl: session.url, sessionId: session.id });
    } catch (err) {
      log.error('Stripe pack checkout creation failed', err);
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

      // Verify webhook signature — uses raw body captured by preParsing hook in server.ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rawBody added via decorateRequest in server.ts
      const rawBody = (request as any).rawBody as string | undefined;
      if (!rawBody) {
        return reply.status(400).send({ error: 'Raw body not available for signature verification' });
      }
      const event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);

      // Idempotency — Stripe retries on transient failures. Without this check
      // a retry storm could send duplicate receipt emails even though the credit
      // grant itself is reference-id idempotent.
      if (isStripeEventProcessed(event.id)) {
        log.info('stripe_webhook_duplicate_ignored', { eventId: event.id, type: event.type });
        return reply.send({ received: true, duplicate: true });
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as { metadata?: { userId?: string; plan?: string; type?: string; pack?: string; hours?: string }; customer?: string; subscription?: string };
          const userId = session.metadata?.userId;

          // ── Pack purchase (one-time payment) ───────────────────────
          if (session.metadata?.type === 'pack' && userId) {
            const hours = parseInt(session.metadata.hours ?? '0', 10);
            const packName = session.metadata.pack ?? 'unknown';
            if (hours > 0) {
              creditBillableHours(
                userId,
                hours,
                'purchase',
                `Purchased ${packName} pack — ${hours} billable hours`,
                undefined,
                event.id,
              );
              recordBillingEvent({
                id: `bill-${crypto.randomUUID()}`,
                userId,
                type: 'pack_purchased',
                stripeSessionId: event.id,
                metadata: { pack: packName, hours },
              });
              log.info(`User ${userId} purchased ${hours}h (${packName} pack)`);
              // v23: Send payment receipt email
              const packUser = getUserById(userId);
              if (packUser) {
                const packDef = config.billableHours.packs[packName as keyof typeof config.billableHours.packs];
                const newBalance = getUserBillableHours(userId);
                sendPaymentReceiptEmail(packUser.email, {
                  type: 'pack', packName, hours,
                  amountLabel: packDef ? `€${(packDef.priceEurCents / 100).toFixed(0)}` : `Pack`,
                  newBalance,
                }).catch(err => log.error('receipt_email_failed', err));
              }
            }
            break;
          }

          // ── Subscription checkout ──────────────────────────────────
          const plan = session.metadata?.plan;
          if (userId && plan) {
            // Set plan (expires in 35 days — gives buffer for failed renewals)
            const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
            setUserPlan(userId, plan, expiresAt);

            if (session.customer) {
              setUserStripeCustomer(userId, session.customer as string);
            }

            recordBillingEvent({
              id: `bill-${crypto.randomUUID()}`,
              userId,
              type: 'checkout_completed',
              stripeSessionId: event.id,
              plan,
              metadata: { subscription: session.subscription },
            });

            log.info(`User ${userId} upgraded to ${plan}`);
            // v23: Send receipt email for subscription
            const subUser = getUserById(userId);
            if (subUser) {
              const planDef = config.stripe.plans[plan as keyof typeof config.stripe.plans];
              sendPaymentReceiptEmail(subUser.email, {
                type: 'subscription', plan: planDef?.label ?? plan,
                amountLabel: `${planDef?.label ?? plan} Plan`,
              }).catch(err => log.error('receipt_email_failed', err));
            }
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
              id: `bill-${crypto.randomUUID()}`,
              userId,
              type: 'subscription_cancelled',
            });
            log.info(`User ${userId} subscription cancelled — downgraded to free`);
          }
          break;
        }
        case 'payment_intent.succeeded': {
          // Apple Pay / Google Pay inline pack purchase
          const pi = event.data.object as { metadata?: { userId?: string; type?: string; pack?: string; hours?: string } };
          const piUserId = pi.metadata?.userId;
          if (pi.metadata?.type === 'pack' && piUserId) {
            const hours = parseInt(pi.metadata.hours ?? '0', 10);
            const packName = pi.metadata.pack ?? 'unknown';
            if (hours > 0) {
              creditBillableHours(
                piUserId,
                hours,
                'purchase',
                `Purchased ${packName} pack — ${hours} billable hours (Apple Pay)`,
                undefined,
                event.id,
              );
              recordBillingEvent({
                id: `bill-${crypto.randomUUID()}`,
                userId: piUserId,
                type: 'pack_purchased',
                stripeSessionId: event.id,
                metadata: { pack: packName, hours, method: 'payment_intent' },
              });
              log.info(`User ${piUserId} purchased ${hours}h via Apple Pay (${packName} pack)`);
              // v23: Send receipt email
              const piUser = getUserById(piUserId);
              if (piUser) {
                const piPackDef = config.billableHours.packs[packName as keyof typeof config.billableHours.packs];
                const piBalance = getUserBillableHours(piUserId);
                sendPaymentReceiptEmail(piUser.email, {
                  type: 'pack', packName, hours,
                  amountLabel: piPackDef ? `€${(piPackDef.priceEurCents / 100).toFixed(0)}` : `Pack`,
                  newBalance: piBalance,
                }).catch(err => log.error('receipt_email_failed', err));
              }
            }
          }
          break;
        }
      }

      return reply.send({ received: true });
    } catch (err) {
      log.error('Webhook verification failed', err);
      // Sentry: a persistent stream of failures here means our webhook-signing
      // secret drifted from Stripe's, or the raw-body capture hook is broken —
      // both stall pack purchases + subscription upgrades silently. Stripe will
      // retry for up to 3 days, so we'd rather get paged on the first one than
      // find out from a support ticket.
      captureError(err, { route: '/api/billing/webhook', phase: 'signature_verification' });
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

    const billableBalance = getUserBillableHours(user.id);

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
      billableHours: {
        balance: Math.round(billableBalance * 10) / 10,
        rate: config.billableHours.rate,
        balanceUsd: Math.round(billableBalance * config.billableHours.rate * 100) / 100,
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

  // ── GET /api/billing/analytics ────────────────────────────────────────
  // Returns 8-week engagement history, spend trend, workflow breakdown, hours burn-down.
  fastify.get('/api/billing/analytics', async (request, reply) => {
    const user = getAuthenticatedUser(request, reply);
    if (!user) return;

    const db = getDb();
    const now = new Date();

    // 8-week history from session_archive
    const weeks: Array<{ week: string; engagements: number; costUsd: number }> = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const label = weekStart.toISOString().slice(0, 10);

      const row = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(cost_usd), 0) as cost
        FROM session_archive
        WHERE user_id = ? AND created_at >= ? AND created_at < ?
      `).get(user.id, weekStart.toISOString(), weekEnd.toISOString()) as { cnt: number; cost: number };

      weeks.push({ week: label, engagements: row.cnt, costUsd: Math.round(row.cost * 100) / 100 });
    }

    // Workflow breakdown
    const workflowRows = db.prepare(`
      SELECT workflow_id, COUNT(*) as cnt FROM session_archive
      WHERE user_id = ? AND workflow_id IS NOT NULL
      GROUP BY workflow_id ORDER BY cnt DESC
    `).all(user.id) as Array<{ workflow_id: string; cnt: number }>;

    // Average session cost
    const avgRow = db.prepare(`
      SELECT AVG(cost_usd) as avg_cost, COUNT(*) as total FROM session_archive WHERE user_id = ?
    `).get(user.id) as { avg_cost: number | null; total: number };

    // Current balance
    const balance = getUserBillableHours(user.id);

    return reply.send({
      weeks,
      workflows: workflowRows.map(r => ({ workflowId: r.workflow_id, count: r.cnt })),
      avgSessionCost: avgRow.avg_cost ? Math.round(avgRow.avg_cost * 100) / 100 : 0,
      totalEngagements: avgRow.total,
      hoursRemaining: Math.round(balance * 10) / 10,
    });
  });
}
