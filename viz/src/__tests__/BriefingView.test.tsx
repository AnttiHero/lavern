/**
 * BriefingView — Component tests.
 */

import { describe, it, expect } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import BriefingView from '../briefing/BriefingView.js';

const noop = () => {};

describe('BriefingView', () => {
  it('renders with header', () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />
    );

    // BriefingHeader renders "Lavern Briefing"
    expect(screen.getByText(/Briefing/)).toBeInTheDocument();
  });

  it('starts in documents phase', () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />
    );

    expect(
      screen.getByText('Upload relevant documents')
    ).toBeInTheDocument();
  });

  it('shows continue button in documents phase', () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />
    );

    expect(screen.getByText(/Continue/)).toBeInTheDocument();
  });

  it('shows skip hint when no documents are uploaded', () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />
    );

    expect(
      screen.getByText(/You can skip this step/)
    ).toBeInTheDocument();
  });

  it('reads matter data from sessionStorage', async () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />
    );

    // Matter number from fixture data should appear
    await waitFor(() => {
      expect(screen.getByText(/MBL-2025-001/)).toBeInTheDocument();
    });
  });

  it('handles missing sessionStorage gracefully', () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />,
      { withSessionData: false }
    );

    // Should still render documents phase
    expect(
      screen.getByText('Upload relevant documents')
    ).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderWithSession(
      <BriefingView onComplete={noop} onBack={noop} />
    );

    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });
});
