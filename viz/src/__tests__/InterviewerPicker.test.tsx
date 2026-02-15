/**
 * InterviewerPicker — Unit tests for persona selection grid.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InterviewerPicker } from '../briefing/components/InterviewerPicker.js';
import { INTERVIEWER_PERSONAS } from '../briefing/data/interviewers.js';

describe('InterviewerPicker', () => {
  it('renders all four personas', () => {
    render(<InterviewerPicker onSelect={vi.fn()} onSkip={vi.fn()} />);
    for (const persona of INTERVIEWER_PERSONAS) {
      expect(screen.getByTestId(`interviewer-${persona.id}`)).toBeTruthy();
    }
  });

  it('calls onSelect with persona ID when clicked', () => {
    const onSelect = vi.fn();
    render(<InterviewerPicker onSelect={onSelect} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByTestId('interviewer-margaret-chen'));
    expect(onSelect).toHaveBeenCalledWith('margaret-chen');
  });

  it('shows all persona names and titles', () => {
    render(<InterviewerPicker onSelect={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Margaret Chen')).toBeTruthy();
    expect(screen.getByText('Senior Partner')).toBeTruthy();
    expect(screen.getByText('James Whitfield')).toBeTruthy();
    expect(screen.getByText('Managing Partner')).toBeTruthy();
    expect(screen.getByText('Dr. Amara Osei')).toBeTruthy();
    expect(screen.getByText('Of Counsel')).toBeTruthy();
    expect(screen.getByText('Rafael Torres')).toBeTruthy();
    expect(screen.getByText('Junior Partner')).toBeTruthy();
  });

  it('shows taglines for each persona', () => {
    render(<InterviewerPicker onSelect={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Precise, thorough, nothing overlooked.')).toBeTruthy();
    expect(screen.getByText('Warm, reassuring, makes it easy.')).toBeTruthy();
    expect(screen.getByText('Analytical, insightful, sees patterns.')).toBeTruthy();
    expect(screen.getByText('Direct, energetic, keeps things moving.')).toBeTruthy();
  });

  it('calls onSkip when Skip button is clicked', () => {
    const onSkip = vi.fn();
    render(<InterviewerPicker onSelect={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId('interviewer-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
