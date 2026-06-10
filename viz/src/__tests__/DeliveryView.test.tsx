/**
 * DeliveryView — Component tests.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import { mockFetchSessionData } from '../test-utils/fixtures.js';
import DeliveryView from '../delivery/DeliveryView.js';

vi.mock('../staffing/hooks/useAgentProfiles.js', () => ({
  useAgentProfiles: () => ({ allProfiles: [] }),
}));

const noop = () => {};

// DeliveryView uses demo data when session ID starts with "demo-session-"
const demoSessionOverrides = { sessionId: 'demo-session-test-1234' };

describe('DeliveryView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with demo session data', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} onSkip={noop} />,
      { sessionOverrides: demoSessionOverrides }
    );

    // Header should show
    expect(screen.getAllByText('LAVERN').length).toBeGreaterThan(0);
    expect(screen.getByText(/Delivery/)).toBeInTheDocument();

    // Demo data should load (useDeliveryData returns demo data for demo-session-*)
    await waitFor(() => {
      expect(screen.getByText('The Work')).toBeInTheDocument();
    });

    // All 5 tab labels should render
    expect(screen.getByText('The Review')).toBeInTheDocument();
    expect(screen.getByText('The Story')).toBeInTheDocument();
    expect(screen.getByText('The Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Next Steps')).toBeInTheDocument();
  });

  it('shows The Work tab content by default', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: demoSessionOverrides }
    );

    // The Work is now the default tab — look for the hero overline
    await waitFor(() => {
      expect(screen.getByText('Delivered Work Product')).toBeInTheDocument();
    });
  });

  it('falls back to demo data when no session in storage', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { withSessionData: false }
    );

    // Should still render demo data (no longer shows "No session found")
    await waitFor(() => {
      expect(screen.getByText('Delivered Work Product')).toBeInTheDocument();
    });
  });

  it('renders continue button', () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: demoSessionOverrides }
    );

    expect(screen.getByText(/Continue to Billing/)).toBeInTheDocument();
  });

  it('shows the direction flow for paused intake HOLD deliveries', async () => {
    mockFetchSessionData({
      id: 'shem-hold-test',
      workflow: { currentStep: 'delivered', completedSteps: ['intake'] },
      debate: { findingsCount: 1, challengesCount: 0, resolutionsCount: 0, unresolvedCount: 0 },
      verification: { resultsCount: 0, passed: 0, failed: 0 },
      cost: { accumulated: 0, budget: 40, remaining: 40 },
      eventCount: 0,
      evaluator: { results: [], bestScore: 0 },
      agentPerformance: [],
      assembledDocument: '# STATUS - INTAKE COMPLETE, SPECIALIST ANALYSIS ON HOLD\n\nThe matter is paused. I am awaiting your direction.\n\nWhat I need from you to release the HOLD:\n\n- Who is the client?\n- What is the actual deliverable?',
      finalOutput: null,
      deliveryState: 'needs_direction',
      directionRequest: {
        title: 'STATUS - INTAKE COMPLETE, SPECIALIST ANALYSIS ON HOLD',
        blockers: [
          { id: 'client_identity', label: 'Who is the client?', required: true, answerType: 'text' },
          { id: 'deadline', label: 'What is the deadline?', required: true, answerType: 'date' },
          { id: 'deliverable_type', label: 'What is the actual deliverable?', required: true, answerType: 'choice', options: ['High-level critique'] },
        ],
      },
      debateResolutions: [],
      gateDecisionRecords: [],
      findings: [],
      documents: [],
      matterTitle: 'Paused Matter',
      workflowTemplateId: 'review',
      provider: 'anthropic',
      selectedTeam: [],
      halted: false,
      haltReason: null,
      durationMs: 240000,
    });

    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: { sessionId: 'shem-hold-test' } }
    );

    await waitFor(() => {
      expect(screen.getByText('Answer blockers and continue')).toBeInTheDocument();
    });

    const bodyText = document.body.textContent ?? '';
    expect(bodyText.indexOf('Document Preview')).toBeGreaterThanOrEqual(0);
    expect(bodyText.indexOf('Document Preview')).toBeLessThan(
      bodyText.indexOf('Answer blockers and continue')
    );
    expect(screen.getAllByText(/Answer blockers & continue/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Continue to Billing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Send back for revision/)).not.toBeInTheDocument();
  });

  it('does not expose final-delivery actions for restored assembly failures', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Session not found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'shem-archive-assembly-failed',
          title: '990163_0000009',
          assembledDocument: '',
          deliveryState: 'assembly_failed',
          findings: [],
          debateResolutions: [],
          verificationResults: [],
          teamRoles: [],
          costUsd: 0,
          budgetUsd: 40,
          durationMs: 960000,
        }),
      });

    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: { sessionId: 'shem-archive-assembly-failed' } }
    );

    await waitFor(() => {
      expect(screen.getByText('Assembly Incomplete')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delivered Work Product')).not.toBeInTheDocument();
    expect(screen.queryByText(/Send back for revision/)).not.toBeInTheDocument();
    expect(screen.queryByText('Download Deliverable')).not.toBeInTheDocument();
    expect(screen.queryByText('Document Style')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate More')).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue to Billing/)).not.toBeInTheDocument();
    expect(screen.getByText('Download Analysis Data')).toBeInTheDocument();
    expect(screen.getByText('Download Structured Data')).toBeEnabled();
  });

  it('stops polling and shows analysis download for live assembly failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: 'shem-live-assembly-failed',
        workflow: { currentStep: 'delivered', completedSteps: ['intake', 'specialist_analysis', 'delivered'] },
        debate: { findingsCount: 23, challengesCount: 0, resolutionsCount: 4, unresolvedCount: 0 },
        verification: { resultsCount: 0, passed: 0, failed: 0 },
        cost: { accumulated: 0, budget: 40, remaining: 40 },
        eventCount: 47,
        evaluator: { results: [], bestScore: 0 },
        agentPerformance: [],
        assembledDocument: null,
        finalOutput: null,
        deliveryState: 'assembly_failed',
        debateResolutions: [],
        gateDecisionRecords: [],
        findings: [],
        documents: [],
        matterTitle: 'Motion Record Volume No. 1',
        workflowTemplateId: 'review',
        provider: 'minimax',
        selectedTeam: [],
        halted: false,
        haltReason: null,
        durationMs: 960000,
      }),
    });

    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: { sessionId: 'shem-live-assembly-failed' } }
    );

    await waitFor(() => {
      expect(screen.getByText('Assembly Incomplete')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Assembling document/)).not.toBeInTheDocument();
    expect(screen.getByText('Download Analysis Data')).toBeInTheDocument();
    expect(screen.getByText('Download Structured Data')).toBeEnabled();
    expect(screen.queryByText(/Continue to Billing/)).not.toBeInTheDocument();
  });

  it('renders back button', () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: demoSessionOverrides }
    );

    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });

  it('renders matter badge when matter data exists', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { sessionOverrides: demoSessionOverrides }
    );

    await waitFor(() => {
      expect(screen.getByText(/MBL-2025-001/)).toBeInTheDocument();
    });
  });
});
