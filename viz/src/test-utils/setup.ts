/**
 * Vitest setup — extends matchers and provides global mocks.
 */

import '@testing-library/jest-dom/vitest';

// ── Mock sessionStorage ──────────────────────────────────────────────────

const store: Record<string, string> = {};

const mockSessionStorage: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
};

Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

// Clear between tests
beforeEach(() => {
  mockSessionStorage.clear();
});

// ── Mock fetch ────────────────────────────────────────────────────────────

beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error (test)'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Mock IntersectionObserver (used by some components) ───────────────────

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  value: MockIntersectionObserver,
});

// ── Mock matchMedia ──────────────────────────────────────────────────────

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});


// ── Inert WebSocket / EventSource ────────────────────────────────────────
// jsdom's WebSocket opens a real socket (and Node's fetch may be reached
// through it), which surfaced as undici "invalid onError method" unhandled
// rejections in WorkingView tests. Components under test must never touch
// the network.
class InertWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0; url: string; onopen: unknown = null; onmessage: unknown = null; onerror: unknown = null; onclose: unknown = null;
  constructor(url: string) { this.url = url; }
  send(): void {} close(): void { this.readyState = 3; }
  addEventListener(): void {} removeEventListener(): void {}
}
// @ts-expect-error test double
globalThis.WebSocket = InertWebSocket;
// @ts-expect-error test double
globalThis.EventSource = class { close(): void {} addEventListener(): void {} removeEventListener(): void {} };
