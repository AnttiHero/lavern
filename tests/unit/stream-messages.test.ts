/**
 * Unit Tests — Stream Messages (src/utils/stream-messages.ts)
 *
 * Tests the PRICING table and cost estimation logic.
 * The streamMessages function itself is integration-tested.
 */

import { describe, it, expect } from 'vitest';
import { PRICING } from '../../src/utils/stream-messages.js';

describe('PRICING table', () => {
  it('has entries for all current Claude models', () => {
    expect(PRICING['claude-opus-4-7']).toBeDefined();
    expect(PRICING['claude-sonnet-4-5']).toBeDefined();
    expect(PRICING['claude-haiku-4-5']).toBeDefined();
  });

  it('has legacy entries for in-flight sessions + archived cost records', () => {
    expect(PRICING['claude-opus-4-6']).toBeDefined();
    expect(PRICING['claude-sonnet-4-5-20250929']).toBeDefined();
    expect(PRICING['claude-haiku-3-5-20250929']).toBeDefined();
  });

  it('has entries for Mistral models', () => {
    expect(PRICING['mistral-large-latest']).toBeDefined();
    expect(PRICING['mistral-medium-latest']).toBeDefined();
    expect(PRICING['mistral-small-latest']).toBeDefined();
  });

  it('has correct fields for each model', () => {
    for (const [model, prices] of Object.entries(PRICING)) {
      expect(prices.input).toBeGreaterThan(0);
      expect(prices.output).toBeGreaterThan(0);
      expect(typeof prices.cacheRead).toBe('number');
      expect(typeof prices.cacheWrite).toBe('number');
    }
  });

  it('Opus is more expensive than Sonnet', () => {
    const opus = PRICING['claude-opus-4-7'];
    const sonnet = PRICING['claude-sonnet-4-5'];
    expect(opus.input).toBeGreaterThan(sonnet.input);
    expect(opus.output).toBeGreaterThan(sonnet.output);
  });

  it('Sonnet is more expensive than Haiku', () => {
    const sonnet = PRICING['claude-sonnet-4-5'];
    const haiku = PRICING['claude-haiku-4-5'];
    expect(sonnet.input).toBeGreaterThan(haiku.input);
    expect(sonnet.output).toBeGreaterThan(haiku.output);
  });

  it('Mistral models have zero cache pricing', () => {
    for (const model of ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest']) {
      expect(PRICING[model].cacheRead).toBe(0);
      expect(PRICING[model].cacheWrite).toBe(0);
    }
  });

  it('all prices are per million tokens', () => {
    // Sanity check: Opus output should be $75/M tokens
    expect(PRICING['claude-opus-4-7'].output).toBe(75.0);
    // Sonnet input should be $3/M tokens
    expect(PRICING['claude-sonnet-4-5'].input).toBe(3.0);
  });
});
