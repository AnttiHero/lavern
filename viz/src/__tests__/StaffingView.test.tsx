/**
 * StaffingView — Component tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithSession, screen, waitFor } from '../test-utils/render.js';
import StaffingView from '../staffing/StaffingView.js';

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

// Mock framer-motion to avoid animation issues in jsdom
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

// Mock sound effects (uses Web Audio API which isn't available in jsdom)
vi.mock('../staffing/hooks/useSoundEffects.js', () => ({
  useSoundEffects: () => ({ play: () => {} }),
}));

describe('StaffingView', () => {
  it('renders page title', async () => {
    renderWithSession(
      <StaffingView onTeamConfirmed={noop} onBack={noop} onSkip={noop} />
    );

    expect(screen.getByText(/Lavern/)).toBeInTheDocument();

    // Wait for async profile loading — section headers appear
    await waitFor(() => {
      expect(screen.getByText('Orchestrators')).toBeInTheDocument();
    });
  });

  it('shows agent sections after loading', async () => {
    renderWithSession(
      <StaffingView onTeamConfirmed={noop} onBack={noop} onSkip={noop} />
    );

    // Section headers appear after profile loading
    await waitFor(() => {
      expect(screen.getByText('Orchestrators')).toBeInTheDocument();
    });
  });

  it('renders back button', () => {
    renderWithSession(
      <StaffingView onTeamConfirmed={noop} onBack={noop} onSkip={noop} />
    );

    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });

  it('renders skip button', () => {
    renderWithSession(
      <StaffingView onTeamConfirmed={noop} onBack={noop} onSkip={noop} />
    );

    expect(screen.getByText(/Skip/)).toBeInTheDocument();
  });

  it('renders section headers after profile loading', async () => {
    renderWithSession(
      <StaffingView onTeamConfirmed={noop} onBack={noop} onSkip={noop} />
    );

    // Profiles load asynchronously (fetch fails → falls back to DEMO_PROFILES)
    await waitFor(() => {
      expect(screen.getByText('Orchestrators')).toBeInTheDocument();
    });
  });

  it('renders without crashing when no session data', async () => {
    renderWithSession(
      <StaffingView onTeamConfirmed={noop} onBack={noop} />,
      { withSessionData: false }
    );

    expect(screen.getByText(/Lavern/)).toBeInTheDocument();

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.getByText('Orchestrators')).toBeInTheDocument();
    });
  });
});
