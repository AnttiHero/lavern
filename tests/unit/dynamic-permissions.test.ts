/**
 * Unit Tests — Dynamic Permissions (src/permissions/dynamic-permissions.ts)
 *
 * Tests the phase-based tool permission system that controls
 * which MCP tools agents can use at each workflow step.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDynamicPermissions } from '../../src/permissions/dynamic-permissions.js';

// Mock config
vi.mock('../../src/config.js', () => ({
  config: {
    maxBudgetUsd: 10,
    maxTurns: 50,
    auditLogDir: './test-audit',
    claw: { dir: '/tmp/claw-test' },
    provider: 'anthropic',
  },
}));

// Mock gate-resolver
vi.mock('../../src/gates/gate-resolver.js', () => ({
  createDefaultGateResolver: () => async () => ({ approved: true }),
}));

// Minimal session mock
function mockSession(currentStep = 'intake') {
  return {
    workflow: { currentStep },
    genericWorkflow: { currentStep },
    events: { emitEvent: vi.fn() },
  } as any;
}

function makeToolUseOptions(opts: { agentID?: string } = {}) {
  return {
    signal: new AbortController().signal,
    toolUseID: 'test-tool-use-1',
    ...opts,
  };
}

describe('createDynamicPermissions', () => {
  describe('non-MCP tools', () => {
    it('allows non-shem tools unconditionally', async () => {
      const session = mockSession('intake');
      const canUseTool = createDynamicPermissions(session);
      const result = await canUseTool('mcp__other__some_tool', {}, makeToolUseOptions());
      expect(result.behavior).toBe('allow');
    });

    it('allows standard SDK tools', async () => {
      const session = mockSession('intake');
      const canUseTool = createDynamicPermissions(session);
      const result = await canUseTool('read_file', {}, makeToolUseOptions());
      expect(result.behavior).toBe('allow');
    });
  });

  describe('orchestrator-only tools', () => {
    const orchestratorTools = [
      'mcp__shem__advance_step',
      'mcp__shem__resolve_debate',
      'mcp__shem__request_approval',
      'mcp__shem__compile_report_card',
      'mcp__shem__run_feedback_loop',
      'mcp__shem__update_baselines',
      'mcp__shem__compile_legal_md',
      'mcp__shem__update_precedent_effectiveness',
    ];

    it('denies orchestrator-only tools to subagents', async () => {
      const session = mockSession('delivered');
      const canUseTool = createDynamicPermissions(session);

      for (const tool of orchestratorTools) {
        const result = await canUseTool(tool, {}, makeToolUseOptions({ agentID: 'sub-1' }));
        expect(result.behavior).toBe('deny');
      }
    });

    it('allows orchestrator-only tools to orchestrator (no agentID) when phase permits', async () => {
      // 'delivered' phase allows learning cycle tools for orchestrator
      // but denies resolve_debate — so test only the ones allowed in delivered
      const session = mockSession('delivered');
      const canUseTool = createDynamicPermissions(session);

      const deliveredAllowed = [
        'mcp__shem__advance_step',
        'mcp__shem__request_approval',
        'mcp__shem__compile_report_card',
        'mcp__shem__run_feedback_loop',
        'mcp__shem__update_baselines',
        'mcp__shem__compile_legal_md',
        'mcp__shem__update_precedent_effectiveness',
      ];

      for (const tool of deliveredAllowed) {
        const result = await canUseTool(tool, {}, makeToolUseOptions());
        expect(result.behavior).toBe('allow');
      }
    });
  });

  describe('legacy phase deny rules', () => {
    it('denies debate tools during intake phase', async () => {
      const session = mockSession('intake');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__post_challenge', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
    });

    it('allows reading tools during intake', async () => {
      const session = mockSession('intake');
      const canUseTool = createDynamicPermissions(session);

      // post_finding is not in intake deny list
      const result = await canUseTool('mcp__shem__post_finding', {}, makeToolUseOptions());
      expect(result.behavior).toBe('allow');
    });

    it('denies verification tools during analysis', async () => {
      const session = mockSession('parallel_analysis');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__run_self_verification', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
    });

    it('allows debate tools during debate_1', async () => {
      const session = mockSession('debate_1');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__post_challenge', {}, makeToolUseOptions());
      expect(result.behavior).toBe('allow');
    });

    it('denies new findings in synthesis phase', async () => {
      const session = mockSession('synthesis');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__post_finding', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
    });

    it('denies feedback loop tools in synthesis phase', async () => {
      const session = mockSession('synthesis');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__run_feedback_loop', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
    });

    it('denies debate during delivered phase', async () => {
      const session = mockSession('delivered');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__post_finding', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
    });

    it('includes reason in denial message', async () => {
      const session = mockSession('intake');
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool('mcp__shem__post_challenge', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.message).toContain('intake');
        expect(result.message).toContain('post_challenge');
      }
    });
  });

  describe('template phase permissions', () => {
    it('uses template phasePermissions when provided', async () => {
      const session = mockSession('analysis');
      const template = {
        phasePermissions: {
          analysis: {
            denyTools: ['mcp__shem__post_challenge'],
            reason: 'Analysis only — no challenges.',
          },
        },
      } as any;

      const canUseTool = createDynamicPermissions(session, template);
      const result = await canUseTool('mcp__shem__post_challenge', {}, makeToolUseOptions());
      expect(result.behavior).toBe('deny');
    });

    it('allows tools not in template deny list', async () => {
      const session = mockSession('analysis');
      const template = {
        phasePermissions: {
          analysis: {
            denyTools: ['mcp__shem__post_challenge'],
            reason: 'Analysis only — no challenges.',
          },
        },
      } as any;

      const canUseTool = createDynamicPermissions(session, template);
      const result = await canUseTool('mcp__shem__post_finding', {}, makeToolUseOptions());
      expect(result.behavior).toBe('allow');
    });

    it('allows all shem tools when step has no rules', async () => {
      const session = mockSession('unknown_step');
      const template = {
        phasePermissions: {},
      } as any;

      const canUseTool = createDynamicPermissions(session, template);
      const result = await canUseTool('mcp__shem__post_challenge', {}, makeToolUseOptions());
      expect(result.behavior).toBe('allow');
    });
  });
});
