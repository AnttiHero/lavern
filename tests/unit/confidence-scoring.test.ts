/**
 * Unit tests for confidence scoring and tiered routing.
 *
 * Tests operational confidence scoring: weighted confidence computation,
 * tier classification, routing logic.
 */

import { describe, it, expect } from 'vitest';
import {
  computeOverallConfidence,
  getConfidenceTier,
  type ConfidenceSignals,
} from '../../src/types/index.js';

describe('Confidence Scoring', () => {
  describe('computeOverallConfidence', () => {
    it('should return 1.0 for perfect signals', () => {
      const signals: ConfidenceSignals = {
        retrievalQuality: 1.0,
        sourceAgreement: 1.0,
        validationSuccess: 1.0,
        toolReliability: 1.0,
        selfConsistency: 1.0,
      };
      expect(computeOverallConfidence(signals)).toBe(1.0);
    });

    it('should return 0.0 for zero signals', () => {
      const signals: ConfidenceSignals = {
        retrievalQuality: 0,
        sourceAgreement: 0,
        validationSuccess: 0,
        toolReliability: 0,
        selfConsistency: 0,
      };
      expect(computeOverallConfidence(signals)).toBe(0);
    });

    it('should weight sourceAgreement and validationSuccess highest', () => {
      // Only sourceAgreement and validationSuccess are non-zero
      const signalsA: ConfidenceSignals = {
        retrievalQuality: 0,
        sourceAgreement: 1.0,
        validationSuccess: 1.0,
        toolReliability: 0,
        selfConsistency: 0,
      };
      // Only retrievalQuality, toolReliability, selfConsistency are non-zero
      const signalsB: ConfidenceSignals = {
        retrievalQuality: 1.0,
        sourceAgreement: 0,
        validationSuccess: 0,
        toolReliability: 1.0,
        selfConsistency: 1.0,
      };

      const confA = computeOverallConfidence(signalsA);
      const confB = computeOverallConfidence(signalsB);

      // Weights: sourceAgreement (0.25) + validationSuccess (0.25) = 0.50
      // vs retrievalQuality (0.20) + toolReliability (0.15) + selfConsistency (0.15) = 0.50
      expect(confA).toBe(0.50);
      expect(confB).toBe(0.50);
    });

    it('should produce values between 0 and 1', () => {
      const signals: ConfidenceSignals = {
        retrievalQuality: 0.7,
        sourceAgreement: 0.8,
        validationSuccess: 0.6,
        toolReliability: 0.9,
        selfConsistency: 0.75,
      };
      const result = computeOverallConfidence(signals);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('getConfidenceTier', () => {
    it('should return "high" for confidence > 0.90', () => {
      expect(getConfidenceTier(0.95)).toBe('high');
      expect(getConfidenceTier(0.91)).toBe('high');
      expect(getConfidenceTier(1.0)).toBe('high');
    });

    it('should return "medium" for confidence 0.70-0.90', () => {
      expect(getConfidenceTier(0.90)).toBe('medium');
      expect(getConfidenceTier(0.80)).toBe('medium');
      expect(getConfidenceTier(0.70)).toBe('medium');
    });

    it('should return "low" for confidence < 0.70', () => {
      expect(getConfidenceTier(0.69)).toBe('low');
      expect(getConfidenceTier(0.5)).toBe('low');
      expect(getConfidenceTier(0.0)).toBe('low');
    });

    it('should correctly route high confidence to auto-approve', () => {
      const tier = getConfidenceTier(0.95);
      expect(tier).toBe('high');
      // In the real system: auto-approve with audit note
    });

    it('should correctly route low confidence to full human review', () => {
      const tier = getConfidenceTier(0.45);
      expect(tier).toBe('low');
      // In the real system: full human review with context + precedent
    });
  });

  describe('Confidence Routing Integration', () => {
    it('should produce different tiers for different signal qualities', () => {
      const highQuality: ConfidenceSignals = {
        retrievalQuality: 0.95,
        sourceAgreement: 0.98,
        validationSuccess: 0.97,
        toolReliability: 0.99,
        selfConsistency: 0.96,
      };
      const lowQuality: ConfidenceSignals = {
        retrievalQuality: 0.3,
        sourceAgreement: 0.4,
        validationSuccess: 0.35,
        toolReliability: 0.5,
        selfConsistency: 0.2,
      };

      const highTier = getConfidenceTier(computeOverallConfidence(highQuality));
      const lowTier = getConfidenceTier(computeOverallConfidence(lowQuality));

      expect(highTier).toBe('high');
      expect(lowTier).toBe('low');
    });
  });
});
