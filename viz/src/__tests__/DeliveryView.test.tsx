/**
 * DeliveryView — Component tests.
 */

import { describe, it, expect } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import DeliveryView from '../delivery/DeliveryView.js';

const noop = () => {};

describe('DeliveryView', () => {
  it('renders with demo session data', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} onSkip={noop} />
    );

    // Header should show
    expect(screen.getByText('MARBLE')).toBeInTheDocument();
    expect(screen.getByText(/Delivery/)).toBeInTheDocument();

    // Demo data should load (useDeliveryData returns demo data for demo-session-*)
    await waitFor(() => {
      expect(screen.getByText('The Work')).toBeInTheDocument();
    });

    // All 5 tab labels should render
    expect(screen.getByText('Certainty')).toBeInTheDocument();
    expect(screen.getByText('The Story')).toBeInTheDocument();
    expect(screen.getByText('The Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Next Steps')).toBeInTheDocument();
  });

  it('shows the Certainty tab content by default', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('certainty-gauge')).toBeInTheDocument();
    });

    // Certainty tab should show verification breakdown and human review section
    expect(screen.getByText('What If This Advice Is Wrong?')).toBeInTheDocument();
    expect(screen.getByTestId('human-review-section')).toBeInTheDocument();
  });

  it('shows error when no session in storage', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />,
      { withSessionData: false }
    );

    await waitFor(() => {
      expect(screen.getByText('No session found')).toBeInTheDocument();
    });
  });

  it('renders continue button', () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />
    );

    expect(screen.getByText(/Continue to Billing/)).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />
    );

    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });

  it('renders matter badge when matter data exists', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText(/MBL-2025-001/)).toBeInTheDocument();
    });
  });
});
