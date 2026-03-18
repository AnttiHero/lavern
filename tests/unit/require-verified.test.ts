/**
 * Unit Tests — Email Verification Middleware (src/api/middleware/require-verified.ts)
 *
 * Tests:
 * - Skips when no userId (anonymous/public)
 * - Skips for API clients (Bearer auth)
 * - Skips for GET/HEAD/OPTIONS methods
 * - Skips for exempt paths
 * - Blocks unverified user with 403 + EMAIL_NOT_VERIFIED
 * - Allows verified user through
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database module before importing
vi.mock('../../src/db/database.js', () => ({
  isEmailVerified: vi.fn(),
}));

import { createRequireVerifiedHook } from '../../src/api/middleware/require-verified.js';
import { isEmailVerified } from '../../src/db/database.js';

const mockedIsEmailVerified = vi.mocked(isEmailVerified);

function mockRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    url: '/api/sessions',
    ...overrides,
  } as unknown as Parameters<ReturnType<typeof createRequireVerifiedHook>>[0];
}

function mockReply() {
  const reply: Record<string, unknown> = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply as unknown as Parameters<ReturnType<typeof createRequireVerifiedHook>>[1];
}

describe('createRequireVerifiedHook', () => {
  const exemptPrefixes = ['/api/auth/', '/api/billing/'];
  let hook: ReturnType<typeof createRequireVerifiedHook>;

  beforeEach(() => {
    vi.clearAllMocks();
    hook = createRequireVerifiedHook(exemptPrefixes);
  });

  it('skips when no userId (anonymous request)', async () => {
    const req = mockRequest();
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(mockedIsEmailVerified).not.toHaveBeenCalled();
  });

  it('skips for API clients (Bearer auth)', async () => {
    const req = mockRequest({ userId: 'user-1', client: { type: 'agent' } });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(mockedIsEmailVerified).not.toHaveBeenCalled();
  });

  it('skips for GET requests', async () => {
    const req = mockRequest({ userId: 'user-1', method: 'GET' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('skips for HEAD requests', async () => {
    const req = mockRequest({ userId: 'user-1', method: 'HEAD' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('skips for OPTIONS requests', async () => {
    const req = mockRequest({ userId: 'user-1', method: 'OPTIONS' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('skips for exempt path /api/auth/login', async () => {
    const req = mockRequest({ userId: 'user-1', url: '/api/auth/login' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(mockedIsEmailVerified).not.toHaveBeenCalled();
  });

  it('skips for exempt path /api/billing/webhook', async () => {
    const req = mockRequest({ userId: 'user-1', url: '/api/billing/webhook' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('blocks unverified user with 403', async () => {
    mockedIsEmailVerified.mockReturnValue(false);
    const req = mockRequest({ userId: 'user-1' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EMAIL_NOT_VERIFIED',
    }));
  });

  it('allows verified user through', async () => {
    mockedIsEmailVerified.mockReturnValue(true);
    const req = mockRequest({ userId: 'user-1' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(mockedIsEmailVerified).toHaveBeenCalledWith('user-1');
  });

  it('strips query params before matching exempt paths', async () => {
    const req = mockRequest({ userId: 'user-1', url: '/api/auth/resend-verification?retry=1' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('does not exempt non-matching paths', async () => {
    mockedIsEmailVerified.mockReturnValue(false);
    const req = mockRequest({ userId: 'user-1', url: '/api/engage' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('returns correct error shape', async () => {
    mockedIsEmailVerified.mockReturnValue(false);
    const req = mockRequest({ userId: 'user-1' });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
      detail: 'Please verify your email address before using Lavern.',
    });
  });
});
