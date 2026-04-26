/**
 * BillingView — Component tests.
 */

import { describe, it, expect } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import BillingView from '../billing/BillingView.js';

const noop = () => {};

describe('BillingView', () => {
  it('renders invoice with matter data from sessionStorage', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText('LAVERN')).toBeInTheDocument();
    });

    expect(screen.getByText('INVOICE')).toBeInTheDocument();
    expect(screen.getByText('The Agentic Law Firm')).toBeInTheDocument();
  });

  it('shows client name from matter data', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Corp')).toBeInTheDocument();
    });
  });

  it('shows matter number', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText('MBL-2025-001')).toBeInTheDocument();
    });
  });

  it('shows cost summary section', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText('Cost Summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Due')).toBeInTheDocument();
  });

  it('renders close button', () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    expect(screen.getByText(/Close Matter/)).toBeInTheDocument();
  });

  it('renders print button', () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    expect(screen.getByText('Print Invoice')).toBeInTheDocument();
  });

  it('handles missing sessionStorage gracefully', async () => {
    renderWithSession(
      <BillingView onClose={noop} />,
      { withSessionData: false }
    );

    // Should still render (buildBillingData uses fallbacks)
    await waitFor(() => {
      expect(screen.getByText('LAVERN')).toBeInTheDocument();
    });
  });

  it('shows What\'s Next section with engagement options', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText(/What.s Next/)).toBeInTheDocument();
    });

    expect(screen.getByText('New Matter')).toBeInTheDocument();
    expect(screen.getByText('Revision Round')).toBeInTheDocument();
    expect(screen.getByText('Related Matter')).toBeInTheDocument();
  });

  it('shows feedback section', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    await waitFor(() => {
      expect(screen.getByText('How did we do?')).toBeInTheDocument();
    });

    expect(screen.getByText('Work Quality')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
    expect(screen.getByText(/Submit/)).toBeInTheDocument();
  });

  it('shows phase breakdown toggle', async () => {
    renderWithSession(
      <BillingView onClose={noop} />
    );

    // Demo fallback generates phase costs
    await waitFor(() => {
      expect(screen.getByText(/Show Phase Breakdown/)).toBeInTheDocument();
    });
  });
});
