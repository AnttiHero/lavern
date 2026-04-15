/**
 * The Shem Orchestrator — Main entry point for the multi-agent system.
 *
 * v3: Refactored for session-based state isolation.
 * All state lives in SessionState. Tools, hooks, and MCP server
 * are created per-session via factory functions.
 *
 * Supports both CLI mode (ReadlineGateResolver) and API mode
 * (AsyncGateResolver) — the session's gateResolver determines behavior.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { retryQuery } from './utils/retry-query.js';
import { orchestratorPrompt } from './agents/prompts/orchestrator.js';
import { agentDefinitions } from './agents/definitions.js';
import { createShemMcpServer } from './mcp/server.js';
import { createAuditHooks, initAuditLog } from './hooks/audit-logger.js';
import { createCostHooks } from './hooks/cost-tracker.js';
import { createGateHooks } from './hooks/human-gate.js';
import { createDynamicPermissions } from './permissions/dynamic-permissions.js';
import { SessionState } from './session/session-state.js';
import { eventTimestamp } from './events/event-bus.js';
import { streamMessages } from './utils/stream-messages.js';
import { handleSessionError } from './utils/error-recovery.js';
import { config } from './config.js';
import type { DocumentContext } from './types/index.js';
import type { GateResolver } from './gates/gate-resolver.js';
import type { EffortLevel } from './types/engagement.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('ORCHESTRATOR');

export interface SchemOptions {
  maxBudgetUsd?: number;
  model?: string;
  maxTurns?: number;
  /** Claude API effort level — controls thinking depth and token spend. */
  effort?: EffortLevel;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  cwd?: string;
  /** Optional pre-created session (for API mode). If not provided, a new one is created. */
  session?: SessionState;
  /** Optional gate resolver override (for API/testing). */
  gateResolver?: GateResolver;
  /** v18: LLM provider override for this session. Overrides global LAVERN_PROVIDER. */
  provider?: 'anthropic' | 'mistral' | 'managed';
}

export async function runTheShem(
  documentPath: string,
  context: DocumentContext,
  options: SchemOptions = {}
): Promise<SessionState> {
  const {
    maxBudgetUsd = config.defaultBudgetUsd,
    model = config.defaultModel,
    maxTurns = config.defaultMaxTurns,
    effort,
    logLevel = config.logLevel,
  } = options;

  // Use provided session or create a new one
  const session = options.session ?? new SessionState(undefined, {
    gateResolver: options.gateResolver,
    budgetUsd: maxBudgetUsd,
  });
  session.budgetUsd = maxBudgetUsd;

  // Initialize audit log
  initAuditLog(session);

  // Note: debug logging is controlled via the SHEM_LOG_LEVEL env var at startup,
  // not mutated per-session. The logLevel option is passed through to streamMessages.

  // Emit session start event
  session.events.emitEvent({
    type: 'session_start',
    sessionId: session.id,
    document: documentPath,
    timestamp: eventTimestamp(),
  });

  logger.info('Starting session', {
    sessionId: session.id,
    document: documentPath,
    context: `${context.moment} | ${context.audience} | ${context.jurisdiction}`,
    budget: maxBudgetUsd.toFixed(2),
    model,
  });

  // Create session-bound factories
  const shemMcpServer = createShemMcpServer(session);
  const { auditLoggerHook, subagentStartHook, subagentStopHook } = createAuditHooks(session);
  const { haltCheckHook, costTrackerHook } = createCostHooks(session);
  const { humanGateEnforcerHook } = createGateHooks(session);

  const prompt = `
Review and redesign the legal document at: ${documentPath}

Context:
- **Moment**: ${context.moment} (when the user encounters this document)
- **Audience**: ${context.audience}
- **Jurisdiction**: ${context.jurisdiction}
${context.documentType ? `- **Document Type**: ${context.documentType}` : ''}
${context.focus ? `- **Focus Area**: ${context.focus}` : ''}

Follow the full orchestration workflow. Start by calling \`get_current_step\` to
see where you are in the workflow, then advance step by step.

The 11-step workflow:
1. INTAKE — Read document, gather context, query memory
2. PARALLEL ANALYSIS — Dispatch ALL 5 analysis agents simultaneously
   (design-reviewer, ethics-auditor, service-designer, plain-language-specialist, client-proxy)
3. DEBATE ROUND 1 — Resolve conflicts, call resolve_debate for each topic
4. HUMAN GATE — If RED ethics findings, request approval (confidence-routed)
5. TRANSFORMATION — Dispatch transformation-specialist with findings + precedents
6. PARALLEL VERIFICATION — Run self/cross/score verification + meaning-guardian + ethics re-check
7. DEBATE ROUND 2 — Resolve transformation challenges
8. HUMAN GATE — If CRITICAL meaning changes, request approval
9. SYNTHESIS — Dispatch synthesis-editor for dual artifacts, save precedents
10. HUMAN GATE — Request final delivery approval
11. DELIVERED — Output delivered

IMPORTANT:
- Use advance_step after completing each step
- Use resolve_debate to formally close EVERY debate topic
- Use get_unresolved_debates before advancing past debate rounds
- Run ALL three verification types after transformation
- Query memory at start, save lessons at end

Produce the complete dual-artifact output with full audit trail.
  `.trim();

  let result;
  try {
    result = retryQuery({
      prompt,
      options: {
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: orchestratorPrompt,
      },
      allowedTools: [
        'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
        // Workflow engine
        'mcp__shem__get_current_step',
        'mcp__shem__advance_step',
        'mcp__shem__get_workflow_history',
        // Debate board
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__get_findings',
        'mcp__shem__get_challenges',
        'mcp__shem__get_unresolved_debates',
        'mcp__shem__get_debate_summary',
        // Scoring engine
        'mcp__shem__calculate_complexity_tax',
        'mcp__shem__calculate_readability_score',
        'mcp__shem__calculate_findability_score',
        'mcp__shem__compare_before_after',
        // Verification engine
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
        'mcp__shem__get_verification_summary',
        // Memory system
        'mcp__shem__add_institutional_memory',
        'mcp__shem__query_institutional_memory',
        'mcp__shem__save_matter_memory',
        'mcp__shem__load_matter_memory',
        'mcp__shem__save_precedent',
        'mcp__shem__query_precedents',
        // Approval gate
        'mcp__shem__request_approval',
        // v4: Report Card
        'mcp__shem__compile_report_card',
        'mcp__shem__get_report_card',
        // v4: Feedback Loop
        'mcp__shem__run_feedback_loop',
        'mcp__shem__update_precedent_effectiveness',
        'mcp__shem__record_anti_pattern',
        'mcp__shem__query_anti_patterns',
        // v4: Baselines
        'mcp__shem__update_baselines',
        'mcp__shem__check_against_baseline',
        'mcp__shem__get_baseline',
        'mcp__shem__get_quality_trend',
        // v4: LEGAL.md
        'mcp__shem__compile_legal_md',
        'mcp__shem__get_legal_md',
        // v4: Session Replay Testing
        'mcp__shem__run_regression_test',
        'mcp__shem__run_batch_regression',
        'mcp__shem__compare_sessions',
        // v5: Evaluator Gate (available but not used in legal-design flow)
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        // v6: Risk Pricing
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      agents: agentDefinitions,
      canUseTool: createDynamicPermissions(session),
      mcpServers: {
        shem: shemMcpServer,
      },
      hooks: {
        PostToolUse: [
          { hooks: [auditLoggerHook] },
        ],
        PreToolUse: [
          { hooks: [haltCheckHook, humanGateEnforcerHook, costTrackerHook] },
        ],
        SubagentStart: [
          { hooks: [subagentStartHook] },
        ],
        SubagentStop: [
          { hooks: [subagentStopHook] },
        ],
      },
      maxBudgetUsd,
      maxTurns,
      model,
      effort,
      cwd: options.cwd,
    },
    }, session);
  } catch (queryError) {
    const sessionError = handleSessionError(session, queryError);
    logger.error('Failed to initialize query', { step: sessionError.step, error: sessionError.cause });
    throw queryError;
  }

  // Stream messages to the console
  try {
    await streamMessages(result, {
      session,
      documentLabel: documentPath,
      logLevel,
    });
  } catch (error) {
    const sessionError = handleSessionError(session, error);
    logger.error('Session error', { step: sessionError.step, error: sessionError.cause });
    throw error;
  }

  return session;
}
