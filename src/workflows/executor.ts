/**
 * Generic Workflow Executor — Runs any workflow template.
 *
 * v5: This is the generic counterpart to `runTheShem()` in orchestrator.ts.
 * `runTheShem()` runs the hardcoded legal-design pipeline.
 * `runGenericWorkflow()` runs any WorkflowTemplate.
 *
 * Follows the same pattern as runTheShem():
 * - Creates session-bound MCP server
 * - Creates audit/cost/gate hooks
 * - Builds prompt from template.orchestratorPrompt + request details
 * - Calls query() with dynamic permissions
 * - Streams messages to console
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { agentDefinitions } from '../agents/definitions.js';
import { agentProfiles } from '../agents/profiles.js';
import { getOrchestratorForWorkflow } from './orchestrator-mapping.js';
import { createShemMcpServer } from '../mcp/server.js';
import { createAuditHooks, initAuditLog } from '../hooks/audit-logger.js';
import { createCostHooks } from '../hooks/cost-tracker.js';
import { createGateHooks } from '../hooks/human-gate.js';
import { createDynamicPermissions } from '../permissions/dynamic-permissions.js';
import { SessionState } from '../session/session-state.js';
import { eventTimestamp } from '../events/event-bus.js';
import { streamMessages } from '../utils/stream-messages.js';
import { handleSessionError } from '../utils/error-recovery.js';
import { config } from '../config.js';
import type { LegalRequest, RouterClassification } from '../types/index.js';
import type { WorkflowTemplate } from '../types/workflow.js';
import type { SchemOptions } from '../orchestrator.js';

export async function runGenericWorkflow(
  request: LegalRequest,
  template: WorkflowTemplate,
  classification: RouterClassification,
  session: SessionState,
  options: SchemOptions = {},
): Promise<SessionState> {
  const {
    maxBudgetUsd = config.defaultBudgetUsd,
    model = config.defaultModel,
    maxTurns = config.genericMaxTurns,
    effort,
    logLevel = config.logLevel,
  } = options;

  session.budgetUsd = maxBudgetUsd;
  session.workflowTemplateId = template.id;

  // Initialize audit log
  initAuditLog(session);

  if (logLevel === 'debug') {
    process.env.SHEM_LOG_LEVEL = 'debug';
  }

  // Emit session start event
  session.events.emitEvent({
    type: 'session_start',
    sessionId: session.id,
    document: request.documentPath ?? request.requestText ?? '(no document)',
    timestamp: eventTimestamp(),
  });

  console.log(`
\u2554${'═'.repeat(62)}\u2557
\u2551                        THE SHEM v6                           \u2551
\u2551              "We know what's written in the Golem's mouth"   \u2551
\u255a${'═'.repeat(62)}\u255d

Session: ${session.id}
Workflow: ${template.id} (${template.name})
Request Type: ${classification.requestType}
Complexity: ${classification.complexity}
${request.documentPath ? `Document: ${request.documentPath}` : ''}
${request.requestText ? `Request: ${request.requestText.substring(0, 100)}...` : ''}
Budget: $${maxBudgetUsd.toFixed(2)}
Model: ${model}
Specialists: ${classification.selectedSpecialists.join(', ')}
`);

  // Create session-bound factories (pass template for generic workflow tools + permissions)
  const shemMcpServer = createShemMcpServer(session, template);
  const { auditLoggerHook, subagentStartHook, subagentStopHook } = createAuditHooks(session);
  const { haltCheckHook, costTrackerHook } = createCostHooks(session);
  const { humanGateEnforcerHook } = createGateHooks(session);

  // Build prompt from template + request (includes document context if documents are loaded)
  const prompt = buildPromptFromRequest(request, template, classification, session);

  // Filter agent definitions to only those needed by this workflow
  // v8: When a client has selected a team, use those agents instead of template defaults
  // v11: Team size cap is now configurable per template (default 8, full-bench allows 25)
  const DEFAULT_MAX_TEAM_SIZE = 8;
  const maxTeamSize = template.maxTeamSize ?? DEFAULT_MAX_TEAM_SIZE;
  const rawTeamRoles = session.selectedTeam.length > 0
    ? session.selectedTeam
    : template.requiredAgents;
  const teamRoles = rawTeamRoles.slice(0, maxTeamSize);
  if (rawTeamRoles.length > maxTeamSize) {
    console.error(`[TEAM] Capped team from ${rawTeamRoles.length} to ${maxTeamSize} agents`);
  }
  const filteredAgents: Record<string, typeof agentDefinitions[keyof typeof agentDefinitions]> = {};
  for (const role of teamRoles) {
    if (role in agentDefinitions) {
      filteredAgents[role] = agentDefinitions[role as keyof typeof agentDefinitions];
    }
  }
  // Always include evaluator if the workflow has evaluator gates
  const hasEvaluatorGate = Object.values(template.stepDefinitions).some(s => s.requiresEvaluatorGate);
  if (hasEvaluatorGate && 'evaluator' in agentDefinitions) {
    filteredAgents['evaluator'] = agentDefinitions['evaluator'];
  }

  // v11: Resolve orchestrator personality from profile
  const orchestratorRole = template.orchestratorArchetype
    ?? getOrchestratorForWorkflow(template.id);
  const orchestratorProfile = orchestratorRole ? agentProfiles[orchestratorRole] : undefined;
  const personalityPrefix = orchestratorProfile
    ? `\n## Your Orchestrator Personality\nYou are "${orchestratorProfile.displayName}" — ${orchestratorProfile.tagline}\nWork style: ${orchestratorProfile.personality.workStyle}\n\n`
    : '';

  const result = query({
    prompt,
    options: {
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: personalityPrefix + template.orchestratorPrompt,
      },
      allowedTools: template.availableTools,
      agents: filteredAgents,
      canUseTool: createDynamicPermissions(session, template),
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
  });

  // Stream messages to console
  try {
    await streamMessages(result, {
      session,
      documentLabel: request.documentPath ?? '(no document)',
      workflowLabel: template.id,
      logLevel,
    });
  } catch (error) {
    const sessionError = handleSessionError(session, error);
    console.error(`The Shem (${template.id}) encountered an error at step "${sessionError.step}":`, sessionError.cause);
    throw error;
  }

  return session;
}

/**
 * Build the orchestrator prompt from a request and template.
 */
function buildPromptFromRequest(
  request: LegalRequest,
  template: WorkflowTemplate,
  classification: RouterClassification,
  session: SessionState,
): string {
  const parts: string[] = [];

  // Request details
  if (request.documentPath) {
    parts.push(`Analyze the document at: ${request.documentPath}`);
  }
  if (request.requestText) {
    parts.push(`Request: ${request.requestText}`);
  }

  // Context
  if (request.context) {
    const ctx = request.context;
    const contextParts: string[] = [];
    if (ctx.moment) contextParts.push(`**Moment**: ${ctx.moment}`);
    if (ctx.audience) contextParts.push(`**Audience**: ${ctx.audience}`);
    if (ctx.jurisdiction) contextParts.push(`**Jurisdiction**: ${ctx.jurisdiction}`);
    if (ctx.documentType) contextParts.push(`**Document Type**: ${ctx.documentType}`);
    if (ctx.focus) contextParts.push(`**Focus Area**: ${ctx.focus}`);
    if (contextParts.length > 0) {
      parts.push(`\nContext:\n${contextParts.map(c => `- ${c}`).join('\n')}`);
    }
  }

  // v12: Document context — tell agents what documents are available
  if (session.documents.length > 0) {
    parts.push('\n--- UPLOADED DOCUMENTS ---');
    parts.push(`${session.documents.length} document(s) have been uploaded for this session:\n`);
    for (let i = 0; i < session.documents.length; i++) {
      const doc = session.documents[i];
      const headings = doc.sections.slice(0, 10).map(s => s.heading).join(', ');
      parts.push(`${i + 1}. **${doc.name}** — ${doc.pageCount} pages, ${doc.wordCount.toLocaleString()} words`);
      if (headings) parts.push(`   Sections: ${headings}`);
      if (doc.definedTerms.length > 0) {
        parts.push(`   Defined terms: ${doc.definedTerms.slice(0, 10).join(', ')}${doc.definedTerms.length > 10 ? '...' : ''}`);
      }
    }
    parts.push('');
    parts.push('**IMPORTANT:** Use `list_documents` to see the full table of contents, then use `read_document_section` and `search_document` to access specific content. Do NOT rely solely on the request text — analyze the actual documents.');
    parts.push('--- END DOCUMENTS ---\n');
  }

  // Classification info
  parts.push(`\nRouter Classification:`);
  parts.push(`- Request Type: ${classification.requestType}`);
  parts.push(`- Complexity: ${classification.complexity}`);
  parts.push(`- Risk Level: ${classification.riskLevel}`);
  parts.push(`- Selected Specialists: ${classification.selectedSpecialists.join(', ')}`);
  if (classification.requiresDebate) parts.push(`- Debate rounds required`);
  if (classification.requiresEthicsFirst) parts.push(`- Ethics-first review required`);
  if (classification.requiresConsistencyCheck) parts.push(`- Consistency check required`);

  // Workflow instructions
  parts.push(`\nFollow the ${template.id} workflow. Start by calling \`get_current_step\` to see where you are.`);
  parts.push(`Use \`advance_step\` after completing each step.`);

  // Step summary
  parts.push(`\nWorkflow Steps (${template.steps.length}):`);
  template.steps.forEach((step, i) => {
    const def = template.stepDefinitions[step];
    const flags: string[] = [];
    if (def?.requiresGateApproval) flags.push('[HUMAN GATE]');
    if (def?.requiresEvaluatorGate) flags.push('[EVALUATOR GATE]');
    parts.push(`${i + 1}. ${step} — ${def?.description ?? ''} ${flags.join(' ')}`);
  });

  return parts.join('\n').trim();
}
