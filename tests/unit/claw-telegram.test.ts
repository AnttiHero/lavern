/**
 * Unit Tests — Claw Telegram (src/claw/notify-telegram.ts)
 *
 * Tests Telegram message formatting. Does not test actual API calls.
 */

import { describe, it, expect } from 'vitest';
import { formatTelegramAlert } from '../../src/claw/notify-telegram.js';

describe('formatTelegramAlert', () => {
  it('wraps title in bold markdown', () => {
    const result = formatTelegramAlert('Test Title', 'Test message');
    expect(result).toContain('*Test Title*');
  });

  it('includes message on second line', () => {
    const result = formatTelegramAlert('Title', 'Message body');
    expect(result).toContain('\n');
    expect(result).toContain('Message body');
  });

  it('escapes Markdown special characters in title', () => {
    const result = formatTelegramAlert('File [NDA] found_issue', 'Test');
    expect(result).not.toContain('[NDA]');
    expect(result).toContain('\\[NDA\\]');
    expect(result).toContain('found\\_issue');
  });

  it('escapes special characters in message', () => {
    const result = formatTelegramAlert('Title', 'Section 4.2: "Company *shall* indemnify"');
    expect(result).toContain('Section 4\\.2');
    expect(result).toContain('\\*shall\\*');
  });

  it('handles empty strings', () => {
    const result = formatTelegramAlert('', '');
    expect(result).toBe('**\n');
  });
});
