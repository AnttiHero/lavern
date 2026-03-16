/**
 * Unit Tests — Mistral Cost Estimation (src/providers/mistral.ts)
 *
 * Tests the cost estimation function used for billing Mistral API calls.
 * Wrong cost estimates = wrong billing = unhappy users.
 */

import { describe, it, expect } from 'vitest';
import { estimateMistralCost, MISTRAL_PRICING } from '../../src/providers/mistral.js';

describe('estimateMistralCost', () => {
  it('calculates correct cost for known models', () => {
    // mistral-large-latest: $2/M input, $6/M output
    const cost = estimateMistralCost(1000, 500, 'mistral-large-latest');
    expect(cost).toBeCloseTo(0.002 + 0.003, 6); // $0.005
  });

  it('calculates correct cost for small model', () => {
    // mistral-small-latest: $0.1/M input, $0.3/M output
    const cost = estimateMistralCost(10000, 5000, 'mistral-small-latest');
    expect(cost).toBeCloseTo(0.001 + 0.0015, 6); // $0.0025
  });

  it('uses default pricing for unknown models', () => {
    // Default: $2/M input, $6/M output (same as large)
    const cost = estimateMistralCost(1000000, 500000, 'unknown-model-v42');
    expect(cost).toBeCloseTo(2.0 + 3.0, 2); // $5.00
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateMistralCost(0, 0, 'mistral-large-latest')).toBe(0);
  });

  it('handles input-only cost', () => {
    const cost = estimateMistralCost(1000000, 0, 'mistral-large-latest');
    expect(cost).toBeCloseTo(2.0, 4); // $2/M * 1M tokens
  });

  it('handles output-only cost', () => {
    const cost = estimateMistralCost(0, 1000000, 'mistral-large-latest');
    expect(cost).toBeCloseTo(6.0, 4); // $6/M * 1M tokens
  });
});

describe('MISTRAL_PRICING', () => {
  it('has pricing for expected models', () => {
    expect(MISTRAL_PRICING['mistral-large-latest']).toBeDefined();
    expect(MISTRAL_PRICING['mistral-medium-latest']).toBeDefined();
    expect(MISTRAL_PRICING['mistral-small-latest']).toBeDefined();
  });

  it('has both input and output prices', () => {
    for (const [model, pricing] of Object.entries(MISTRAL_PRICING)) {
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThanOrEqual(pricing.input); // Output is typically more expensive
    }
  });
});
