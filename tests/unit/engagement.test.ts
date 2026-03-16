/**
 * Unit Tests — Engagement Types (src/types/engagement.ts)
 *
 * Tests intensity profiles, budget calculation, and effort mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  INTENSITY_PROFILES,
  defaultBudgetForIntensity,
  effortForIntensity,
  type IntensityLevel,
} from '../../src/types/engagement.js';

describe('INTENSITY_PROFILES', () => {
  const levels: IntensityLevel[] = ['quick', 'standard', 'thorough', 'maximal'];

  it('has all four intensity levels', () => {
    for (const level of levels) {
      expect(INTENSITY_PROFILES[level]).toBeDefined();
      expect(INTENSITY_PROFILES[level].level).toBe(level);
    }
  });

  it('has increasing budget multipliers', () => {
    expect(INTENSITY_PROFILES.quick.budgetMultiplier).toBeLessThan(INTENSITY_PROFILES.standard.budgetMultiplier);
    expect(INTENSITY_PROFILES.standard.budgetMultiplier).toBeLessThan(INTENSITY_PROFILES.thorough.budgetMultiplier);
    expect(INTENSITY_PROFILES.thorough.budgetMultiplier).toBeLessThan(INTENSITY_PROFILES.maximal.budgetMultiplier);
  });

  it('has increasing suggested team sizes', () => {
    expect(INTENSITY_PROFILES.quick.suggestedTeamSize).toBeLessThan(INTENSITY_PROFILES.standard.suggestedTeamSize);
    expect(INTENSITY_PROFILES.standard.suggestedTeamSize).toBeLessThan(INTENSITY_PROFILES.thorough.suggestedTeamSize);
    expect(INTENSITY_PROFILES.thorough.suggestedTeamSize).toBeLessThan(INTENSITY_PROFILES.maximal.suggestedTeamSize);
  });

  it('quick has no gates', () => {
    expect(INTENSITY_PROFILES.quick.gateFrequency).toBe('none');
  });

  it('maximal has all gates', () => {
    expect(INTENSITY_PROFILES.maximal.gateFrequency).toBe('all');
  });

  it('each profile has valid color hex', () => {
    for (const level of levels) {
      expect(INTENSITY_PROFILES[level].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('each profile has estimated minutes as [min, max]', () => {
    for (const level of levels) {
      const [min, max] = INTENSITY_PROFILES[level].estimatedMinutes;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThan(min);
    }
  });
});

describe('defaultBudgetForIntensity', () => {
  it('returns correct budget for each level', () => {
    expect(defaultBudgetForIntensity('quick')).toBe(3);   // 0.3 × 10
    expect(defaultBudgetForIntensity('standard')).toBe(10); // 1.0 × 10
    expect(defaultBudgetForIntensity('thorough')).toBe(20); // 2.0 × 10
    expect(defaultBudgetForIntensity('maximal')).toBe(40);  // 4.0 × 10
  });
});

describe('effortForIntensity', () => {
  it('maps intensity to effort correctly', () => {
    expect(effortForIntensity('quick')).toBe('low');
    expect(effortForIntensity('standard')).toBe('medium');
    expect(effortForIntensity('thorough')).toBe('high');
    expect(effortForIntensity('maximal')).toBe('max');
  });
});
