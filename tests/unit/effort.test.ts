/**
 * Effort — Tests for intensity → effort mapping.
 *
 * Verifies the mapping between engagement intensity levels and
 * Claude API effort parameters.
 */

import { describe, it, expect } from 'vitest';
import {
  INTENSITY_PROFILES,
  effortForIntensity,
  type IntensityLevel,
  type EffortLevel,
} from '../../src/types/engagement.js';

describe('effort mapping', () => {
  it('quick intensity maps to low effort', () => {
    expect(effortForIntensity('quick')).toBe('low');
    expect(INTENSITY_PROFILES.quick.effort).toBe('low');
  });

  it('standard intensity maps to medium effort', () => {
    expect(effortForIntensity('standard')).toBe('medium');
    expect(INTENSITY_PROFILES.standard.effort).toBe('medium');
  });

  it('thorough intensity maps to high effort', () => {
    expect(effortForIntensity('thorough')).toBe('high');
    expect(INTENSITY_PROFILES.thorough.effort).toBe('high');
  });

  it('maximal intensity maps to max effort (white-shoe)', () => {
    expect(effortForIntensity('maximal')).toBe('max');
    expect(INTENSITY_PROFILES.maximal.effort).toBe('max');
  });

  it('all intensity levels have an effort field', () => {
    const levels: IntensityLevel[] = ['quick', 'standard', 'thorough', 'maximal'];
    const validEfforts: EffortLevel[] = ['low', 'medium', 'high', 'max'];
    for (const level of levels) {
      expect(validEfforts).toContain(INTENSITY_PROFILES[level].effort);
    }
  });

  it('effort levels increase with intensity', () => {
    const effortOrder: EffortLevel[] = ['low', 'medium', 'high', 'max'];
    const intensityOrder: IntensityLevel[] = ['quick', 'standard', 'thorough', 'maximal'];

    for (let i = 0; i < intensityOrder.length - 1; i++) {
      const currentEffort = effortForIntensity(intensityOrder[i]);
      const nextEffort = effortForIntensity(intensityOrder[i + 1]);
      expect(effortOrder.indexOf(nextEffort)).toBeGreaterThan(
        effortOrder.indexOf(currentEffort),
      );
    }
  });
});
