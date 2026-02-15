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

    // WorkingHeader renders "Marble" (not "THE SHEM")
    expect(screen.getByText('Marble')).toBeInTheDocument();
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

  it('auto-connects to demo session from sessionStorage', () => {
    renderWithSession(
      <WorkingView onComplete={noop} onBack={noop} onSkip={noop} />
    );

    // With demo session data in sessionStorage, auto-connects → shows "connected"
    expect(screen.getByText('connected')).toBeInTheDocument();
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

    // WorkingHeader + SessionOverlay (dashboard) both render "Marble"
    expect(screen.getAllByText('Marble').length).toBeGreaterThanOrEqual(1);
  });
});
