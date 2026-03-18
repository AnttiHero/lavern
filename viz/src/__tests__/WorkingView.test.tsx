/**
 * WorkingView — Component tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import WorkingView from '../working/WorkingView.js';

const noop = () => {};

// Strip framer-motion specific props to avoid React DOM warnings
function stripMotionProps(props: Record<string, any>) {
  const {
    initial, animate, exit, variants, transition,
    whileHover, whileTap, whileDrag, whileFocus, whileInView,
    drag, dragConstraints, dragElastic, dragMomentum,
    layout, layoutId, onAnimationComplete, onAnimationStart,
    ...domProps
  } = props;
  return domProps;
}

// Mock framer-motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => (
      <div {...stripMotionProps(props)}>{children}</div>
    ),
    button: ({ children, ...props }: any) => (
      <button {...stripMotionProps(props)}>{children}</button>
    ),
    span: ({ children, ...props }: any) => (
      <span {...stripMotionProps(props)}>{children}</span>
    ),
    p: ({ children, ...props }: any) => (
      <p {...stripMotionProps(props)}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('WorkingView', () => {
  it('renders the working screen', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />
    );

    // WorkingHeader renders "Lavern" (not "THE SHEM")
    expect(screen.getByText('Lavern')).toBeInTheDocument();
  });

  it('shows back button', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />
    );

    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });

  it('shows skip button', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />
    );

    expect(screen.getByText(/Skip/)).toBeInTheDocument();
  });

  it('attempts to connect to session from sessionStorage', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />
    );

    // With session data in sessionStorage, attempts WebSocket connection
    // Without a real backend, stays disconnected — but Disconnect button still shows
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('shows connect input when no session data', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />,
      { withSessionData: false }
    );

    // Without session data, stays disconnected → shows Connect button
    expect(screen.getByText('Connect')).toBeInTheDocument();
  });

  it('renders without crashing when no session data', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />,
      { withSessionData: false }
    );

    // WorkingHeader + SessionOverlay (dashboard) both render "Lavern"
    expect(screen.getAllByText('Lavern').length).toBeGreaterThanOrEqual(1);
  });
});
