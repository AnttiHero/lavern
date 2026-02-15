/**
 * CertaintyDashboard — Certainty tab content for the delivery view.
 *
 * Three sections:
 *   1. CertaintyGauge — hero radial score
 *   2. VerificationBreakdown — per-dimension confidence cards
 *   3. HumanReviewSection — "What If This Advice Is Wrong?"
 */

import { CertaintyGauge } from './CertaintyGauge.js';
import { VerificationBreakdown } from './VerificationBreakdown.js';
import { HumanReviewSection } from './HumanReviewSection.js';
import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

export function CertaintyDashboard({ data }: Props) {
  const certPct = Math.round(data.verification.confidence * 100);

  // Build breakdown from data (use defaults if not provided by API)
  const breakdown = data.verification.breakdown ?? [
    { type: 'self' as const, passed: data.verification.failed === 0, confidence: data.verification.confidence, label: 'Self-Check' },
    { type: 'cross' as const, passed: data.verification.failed === 0, confidence: data.verification.confidence, label: 'Cross-Check' },
    { type: 'score' as const, passed: data.verification.failed === 0, confidence: data.verification.confidence, label: 'Score-Check' },
  ];

  const limitations = data.limitations ?? {
    flaggedForHumanReview: [],
    confidenceIntervals: `Overall certainty ${certPct}% across ${breakdown.length} verification dimensions.`,
    disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xxl }}>
      {/* Hero gauge */}
      <CertaintyGauge score={certPct} />

      {/* Verification dimensions */}
      <VerificationBreakdown
        breakdown={breakdown}
        agentCount={Math.max(1, data.agentPerformance.filter(a => a.findingsPosted > 0 || a.avgConfidence > 0).length || data.agentPerformance.length)}
      />

      {/* Transparency section */}
      <HumanReviewSection
        confidence={data.verification.confidence}
        dimensionCount={breakdown.length}
        flaggedItems={limitations.flaggedForHumanReview}
        confidenceIntervals={limitations.confidenceIntervals}
        disclaimer={limitations.disclaimer}
      />
    </div>
  );
}
