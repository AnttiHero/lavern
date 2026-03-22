/**
 * Unit Tests — Dispatch Command Parser (viz/src/dispatch/useDispatch.ts)
 *
 * Tests the keyword-based command parser that routes voice input
 * to Claw API endpoints without LLM calls.
 */

import { describe, it, expect } from 'vitest';
import { parseCommand } from '../../viz/src/dispatch/useDispatch.js';

describe('parseCommand', () => {
  it('parses status commands', () => {
    expect(parseCommand('what is the status')).toBe('status');
    expect(parseCommand("how's everything going")).toBe('status');
    expect(parseCommand('give me an update')).toBe('status');
    expect(parseCommand('what is happening')).toBe('status');
    expect(parseCommand('summary please')).toBe('status');
    expect(parseCommand('report')).toBe('status');
  });

  it('parses findings commands', () => {
    expect(parseCommand('any critical findings')).toBe('findings');
    expect(parseCommand('are there any issues')).toBe('findings');
    expect(parseCommand('show me flagged documents')).toBe('findings');
    expect(parseCommand('any problems')).toBe('findings');
    expect(parseCommand('what are the risks')).toBe('findings');
  });

  it('parses scan commands', () => {
    expect(parseCommand('scan now')).toBe('scan');
    expect(parseCommand('check for new documents')).toBe('scan');
    expect(parseCommand('look for new files')).toBe('scan');
  });

  it('parses pause commands', () => {
    expect(parseCommand('pause')).toBe('pause');
    expect(parseCommand('pause processing')).toBe('pause');
  });

  it('parses resume commands', () => {
    expect(parseCommand('resume')).toBe('resume');
    expect(parseCommand('resume processing')).toBe('resume');
    expect(parseCommand('unpause')).toBe('resume');
  });

  it('parses retry commands', () => {
    expect(parseCommand('retry failed documents')).toBe('retry');
    expect(parseCommand('retry the errors')).toBe('retry');
    expect(parseCommand('reprocess failed')).toBe('retry');
  });

  it('parses budget commands', () => {
    expect(parseCommand('how much have we spent')).toBe('budget');
    expect(parseCommand("what's the budget")).toBe('budget');
    expect(parseCommand('show me the cost')).toBe('budget');
    expect(parseCommand('remaining balance')).toBe('budget');
    expect(parseCommand('how much money is left')).toBe('budget');
  });

  it('returns unknown for unrecognized input', () => {
    expect(parseCommand('play some music')).toBe('unknown');
    expect(parseCommand('hello')).toBe('unknown');
    expect(parseCommand('')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(parseCommand('PAUSE')).toBe('pause');
    expect(parseCommand('What Is The Status')).toBe('status');
    expect(parseCommand('SCAN NOW')).toBe('scan');
  });

  it('handles pause before status (priority order)', () => {
    // "pause" should match pause, not status via "how"
    expect(parseCommand('pause')).toBe('pause');
    expect(parseCommand('resume')).toBe('resume');
  });
});
