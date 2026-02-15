/**
 * TrophyShelf — Unit tests for milestone trophy badges.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrophyShelf } from '../briefing/components/TrophyShelf.js';
import type { ContextMilestone } from '../briefing/hooks/useContextScore.js';

const ALL_MILESTONES: ContextMilestone[] = [
  { threshold: 25, label: 'Getting started', reached: false },
  { threshold: 50, label: 'Good foundation', reached: false },
  { threshold: 75, label: 'Strong briefing', reached: false },
  { threshold: 100, label: 'Exceptional', reached: false },
];

function withReached(...thresholds: number[]): ContextMilestone[] {
  return ALL_MILESTONES.map(m => ({
    ...m,
    reached: thresholds.includes(m.threshold),
  }));
}

describe('TrophyShelf', () => {
  it('renders nothing when no milestones reached', () => {
    const { container } = render(
      <TrophyShelf milestones={ALL_MILESTONES} newMilestone={null} />,
    );
    expect(container.querySelector('[data-testid="trophy-shelf"]')).toBeNull();
  });

  it('renders correct trophy for 25% milestone', () => {
    render(
      <TrophyShelf milestones={withReached(25)} newMilestone={null} />,
    );
    expect(screen.getByTestId('trophy-case-opened')).toBeTruthy();
    expect(screen.getByText('Case Opened')).toBeTruthy();
  });

  it('renders all four trophies at 100%', () => {
    render(
      <TrophyShelf milestones={withReached(25, 50, 75, 100)} newMilestone={null} />,
    );
    expect(screen.getByTestId('trophy-case-opened')).toBeTruthy();
    expect(screen.getByTestId('trophy-brief-filed')).toBeTruthy();
    expect(screen.getByTestId('trophy-case-strengthened')).toBeTruthy();
    expect(screen.getByTestId('trophy-fully-briefed')).toBeTruthy();
  });

  it('new milestone badge has animation style', () => {
    render(
      <TrophyShelf milestones={withReached(25, 50)} newMilestone={50} />,
    );
    const badge = screen.getByTestId('trophy-brief-filed');
    expect(badge.style.animation).toContain('trophyEnter');
    expect(badge.style.animation).toContain('trophyGlow');
  });

  it('does not render unearned trophies', () => {
    render(
      <TrophyShelf milestones={withReached(25, 50)} newMilestone={null} />,
    );
    expect(screen.getByTestId('trophy-case-opened')).toBeTruthy();
    expect(screen.getByTestId('trophy-brief-filed')).toBeTruthy();
    expect(screen.queryByTestId('trophy-case-strengthened')).toBeNull();
    expect(screen.queryByTestId('trophy-fully-briefed')).toBeNull();
  });
});
