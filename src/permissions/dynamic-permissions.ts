/**
 * Dynamic Permissions — Phase-aware CanUseTool implementation.
 *
 * v5: Supports both legacy PHASE_DENY_RULES (legal-design pipeline)
 * and generic WorkflowTemplate.phasePermissions (new workflows).
 *
 * Even if an agent prompt is ignored, the permission system blocks
 * unauthorized tool use based on the current workflow phase.
 */

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../session/session-state.js';
import type { WorkflowStep } from '../types/workflow.js';
import type { WorkflowTemplate } from '../types/workflow.js';

/**
 * Phase-based tool permission rules.
 * Each phase defines which MCP tools are DENIED (everything else is allowed).
 */
const PHASE_DENY_RULES: Record<WorkflowStep, { denyTools: string[]; reason: string }> = {
  intake: {
    denyTools: [
      'mcp__shem__post_challenge',
      'mcp__shem__post_response',
      'mcp__shem__resolve_debate',
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
      'mcp__shem__record_pass_result',
      'mcp__shem__compile_verification_report',
    ],
    reason: 'Intake phase: only reading, memory queries, and context gathering allowed.',
  },
  parallel_analysis: {
    denyTools: [
      'mcp__shem__post_challenge',
      'mcp__shem__post_response',
      'mcp__shem__resolve_debate',
      'mcp__shem__advance_step',
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
      'mcp__shem__record_pass_result',
      'mcp__shem__compile_verification_report',
    ],
    reason: 'Analysis phase: agents post findings but do not challenge or resolve.',
  },
  debate_1: {
    denyTools: [
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
      'mcp__shem__save_precedent',
    ],
    reason: 'Debate phase 1: challenges, responses, and resolutions allowed.',
  },
  ethics_gate: {
    denyTools: [
      'mcp__shem__post_finding',
      'mcp__shem__post_challenge',
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
    ],
    reason: 'Ethics gate: only approval decisions and reading allowed.',
  },
  transformation: {
    denyTools: [
      'mcp__shem__calculate_complexity_tax',
      'mcp__shem__calculate_readability_score',
      'mcp__shem__calculate_findability_score',
      'mcp__shem__resolve_debate',
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
      'mcp__shem__record_pass_result',
      'mcp__shem__compile_verification_report',
    ],
    reason: 'Transformation phase: focus on rewriting, not scoring or verifying.',
  },
  parallel_verification: {
    denyTools: [
      'mcp__shem__save_precedent',
      'mcp__shem__resolve_debate',
    ],
    reason: 'Verification phase: run all verification types + re-check agents.',
  },
  debate_2: {
    denyTools: [
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
      'mcp__shem__save_precedent',
    ],
    reason: 'Debate phase 2: resolve transformation challenges.',
  },
  meaning_gate: {
    denyTools: [
      'mcp__shem__post_finding',
      'mcp__shem__post_challenge',
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
    ],
    reason: 'Meaning gate: only approval decisions and reading allowed.',
  },
  synthesis: {
    denyTools: [
      'mcp__shem__post_finding',
      'mcp__shem__post_challenge',
      'mcp__shem__post_response',
      'mcp__shem__resolve_debate',
      'mcp__shem__run_self_verification',
      'mcp__shem__run_cross_verification',
      'mcp__shem__run_score_verification',
      // v4: Feedback loop tools only allowed in 'delivered' phase
      'mcp__shem__run_feedback_loop',
      'mcp__shem__update_baselines',
      'mcp__shem__record_anti_pattern',
    ],
    reason: 'Synthesis phase: assemble artifacts, save precedents, compile report card. No debate or feedback loop.',
  },
  final_gate: {
    denyTools: [
      'mcp__shem__post_finding',
      'mcp__shem__post_challenge',
      'mcp__shem__post_response',
      'mcp__shem__resolve_debate',
      'mcp__shem__save_precedent',
    ],
    reason: 'Final gate: only approval decisions and reading allowed.',
  },
  delivered: {
    denyTools: [
      // No new analysis or debate in delivered phase
      'mcp__shem__post_finding',
      'mcp__shem__post_challenge',
      'mcp__shem__post_response',
      'mcp__shem__resolve_debate',
    ],
    reason: 'Delivered: run learning cycle (report card, feedback loop, baselines, LEGAL.md).',
  },
};

const ORCHESTRATOR_ONLY_TOOLS = [
  'mcp__shem__advance_step',
  'mcp__shem__resolve_debate',
  'mcp__shem__request_approval',
  // v4: Learning cycle tools are orchestrator-only
  'mcp__shem__compile_report_card',
  'mcp__shem__run_feedback_loop',
  'mcp__shem__update_baselines',
  'mcp__shem__compile_legal_md',
  'mcp__shem__update_precedent_effectiveness',
];

/**
 * Creates the CanUseTool callback bound to a specific session.
 *
 * If a WorkflowTemplate is provided, uses its phasePermissions for deny rules.
 * Otherwise, uses the legacy PHASE_DENY_RULES (legal-design pipeline).
 */
export const createDynamicPermissions = (
  session: SessionState,
  template?: WorkflowTemplate,
): CanUseTool => {
  return async (
    toolName: string,
    _input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      suggestions?: unknown[];
      blockedPath?: string;
      decisionReason?: string;
      toolUseID: string;
      agentID?: string;
    }
  ): Promise<PermissionResult> => {
    if (!toolName.startsWith('mcp__shem__')) {
      return { behavior: 'allow', toolUseID: options.toolUseID };
    }

    const isSubagent = options.agentID !== undefined;

    if (isSubagent && ORCHESTRATOR_ONLY_TOOLS.includes(toolName)) {
      return {
        behavior: 'deny',
        message: `Tool "${toolName}" can only be called by the orchestrator, not by subagents.`,
        toolUseID: options.toolUseID,
      };
    }

    // v5: Use template phasePermissions if available (generic workflows)
    if (template?.phasePermissions) {
      const currentStep = session.genericWorkflow?.currentStep ?? session.workflow.currentStep;
      const stepRules = template.phasePermissions[currentStep];

      if (stepRules && stepRules.denyTools.includes(toolName)) {
        const shortToolName = toolName.replace('mcp__shem__', '');
        return {
          behavior: 'deny',
          message: `Tool "${shortToolName}" is not available during the "${currentStep}" step. ${stepRules.reason}`,
          toolUseID: options.toolUseID,
        };
      }

      return { behavior: 'allow', toolUseID: options.toolUseID };
    }

    // Legacy path: use PHASE_DENY_RULES (legal-design pipeline)
    const currentPhase = session.workflow.currentStep;
    const phaseRules = PHASE_DENY_RULES[currentPhase];

    if (phaseRules && phaseRules.denyTools.includes(toolName)) {
      const shortToolName = toolName.replace('mcp__shem__', '');
      return {
        behavior: 'deny',
        message: `Tool "${shortToolName}" is not available during the "${currentPhase}" phase. ${phaseRules.reason}`,
        toolUseID: options.toolUseID,
      };
    }

    return { behavior: 'allow', toolUseID: options.toolUseID };
  };
};
