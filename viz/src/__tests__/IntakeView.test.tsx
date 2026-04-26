/**
 * IntakeView — Component tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import IntakeView from '../intake/IntakeView.js';

const noop = () => {};

describe('IntakeView', () => {
  it('renders mode-select screen by default', () => {
    renderWithSession(
      <IntakeView onComplete={noop} onSkip={noop} onBack={noop} />
    );

    // Two mode cards should render
    expect(screen.getByText('Drop & Go')).toBeInTheDocument();
    expect(screen.getByText('Guided Intake')).toBeInTheDocument();
  });

  it('shows header text', () => {
    renderWithSession(
      <IntakeView onComplete={noop} onSkip={noop} onBack={noop} />
    );

    expect(screen.getByText('LAVERN')).toBeInTheDocument();
  });

  it('shows description for both modes', () => {
    renderWithSession(
      <IntakeView onComplete={noop} onSkip={noop} onBack={noop} />
    );

    expect(
      screen.getByText(/Drop a document or paste text/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Step-by-step questions/)
    ).toBeInTheDocument();
  });

  it('renders skip button via header', () => {
    renderWithSession(
      <IntakeView onComplete={noop} onSkip={noop} onBack={noop} />
    );

    expect(screen.getByText(/Skip/)).toBeInTheDocument();
  });

  it('handles missing sessionStorage gracefully', () => {
    renderWithSession(
      <IntakeView onComplete={noop} onSkip={noop} onBack={noop} />,
      { withSessionData: false }
    );

    // Should still render mode-select
    expect(screen.getByText('Drop & Go')).toBeInTheDocument();
    expect(screen.getByText('Guided Intake')).toBeInTheDocument();
  });

  it('calls onSkip when skip button is clicked', async () => {
    const onSkip = vi.fn();
    renderWithSession(
      <IntakeView onComplete={noop} onSkip={onSkip} onBack={noop} />
    );

    const skipBtn = screen.getByText(/Skip/);
    skipBtn.click();
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
