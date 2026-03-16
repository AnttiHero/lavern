/**
 * The Shem MCP Server — In-process MCP server providing shared tools.
 *
 * v5: Added evaluator gate tools and generic workflow support.
 * When a WorkflowTemplate is provided (non-legal-design workflows),
 * uses createGenericWorkflowTools instead of the hardcoded workflow engine.
 *
 * v4: Added learning & testing tools (report card, feedback loop, baselines,
 * LEGAL.md compiler, session replay testing).
 *
 * Tools:
 * - Debate Board: Shared state for agent collaboration
 * - Scoring Engine: Computational scoring functions (stateless — shared)
 * - Approval Gate: Human-in-the-loop decision points
 * - Workflow Engine: 10-step state machine with preconditions (or generic engine)
 * - Verification Engine: Self/cross/score verification loops
 * - Memory System: Institutional, matter, and precedent memory
 * - Report Card: Session quality metrics compilation
 * - Feedback Loop: Post-session learning cycle
 * - Baselines: Quality expectations per document type
 * - LEGAL.md Compiler: Human-readable institutional knowledge
 * - Session Replay Testing: Regression detection across sessions
 * - Evaluator Gate: Automated quality checking for specialist deliverables
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { createDebateBoardTools } from './tools/debate-board.js';
import { scoringEngineTools } from './tools/scoring-engine.js';
import { createApprovalTools } from './tools/approval-gate.js';
import { createWorkflowTools } from './tools/workflow-engine.js';
import { createGenericWorkflowTools } from './tools/generic-workflow-engine.js';
import { createVerificationTools } from './tools/verification-engine.js';
import { createMemoryTools } from './tools/memory-system.js';
import { createReportCardTools } from './tools/report-card.js';
import { createFeedbackLoopTools } from './tools/feedback-loop.js';
import { createBaselineTools } from './tools/baselines.js';
import { createLegalMdTools } from './tools/legal-md-compiler.js';
import { createReplayTestingTools } from './tools/session-replay-testing.js';
// v5: Evaluator Gate + Generic Workflow
import { createEvaluatorGateTools } from './tools/evaluator-gate.js';
// v6: Risk Pricing
import { createRiskPricingTools } from './tools/risk-pricing.js';
// v11: Quality Check Iteration Loops
import { createQualityCheckTools } from './tools/quality-check.js';
// Handoff Templates — structured phase-transition summaries
import { createHandoffTools } from './tools/handoff.js';
// v16: Document Structure & Formatting Checks — computational verification
import { createDocumentCheckTools } from './tools/document-checks.js';
// v12: Document Reader
import { createDocumentReaderTools } from './tools/document-reader.js';
// v8: Pre-Engagement
import { createPreEngagementTools } from './tools/pre-engagement.js';
// v15: Knowledge Base
import { createKnowledgeBaseTools } from './tools/knowledge-base.js';
import type { SessionState } from '../session/session-state.js';
import type { WorkflowTemplate } from '../types/workflow.js';
import { config } from '../config.js';

/**
 * Creates the Shem MCP server.
 *
 * @param session - The session state
 * @param template - Optional workflow template. If provided and not 'legal-design',
 *                   uses generic workflow tools instead of hardcoded workflow engine.
 */
export function createShemMcpServer(session: SessionState, template?: WorkflowTemplate) {
  // Use generic workflow engine for non-legal-design templates
  const workflowTools = template && template.id !== 'legal-design'
    ? createGenericWorkflowTools(session, template)
    : createWorkflowTools(session);

  return createSdkMcpServer({
    name: 'shem',
    version: config.version,
    tools: [
      ...createDebateBoardTools(session),
      ...scoringEngineTools,  // Stateless — no session needed
      ...createApprovalTools(session),
      ...workflowTools,
      ...createVerificationTools(session),
      ...createMemoryTools(session),
      // v4: Learning & Testing
      ...createReportCardTools(session),
      ...createFeedbackLoopTools(session),
      ...createBaselineTools(session),
      ...createLegalMdTools(session),
      ...createReplayTestingTools(session),
      // v5: Evaluator Gate
      ...createEvaluatorGateTools(session),
      // v6: Risk Pricing
      ...createRiskPricingTools(session),
      // v8: Pre-Engagement
      ...createPreEngagementTools(session),
      // v11: Quality Check Iteration Loops
      ...createQualityCheckTools(session),
      // v12: Document Reader
      ...createDocumentReaderTools(session),
      // v15: Knowledge Base — searchable reference document collections
      ...createKnowledgeBaseTools(session),
      // Handoff Templates — structured phase-transition summaries
      ...createHandoffTools(session),
      // v16: Document Structure & Formatting Checks
      ...createDocumentCheckTools(session),
    ],
  });
}
