/**
 * x402 Payment Middleware — Protocol stubs for agent micropayments.
 *
 * Implements the x402 protocol (HTTP 402 Payment Required) for USDC on Base.
 * This is the interface only — no actual on-chain verification yet.
 *
 * Flow:
 *   1. Unauthenticated request hits /api/engage without Bearer token
 *   2. If no X-PAYMENT header → 402 with payment requirements
 *   3. If X-PAYMENT header present → stub verification (always returns false for now)
 *
 * Not a global middleware — only wired into the engage route as an alternative auth path.
 *
 * @see https://www.x402.org/
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config.js';
import { INTENSITY_PROFILES } from '../../types/engagement.js';

// ── Types ───────────────────────────────────────────────────────────────

export interface X402PaymentRequirements {
  /** x402 protocol version */
  x402Version: 1;
  /** Accepted payment methods */
  accepts: Array<{
    scheme: 'exact';
    network: 'base';
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra: {
      name: string;
      version: string;
    };
  }>;
}

export interface X402PaymentHeader {
  /** Base64-encoded payment proof */
  payload: string;
  /** Payment network */
  network: string;
}

export interface X402VerificationResult {
  valid: boolean;
  reason?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build x402 payment requirements for a 402 response.
 * Amount is based on the requested intensity tier.
 */
function buildPaymentRequirements(
  request: FastifyRequest,
  intensityLevel?: string,
): X402PaymentRequirements {
  const intensity = intensityLevel ?? 'standard';
  const profile = INTENSITY_PROFILES[intensity as keyof typeof INTENSITY_PROFILES] ?? INTENSITY_PROFILES.standard;
  const maxCostUsd = profile.budgetMultiplier * 10;

  // Convert USD to USDC amount (1:1 peg, 6 decimal places)
  const usdcAmount = (maxCostUsd * 1_000_000).toString();

  return {
    x402Version: 1,
    accepts: [{
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: usdcAmount,
      resource: `${config.baseUrl}/api/engage`,
      description: `Lavern legal analysis — ${profile.label} tier (up to $${maxCostUsd} USDC)`,
      mimeType: 'application/json',
      payTo: config.x402RecipientAddress || '0x0000000000000000000000000000000000000000',
      maxTimeoutSeconds: 300,
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      extra: {
        name: 'Lavern Legal AI',
        version: config.version,
      },
    }],
  };
}

/**
 * Parse the X-PAYMENT header from a request.
 * Returns null if the header is missing or malformed.
 */
function parsePaymentHeader(request: FastifyRequest): X402PaymentHeader | null {
  const header = request.headers['x-payment'];
  if (!header || typeof header !== 'string') return null;

  try {
    // The x402 spec sends the payment proof as a base64-encoded JSON
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (parsed.payload && parsed.network) {
      return parsed as X402PaymentHeader;
    }
    // If it's not structured, treat the raw header as the payload
    return { payload: header, network: 'base' };
  } catch {
    // Raw string — treat as simple payload
    return { payload: header, network: 'base' };
  }
}

/**
 * Stub verification — always returns { valid: false }.
 * When real on-chain verification is integrated, this will check:
 *   1. Payment exists on Base
 *   2. Amount matches requirements
 *   3. Recipient matches config
 *   4. Payment is not already spent
 */
function verifyPayment(_payment: X402PaymentHeader): X402VerificationResult {
  // STUB: On-chain verification not yet implemented.
  // When ready, integrate the Coinbase x402 SDK or Base RPC to:
  //   1. Decode and verify the payment proof on Base
  //   2. Confirm USDC amount matches buildPaymentRequirements()
  //   3. Confirm recipient matches config.x402RecipientAddress
  //   4. Check payment hasn't been double-spent (nonce/idempotency)
  // See: https://www.x402.org/ and https://docs.cdp.coinbase.com/x402
  return {
    valid: false,
    reason: 'On-chain payment verification not yet implemented. Use Bearer token authentication.',
  };
}

// ── Middleware ───────────────────────────────────────────────────────────

/**
 * x402 payment check for the /api/engage route.
 *
 * Call this AFTER auth middleware. If the request is already authenticated
 * via Bearer token, this is a no-op. If not, check for x402 payment.
 *
 * Returns true if the request should proceed, false if a 402 was sent.
 */
export function checkX402Payment(
  request: FastifyRequest,
  reply: FastifyReply,
  isAuthenticated: boolean,
): boolean {
  // If already authenticated via Bearer token, skip payment check
  if (isAuthenticated) return true;

  // If x402 is disabled, skip (auth middleware will handle 401)
  if (!config.x402Enabled) return true;

  // Check for X-PAYMENT header
  const payment = parsePaymentHeader(request);

  if (!payment) {
    // No payment header — return 402 with requirements
    const body = request.body as Record<string, unknown> | undefined;
    const intensity = (body?.constraints as Record<string, unknown>)?.intensity as string | undefined;

    reply.status(402).send(buildPaymentRequirements(request, intensity));
    return false;
  }

  // Payment header present — verify
  const verification = verifyPayment(payment);

  if (!verification.valid) {
    reply.status(402).send({
      error: 'Payment verification failed',
      reason: verification.reason,
      requirements: buildPaymentRequirements(request),
    });
    return false;
  }

  // Payment verified — proceed
  return true;
}
