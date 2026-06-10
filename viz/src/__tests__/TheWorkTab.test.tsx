/**
 * TheWorkTab — delivery-state regressions.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderWithSession, screen } from '../test-utils/render.js';
import { TheWorkTab } from '../delivery/components/TheWorkTab.js';
import type { DeliveryData } from '../delivery/hooks/useDeliveryData.js';

vi.mock('../staffing/hooks/useAgentProfiles.js', () => ({
  useAgentProfiles: () => ({ allProfiles: [] }),
}));

function baseDeliveryData(overrides: Partial<DeliveryData> = {}): DeliveryData {
  return {
    sessionId: 'shem-assembly-failed',
    status: 'Complete',
    deliveryState: 'assembly_failed',
    documentTitle: '990163_0000009',
    executiveSummary: 'Analysis complete, but no final document was assembled.',
    keyChanges: [],
    dimensions: [],
    finalOutput: '',
    debateResolutions: [],
    gateDecisions: [],
    verificationChecks: [],
    narrative: [],
    debate: { findingsCount: 20, challengesCount: 0, resolutionsCount: 12, unresolvedCount: 0 },
    verification: { resultsCount: 1, passed: 1, failed: 0, confidence: 0.88 },
    cost: { accumulated: 0, budget: 40, remaining: 40 },
    agentPerformance: [],
    eventCount: 0,
    nextSteps: [],
    ...overrides,
  };
}

describe('TheWorkTab', () => {
  it('does not present an assembly timeout as a delivered work product', () => {
    renderWithSession(
      <TheWorkTab
        data={baseDeliveryData()}
        assemblyStatus="timeout"
        onRetryAssembly={vi.fn()}
      />,
      { withSessionData: false }
    );

    expect(screen.getByText('Assembly Incomplete')).toBeInTheDocument();
    expect(screen.queryByText('Delivered Work Product')).not.toBeInTheDocument();
    expect(screen.queryByText(/Send back for revision/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Download Deliverable')).not.toBeInTheDocument();
    expect(screen.queryByText('Document Style')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate More')).not.toBeInTheDocument();
    expect(screen.getByText('Download Analysis Data')).toBeInTheDocument();
    expect(screen.getByText('Download Structured Data')).toBeEnabled();
  });
});
