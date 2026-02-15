/**
 * YoloLauncher — Component tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YoloLauncher } from '../landing/YoloLauncher.js';

describe('YoloLauncher', () => {
  it('renders the Ask Right Away section title', () => {
    render(<YoloLauncher onLaunch={vi.fn()} />);
    expect(screen.getByText('Ask Right Away')).toBeInTheDocument();
  });

  it('renders text input with placeholder', () => {
    render(<YoloLauncher onLaunch={vi.fn()} />);
    expect(screen.getByPlaceholderText(/legal question/i)).toBeInTheDocument();
  });

  it('renders both launch buttons', () => {
    render(<YoloLauncher onLaunch={vi.fn()} />);
    // Standard launch
    expect(screen.getByText(/^Launch/)).toBeInTheDocument();
    // White-Shoe launch
    expect(screen.getByText(/White-Shoe/)).toBeInTheDocument();
  });

  it('disables buttons when input is empty', () => {
    render(<YoloLauncher onLaunch={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const launchButtons = buttons.filter(b =>
      b.textContent?.includes('Launch'),
    );
    expect(launchButtons.length).toBe(2);
    for (const btn of launchButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it('calls onLaunch with standard tier', async () => {
    const onLaunch = vi.fn();
    const user = userEvent.setup();
    render(<YoloLauncher onLaunch={onLaunch} />);

    const input = screen.getByPlaceholderText(/legal question/i);
    await user.type(input, 'Is this contract enforceable?');

    const launchBtn = screen.getByText(/^Launch/);
    await user.click(launchBtn);

    expect(onLaunch).toHaveBeenCalledWith(
      'Is this contract enforceable?',
      'standard',
    );
  });

  it('calls onLaunch with white-shoe tier', async () => {
    const onLaunch = vi.fn();
    const user = userEvent.setup();
    render(<YoloLauncher onLaunch={onLaunch} />);

    const input = screen.getByPlaceholderText(/legal question/i);
    await user.type(input, 'Full compliance audit needed');

    const whiteShoeBtn = screen.getByText(/White-Shoe/);
    await user.click(whiteShoeBtn);

    expect(onLaunch).toHaveBeenCalledWith(
      'Full compliance audit needed',
      'white-shoe',
    );
  });

  it('renders the disclaimer text', () => {
    render(<YoloLauncher onLaunch={vi.fn()} />);
    expect(screen.getByText(/gates auto-approved/i)).toBeInTheDocument();
  });
});
