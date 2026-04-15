/**
 * Unit tests — Remote MCP Bridge live dispatcher (Stage 2).
 *
 * Tests the dispatch surface without standing up Fastify or a real
 * SessionManager. We fake the SessionState fields the dispatched tools
 * actually read — the in-process tool factories don't care that the
 * object isn't a real SessionState instance as long as the shape matches.
 */

import { describe, it, expect } from 'vitest';
import {
  dispatchCounselTool,
  buildCounselToolsListing,
  buildCounselToolRegistry,
} from '../../src/mcp/remote-bridge/dispatcher.js';
import type { SessionState } from '../../src/session/session-state.js';

// Minimal SessionState stand-in. Tools we test read `session.workflow`,
// `session.memoryDir`, and `session.events.emitEvent`. Anything unread is
// left off — the dispatcher never touches those fields.
function fakeSession(): SessionState {
  return {
    id: 'sess_test',
    workflow: {
      currentStep: 'intake',
      completedSteps: [],
      gateDecisions: {},
      startedAt: '2026-04-15T00:00:00Z',
      lastTransitionAt: '2026-04-15T00:00:00Z',
    },
    // createMemoryTools reads memoryDir but we won't call memory tools here.
    memoryDir: '/tmp/lavern-bridge-test',
    events: {
      emitEvent: () => { /* no-op */ },
    },
  } as unknown as SessionState;
}

describe('bridge dispatcher — registry', () => {
  it('builds a registry containing exactly the 12 Counsel tools', () => {
    const registry = buildCounselToolRegistry(fakeSession());
    // The 12 prefixed names in the allowlist map to 12 internal names in the
    // registry. If any factory regresses and drops a tool, this catches it.
    expect(registry.size).toBe(12);
    expect(registry.has('get_current_step')).toBe(true);
    expect(registry.has('search_knowledge_base')).toBe(true);
    expect(registry.has('query_precedents')).toBe(true);
  });

  it('tools/list payload preserves MCP-prefixed names and adds JSON-Schema inputs', () => {
    const listing = buildCounselToolsListing(fakeSession());
    expect(listing).toHaveLength(12);
    const byName = Object.fromEntries(listing.map((t) => [t.name, t]));
    expect(byName['mcp__shem__get_current_step']).toBeDefined();
    // JSON Schema for an empty-arg tool is still an object schema.
    expect(byName['mcp__shem__get_current_step'].inputSchema.type).toBe('object');
    // A tool with args produces a `properties` block describing them.
    const searchSchema = byName['mcp__shem__search_knowledge_base'].inputSchema;
    expect(searchSchema.type).toBe('object');
    expect((searchSchema.properties as Record<string, unknown>).query).toBeDefined();
  });
});

describe('bridge dispatcher — dispatch outcomes', () => {
  it('rejects a tool outside the allowlist', async () => {
    const outcome = await dispatchCounselTool(fakeSession(), 'mcp__shem__post_finding', {});
    expect(outcome.kind).toBe('not_allowed');
  });

  it('rejects an unprefixed tool name', async () => {
    // Clients must use the canonical mcp__<server>__ prefix; bare internal
    // names should never resolve through the remote surface.
    const outcome = await dispatchCounselTool(fakeSession(), 'get_current_step', {});
    expect(outcome.kind).toBe('not_allowed');
  });

  it('returns invalid_args when a required arg is missing', async () => {
    // search_knowledge_base requires a non-empty `query` string.
    const outcome = await dispatchCounselTool(fakeSession(), 'mcp__shem__search_knowledge_base', {});
    expect(outcome.kind).toBe('invalid_args');
    if (outcome.kind === 'invalid_args') {
      expect(outcome.message.toLowerCase()).toContain('query');
    }
  });

  it('returns invalid_args when a string arg fails min-length', async () => {
    const outcome = await dispatchCounselTool(
      fakeSession(),
      'mcp__shem__search_knowledge_base',
      { query: '' },
    );
    expect(outcome.kind).toBe('invalid_args');
  });

  it('runs a real handler and returns its CallToolResult', async () => {
    // get_current_step is schema-empty and reads only session.workflow, so
    // it's the clean canary for end-to-end dispatch with no side effects.
    const outcome = await dispatchCounselTool(fakeSession(), 'mcp__shem__get_current_step', {});
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      const result = outcome.result as { content: Array<{ type: string; text: string }> };
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Workflow Status');
      expect(result.content[0].text).toContain('intake');
    }
  });
});
