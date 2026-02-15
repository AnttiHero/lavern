/**
 * CertaintyDashboard — Unit tests for certainty score, verification breakdown,
 * and human review section.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CertaintyGauge } from '../delivery/components/CertaintyGauge.js';
import { VerificationBreakdown, type VerificationDimension } from '../delivery/components/VerificationBreakdown.js';
import { HumanReviewSection } from '../delivery/components/HumanReviewSection.js';
import { CertaintyDashboard } from '../delivery/components/CertaintyDashboard.js';
import type { DeliveryData } from '../delivery/hooks/useDeliveryData.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function buildMockData(overrides: Partial<DeliveryData> = {}): DeliveryData {
  return {
    sessionId: 'test-session-1',
    status: 'complete',
    documentTitle: 'Test Document',
    executiveSummary: 'Summary',
    keyChanges: [],
    dimensions: [],
    narrative: [],
    debate: { findingsCount: 3, challengesCount: 2, resolutionsCount: 1, unresolvedCount: 0 },
    verification: {
      resultsCount: 3,
      passed: 3,
      failed: 0,
      confidence: 0.91,
      breakdown: [
        { type: 'self', passed: true, confidence: 0.93, label: 'Self-Check' },
        { type: 'cross', passed: true, confidence: 0.87, label: 'Cross-Check' },
        { type: 'score', passed: true, confidence: 0.94, label: 'Score-Check' },
      ],
    },
    cost: { accumulated: 8.50, budget: 10, remaining: 1.50 },
    agentPerformance: [
      { name: 'Agent A', role: 'evaluator', findingsPosted: 5, challengesSurvived: 2, avgConfidence: 0.88 },
      { name: 'Agent B', role: 'ethics-auditor', findingsPosted: 3, challengesSurvived: 1, avgConfidence: 0.91 },
    ],
    eventCount: 42,
    limitations: {
      flaggedForHumanReview: ['Regulatory filing reference in Section 4', 'Jurisdiction-specific tax obligations'],
      confidenceIntervals: 'Overall certainty 91% across 3 verification dimensions.',
      disclaimer: 'This analysis was produced by an AI system with multi-agent verification.',
    },
    nextSteps: [],
    ...overrides,
  };
}

// ── CertaintyGauge ──────────────────────────────────────────────────────

describe('CertaintyGauge', () => {
  it('renders the score text', () => {
    render(<CertaintyGauge score={91} />);
    expect(screen.getByTestId('certainty-gauge')).toBeTruthy();
    expect(screen.getByText('91%')).toBeTruthy();
    expect(screen.getByText('CERTAINTY')).toBeTruthy();
  });

  it('renders green color for high scores (>= 85)', () => {
    const { container } = render(<CertaintyGauge score={92} />);
    // The foreground circle should use success color
    const circles = container.querySelectorAll('circle');
    const foreground = circles[1]; // second circle is foreground
    expect(foreground.getAttribute('stroke')).toBe('#4A7C50');
  });

  it('renders yellow color for medium scores (70-84)', () => {
    const { container } = render(<CertaintyGauge score={75} />);
    const circles = container.querySelectorAll('circle');
    const foreground = circles[1];
    expect(foreground.getAttribute('stroke')).toBe('#B8860B');
  });

  it('renders red color for low scores (< 70)', () => {
    const { container } = render(<CertaintyGauge score={55} />);
    const circles = container.querySelectorAll('circle');
    const foreground = circles[1];
    expect(foreground.getAttribute('stroke')).toBe('#C45D3E');
  });
});

// ── VerificationBreakdown ────────────────────────────────────────────────

describe('VerificationBreakdown', () => {
  const breakdown: VerificationDimension[] = [
    { type: 'self', passed: true, confidence: 0.93, label: 'Self-Check' },
    { type: 'cross', passed: true, confidence: 0.87, label: 'Cross-Check' },
    { type: 'score', passed: false, confidence: 0.60, label: 'Score-Check' },
  ];

  it('renders all three dimension labels', () => {
    render(<VerificationBreakdown breakdown={breakdown} agentCount={8} />);
    expect(screen.getByText('Self-Check')).toBeTruthy();
    expect(screen.getByText('Cross-Check')).toBeTruthy();
    expect(screen.getByText('Score-Check')).toBeTruthy();
  });

  it('shows correct agent count in footer', () => {
    render(<VerificationBreakdown breakdown={breakdown} agentCount={8} />);
    expect(screen.getByText('Double-checked by 8 independent agents')).toBeTruthy();
  });

  it('renders confidence percentages', () => {
    render(<VerificationBreakdown breakdown={breakdown} agentCount={8} />);
    expect(screen.getByText('93%')).toBeTruthy();
    expect(screen.getByText('87%')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
  });
});

// ── HumanReviewSection ──────────────────────────────────────────────────

describe('HumanReviewSection', () => {
  it('renders the heading', () => {
    render(
      <HumanReviewSection
        confidence={0.91}
        dimensionCount={3}
        flaggedItems={[]}
        confidenceIntervals="Overall certainty 91%"
        disclaimer="Disclaimer text."
      />,
    );
    expect(screen.getByText('What If This Advice Is Wrong?')).toBeTruthy();
  });

  it('renders flagged items', () => {
    render(
      <HumanReviewSection
        confidence={0.91}
        dimensionCount={3}
        flaggedItems={['Tax issue', 'Regulatory risk']}
        confidenceIntervals="Overall certainty 91%"
        disclaimer="Disclaimer text."
      />,
    );
    expect(screen.getByText('Tax issue')).toBeTruthy();
    expect(screen.getByText('Regulatory risk')).toBeTruthy();
  });
});

// ── CertaintyDashboard (integration) ────────────────────────────────────

describe('CertaintyDashboard', () => {
  it('renders all three sections together', () => {
    const data = buildMockData();
    render(<CertaintyDashboard data={data} />);

    // Gauge
    expect(screen.getByTestId('certainty-gauge')).toBeTruthy();
    expect(screen.getByText('91%')).toBeTruthy();

    // Breakdown
    expect(screen.getByText('Self-Check')).toBeTruthy();
    expect(screen.getByText('Cross-Check')).toBeTruthy();
    expect(screen.getByText('Score-Check')).toBeTruthy();

    // Human review
    expect(screen.getByTestId('human-review-section')).toBeTruthy();
    expect(screen.getByText('What If This Advice Is Wrong?')).toBeTruthy();
  });

  it('handles zero confidence gracefully', () => {
    const data = buildMockData({
      verification: { resultsCount: 0, passed: 0, failed: 0, confidence: 0 },
    });
    render(<CertaintyDashboard data={data} />);

    // Multiple "0%" elements (gauge + breakdown cards) — verify gauge renders
    expect(screen.getByTestId('certainty-gauge')).toBeTruthy();
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
  });

  it('uses default breakdown when none provided by API', () => {
    const data = buildMockData({
      verification: { resultsCount: 3, passed: 3, failed: 0, confidence: 0.85 },
    });
    // No breakdown array → CertaintyDashboard builds defaults
    render(<CertaintyDashboard data={data} />);

    expect(screen.getByText('Self-Check')).toBeTruthy();
    expect(screen.getByText('Cross-Check')).toBeTruthy();
    expect(screen.getByText('Score-Check')).toBeTruthy();
  });
});
