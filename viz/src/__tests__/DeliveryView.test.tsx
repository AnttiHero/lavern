/**
 * DeliveryView — Component tests.
 */

import { describe, it, expect } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import DeliveryView from '../delivery/DeliveryView.js';

const noop = () => {};

// DeliveryView uses demo data when session ID starts with "demo-session-"
const demoSessionOverrides = { sessionId: 'demo-session-test-1234' };

describe('DeliveryView', () => {
  it('renders with demo session data', async () => {
    renderWithSession(
      <DeliveryView onContinue={noop} onBack={noop} onSkip={noop} />,
      { sessionOverrides: demoSessionOverrides }
    );

    // Header should show
    expect(screen.getByText('LAVERN')).toBeInTheDocument();
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
