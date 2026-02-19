/**
 * MyPageView — Component tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock framer-motion (same pattern as other view tests)
vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_target: object, prop: string) => {
      return ({ children, ...props }: Record<string, unknown>) => {
        const { initial, animate, exit, whileHover, whileTap, variants, transition, layout, ...domProps } = props;
        void initial; void animate; void exit; void whileHover; void whileTap; void variants; void transition; void layout;
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag {...domProps}>{children}</Tag>;
      };
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Dynamic import for lazy-loaded view
const loadMyPageView = async () => {
  const mod = await import('../my-page/MyPageView.js');
  return mod.default;
};

beforeEach(() => {
  localStorage.clear();
});

describe('MyPageView', () => {
  it('renders all 4 section headers', async () => {
    const MyPageView = await loadMyPageView();
    render(<MyPageView onBack={vi.fn()} />);
    expect(screen.getByText('About You')).toBeInTheDocument();
    expect(screen.getByText('Default Settings')).toBeInTheDocument();
    expect(screen.getByText('Custom Instructions')).toBeInTheDocument();
    expect(screen.getByText('Saved Teams')).toBeInTheDocument();
  });

  it('renders identity inputs with correct placeholders', async () => {
    const MyPageView = await loadMyPageView();
    render(<MyPageView onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText('Your name or handle')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Firm or organization')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. California/i)).toBeInTheDocument();
  });

  it('renders workflow dropdown with 6 options', async () => {
    const MyPageView = await loadMyPageView();
    render(<MyPageView onBack={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(6);
  });

  it('renders intensity radio buttons', async () => {
    const MyPageView = await loadMyPageView();
    render(<MyPageView onBack={vi.fn()} />);
    expect(screen.getByText('Quick')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Thorough')).toBeInTheDocument();
    expect(screen.getByText('Maximal')).toBeInTheDocument();
  });

  it('renders custom instructions textarea', async () => {
    const MyPageView = await loadMyPageView();
    render(<MyPageView onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText(/California privacy/i)).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2000/)).toBeInTheDocument();
  });

  it('shows empty state when no saved teams', async () => {
    const MyPageView = await loadMyPageView();
    render(<MyPageView onBack={vi.fn()} />);
    expect(screen.getByText(/No saved teams yet/)).toBeInTheDocument();
  });

  it('calls onBack when back link is clicked', async () => {
    const MyPageView = await loadMyPageView();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<MyPageView onBack={onBack} />);

    const backBtn = screen.getByText(/Back to Home/);
    await user.click(backBtn);

    expect(onBack).toHaveBeenCalled();
  });
});
