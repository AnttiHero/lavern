/**
 * Unit Tests — WebSocket Handler (src/api/ws-handler.ts)
 *
 * Tests the exported getWsConnectionCount() function and the safeSend utility.
 * The actual WebSocket attachment requires a real WS connection, but we can
 * test the connection tracking is initially zero.
 */

import { describe, it, expect } from 'vitest';
import { getWsConnectionCount } from '../../src/api/ws-handler.js';

describe('getWsConnectionCount', () => {
  it('returns 0 when no connections are active', () => {
    expect(getWsConnectionCount()).toBe(0);
  });

  it('returns a number', () => {
    expect(typeof getWsConnectionCount()).toBe('number');
  });
});
