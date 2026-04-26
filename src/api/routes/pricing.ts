/**
 * Pricing Routes — Deterministic cost estimates for agent budgeting.
 *
 * GET /api/pricing — Returns per-intensity tier breakdown, per-model
 * token rates, and accepted payment methods. Agents use this to budget
 * before committing to an engagement.
 *
 * Query params (all optional, for filtering):
 *   ?intensity=maximal   — return only that tier
 *   ?workflow=counsel     — include workflow-specific notes
 *   ?teamSize=6           — estimate cost for a specific team size
 *
 * Public endpoint — no authentication required.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { INTENSITY_PROFILES, type IntensityLevel } from '../../types/engagement.js';
import { PRICING } from '../../utils/stream-messages.js';
import { config } from '../../config.js';

// ── Types ───────────────────────────────────────────────────────────────

interface PricingTier {
  level: IntensityLevel;
  label: string;
  description: string;
  suggestedTeamSize: number;
  estimatedCostUsd: { min: number; max: number };
  estimatedMinutes: [number, number];
  gateFrequency: string;
  budgetMultiplier: number;
}

interface TokenRate {
  model: string;
  tier: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
}

interface PricingResponse {
  currency: string;
  model: string;
  tiers: PricingTier[];
  tokenRates: TokenRate[];
  paymentMethods: Array<{
    method: string;
    status: 'active' | 'coming_soon';
    description: string;
  }>;
  budgetEnforcement: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const COST_RANGES: Record<IntensityLevel, { min: number; max: number }> = {
  quick:    { min: 0.50, max: 3.00 },
  standard: { min: 2.00, max: 10.00 },
  thorough: { min: 5.00, max: 20.00 },
  maximal:  { min: 15.00, max: 40.00 },
};

function buildTier(level: IntensityLevel): PricingTier {
  const profile = INTENSITY_PROFILES[level];
  return {
    level,
    label: profile.label,
    description: profile.description,
    suggestedTeamSize: profile.suggestedTeamSize,
    estimatedCostUsd: COST_RANGES[level],
    estimatedMinutes: profile.estimatedMinutes,
    gateFrequency: profile.gateFrequency,
    budgetMultiplier: profile.budgetMultiplier,
  };
}

function buildTokenRates(): TokenRate[] {
  return [
    {
      model: 'claude-opus-4-7',
      tier: 'Partner / Senior',
      ...PRICING['claude-opus-4-7'],
      inputPerMillion: PRICING['claude-opus-4-7'].input,
      outputPerMillion: PRICING['claude-opus-4-7'].output,
      cacheReadPerMillion: PRICING['claude-opus-4-7'].cacheRead,
      cacheWritePerMillion: PRICING['claude-opus-4-7'].cacheWrite,
    },
    {
      model: 'claude-sonnet-4-5',
      tier: 'Associate / Specialist',
      ...PRICING['claude-sonnet-4-5'],
      inputPerMillion: PRICING['claude-sonnet-4-5'].input,
      outputPerMillion: PRICING['claude-sonnet-4-5'].output,
      cacheReadPerMillion: PRICING['claude-sonnet-4-5'].cacheRead,
      cacheWritePerMillion: PRICING['claude-sonnet-4-5'].cacheWrite,
    },
    {
      model: 'claude-haiku-4-5',
      tier: 'Junior / Paralegal',
      ...PRICING['claude-haiku-4-5'],
      inputPerMillion: PRICING['claude-haiku-4-5'].input,
      outputPerMillion: PRICING['claude-haiku-4-5'].output,
      cacheReadPerMillion: PRICING['claude-haiku-4-5'].cacheRead,
      cacheWritePerMillion: PRICING['claude-haiku-4-5'].cacheWrite,
    },
  ];
}

// ── Route Registration ──────────────────────────────────────────────────

export function registerPricingRoutes(fastify: FastifyInstance): void {

  fastify.get('/api/pricing', async (request: FastifyRequest, reply) => {
    const query = request.query as {
      intensity?: string;
      workflow?: string;
      teamSize?: string;
    };

    // Build tiers — filter if requested
    const allLevels: IntensityLevel[] = ['quick', 'standard', 'thorough', 'maximal'];
    let tiers: PricingTier[];

    if (query.intensity && allLevels.includes(query.intensity as IntensityLevel)) {
      tiers = [buildTier(query.intensity as IntensityLevel)];
    } else {
      tiers = allLevels.map(buildTier);
    }

    const response: PricingResponse = {
      currency: 'USD',
      model: 'usage-based',
      tiers,
      tokenRates: buildTokenRates(),
      paymentMethods: [
        {
          method: 'api_key_billing',
          status: 'active',
          description: 'Register for an API key at POST /api/clients. Usage tracked per engagement. Budget cap enforced per session.',
        },
        {
          method: 'x402_usdc_base',
          status: config.x402Enabled ? 'active' : 'coming_soon',
          description: 'Pay per request with USDC on Base via x402 protocol. No account needed — include X-PAYMENT header.',
        },
      ],
      budgetEnforcement: 'Hard cap. Session halts if budget is exceeded. Unused budget is not charged.',
    };

    return reply
      .header('Cache-Control', 'public, max-age=300')
      .send(response);
  });
}
