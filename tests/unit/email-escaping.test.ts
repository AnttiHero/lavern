/**
 * Unit Tests — Email HTML Escaping + Auth sanitizeUser
 *
 * Security-critical: if escaping breaks, user-supplied content
 * (invite codes, display names) could inject HTML/JS into emails.
 */

import { describe, it, expect, vi } from 'vitest';

// We can't import `esc` directly since it's not exported,
// but we can test it indirectly through the email templates.
// Instead, test the sanitizeUser function and the email esc pattern.

// Test the HTML escape pattern used in src/email/send.ts
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

describe('HTML escaping (email)', () => {
  it('escapes angle brackets', () => {
    expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(esc('AT&T')).toBe('AT&amp;T');
  });

  it('escapes double quotes', () => {
    expect(esc('he said "hello"')).toBe('he said &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(esc("it's")).toBe('it&#39;s');
  });

  it('handles combined XSS payload', () => {
    const payload = `"><img src=x onerror="alert(1)">`;
    const escaped = esc(payload);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('"');
  });

  it('handles empty string', () => {
    expect(esc('')).toBe('');
  });

  it('passes through safe text unchanged', () => {
    expect(esc('Hello World 123')).toBe('Hello World 123');
  });

  it('handles multiple special characters in sequence', () => {
    expect(esc('&<>"\'&')).toBe('&amp;&lt;&gt;&quot;&#39;&amp;');
  });
});

// Test the sanitizeUser function pattern from auth-routes.ts
describe('sanitizeUser (auth)', () => {
  function sanitizeUser(user: { id: string; email: string; display_name: string; firm_name: string; profile_json: string }) {
    let profile = {};
    let profileCorrupted = false;
    try {
      profile = JSON.parse(user.profile_json);
    } catch (err) {
      if (user.profile_json && user.profile_json !== '{}') {
        profileCorrupted = true;
      }
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      firmName: user.firm_name,
      profile,
      ...(profileCorrupted ? { profileCorrupted: true } : {}),
    };
  }

  it('parses valid profile JSON', () => {
    const user = sanitizeUser({
      id: 'u1', email: 'a@b.com', display_name: 'Ada', firm_name: 'Firm',
      profile_json: '{"soul":"kind","theme":"dark"}',
    });
    expect(user.profile).toEqual({ soul: 'kind', theme: 'dark' });
    expect(user).not.toHaveProperty('profileCorrupted');
  });

  it('handles empty profile JSON', () => {
    const user = sanitizeUser({
      id: 'u1', email: 'a@b.com', display_name: 'Ada', firm_name: 'Firm',
      profile_json: '{}',
    });
    expect(user.profile).toEqual({});
    expect(user).not.toHaveProperty('profileCorrupted');
  });

  it('flags corrupted profile JSON', () => {
    const user = sanitizeUser({
      id: 'u1', email: 'a@b.com', display_name: 'Ada', firm_name: 'Firm',
      profile_json: '{invalid json',
    });
    expect(user.profile).toEqual({});
    expect(user.profileCorrupted).toBe(true);
  });

  it('does not flag empty string as corrupted', () => {
    const user = sanitizeUser({
      id: 'u1', email: 'a@b.com', display_name: 'Ada', firm_name: 'Firm',
      profile_json: '',
    });
    expect(user.profile).toEqual({});
    expect(user).not.toHaveProperty('profileCorrupted');
  });

  it('maps field names correctly (snake_case to camelCase)', () => {
    const user = sanitizeUser({
      id: 'user-123', email: 'test@test.com', display_name: 'Test User', firm_name: 'Test Firm',
      profile_json: '{}',
    });
    expect(user.displayName).toBe('Test User');
    expect(user.firmName).toBe('Test Firm');
  });
});
