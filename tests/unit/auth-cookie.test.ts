/**
 * Unit Tests — Auth Cookie Parsing (src/api/middleware/auth.ts)
 *
 * Tests parseCookieToken which extracts the lavern_token
 * from cookie headers. Security-critical — wrong parsing
 * could lead to auth bypass.
 */

import { describe, it, expect } from 'vitest';
import { parseCookieToken } from '../../src/api/middleware/auth.js';

describe('parseCookieToken', () => {
  it('extracts token from simple cookie header', () => {
    expect(parseCookieToken('lavern_token=abc123')).toBe('abc123');
  });

  it('extracts token from multi-cookie header', () => {
    expect(parseCookieToken('other=val; lavern_token=abc123; another=foo')).toBe('abc123');
  });

  it('returns null when no cookie header', () => {
    expect(parseCookieToken(undefined)).toBeNull();
    expect(parseCookieToken('')).toBeNull();
  });

  it('returns null when token not present', () => {
    expect(parseCookieToken('other_token=abc123')).toBeNull();
    expect(parseCookieToken('session=xyz')).toBeNull();
  });

  it('returns null for empty token value', () => {
    expect(parseCookieToken('lavern_token=')).toBeNull();
  });

  it('handles whitespace around token', () => {
    expect(parseCookieToken('  lavern_token=abc123  ')).toBe('abc123');
  });

  it('handles token with special characters', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.dXNlcjE';
    expect(parseCookieToken(`lavern_token=${token}`)).toBe(token);
  });

  it('does not match partial cookie names', () => {
    // "my_lavern_token" should not match
    expect(parseCookieToken('my_lavern_token=abc123')).toBeNull();
  });

  it('handles token with equals sign in value', () => {
    // Base64 tokens can contain = padding
    expect(parseCookieToken('lavern_token=abc123==')).toBe('abc123==');
  });
});
