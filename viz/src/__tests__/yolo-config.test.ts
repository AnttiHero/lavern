/**
 * yolo-config — Unit tests for YOLO tier configurations.
 */

import { describe, it, expect } from 'vitest';
import { YOLO_CONFIGS } from '../landing/yolo-config.js';

describe('YOLO_CONFIGS', () => {
  it('standard tier uses counsel workflow', () => {
    expect(YOLO_CONFIGS.standard.workflowId).toBe('counsel');
  });

  it('standard tier has 8 team roles (balanced preset)', () => {
    expect(YOLO_CONFIGS.standard.teamRoles).toHaveLength(8);
    expect(YOLO_CONFIGS.standard.teamSize).toBe(8);
  });

  it('white-shoe tier uses review workflow', () => {
    expect(YOLO_CONFIGS['white-shoe'].workflowId).toBe('review');
  });

  it('white-shoe tier has 14 team roles (full-service preset)', () => {
    expect(YOLO_CONFIGS['white-shoe'].teamRoles).toHaveLength(14);
    expect(YOLO_CONFIGS['white-shoe'].teamSize).toBe(14);
  });

  it('both tiers have yoloMode true', () => {
    expect(YOLO_CONFIGS.standard.yoloMode).toBe(true);
    expect(YOLO_CONFIGS['white-shoe'].yoloMode).toBe(true);
  });

  it('white-shoe budget exceeds standard budget', () => {
    expect(YOLO_CONFIGS['white-shoe'].budgetUsd).toBeGreaterThan(
      YOLO_CONFIGS.standard.budgetUsd,
    );
  });

  it('standard tier uses medium effort', () => {
    expect(YOLO_CONFIGS.standard.effort).toBe('medium');
  });

  it('white-shoe tier uses max effort (white-shoe effort)', () => {
    expect(YOLO_CONFIGS['white-shoe'].effort).toBe('max');
  });
});
