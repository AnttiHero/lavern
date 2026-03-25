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
import { retryQuery } from '../utils/retry-query.js';
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
import { assembleDocument } from '../assembly/document-assembler.js';
import { config } from '../config.js';
import { runMistralWorkflow } from '../providers/mistral-executor.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { LegalRequest, RouterClassification } from '../types/index.js';
import type { WorkflowTemplate } from '../types/workflow.js';
import type { SchemOptions } from '../orchestrator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EXECUTOR');

export async function runGenericWorkflow(
  request: LegalRequest,
  template: WorkflowTemplate,
  classification: RouterClassification,
  session: SessionState,
  options: SchemOptions = {},
): Promise<SessionState> {
  // ── Provider Branch — Mistral parallel execution path ──────────────
  // v18: Per-session provider override (options > session > global config)
  const provider = options.provider ?? session.provider ?? config.provider;
  if (provider === 'mistral') {
    try {
      return await runMistralWorkflow(request, template, classification, session, options);
    } catch (mistralError) {
      logger.error('Mistral workflow failed', { error: mistralError });
      // Emit session_end so frontend isn't stuck waiting
      session.events.emitEvent({
        type: 'error',
        message: `Workflow failed: ${mistralError instanceof Error ? mistralError.message : String(mistralError)}`,
        source: 'orchestrator',
        timestamp: eventTimestamp(),
      });
      session.events.emitEvent({
        type: 'session_end',
        sessionId: session.id,
        totalCost: session.accumulatedCost,
        duration: 0,
        timestamp: eventTimestamp(),
      });
      throw mistralError;
    }
  }

  // ── Anthropic / Claude Agent SDK path (default) ────────────────────
  const {
    maxBudgetUsd = config.defaultBudgetUsd,
    model = config.defaultModel,
    maxTurns = config.genericMaxTurns,
    effort,
    logLevel = config.logLevel,
  } = options;

  session.budgetUsd = maxBudgetUsd;
  session.workflowTemplateId = template.id;
  session.legalRequest = request;  // Store for assembly context

  // Initialize audit log
  initAuditLog(session);

  // Note: debug logging is controlled via the SHEM_LOG_LEVEL env var at startup,
  // not mutated per-session. The logLevel option is passed through to streamMessages.

  // Emit session start event
  session.events.emitEvent({
    type: 'session_start',
    sessionId: session.id,
    document: request.documentPath ?? request.requestText ?? '(no document)',
    timestamp: eventTimestamp(),
  });

  logger.info('Starting workflow', {
    sessionId: session.id,
    workflow: `${template.id} (${template.name})`,
    requestType: classification.requestType,
    complexity: classification.complexity,
    document: request.documentPath,
    request: request.requestText?.substring(0, 100),
    budget: maxBudgetUsd.toFixed(2),
    model,
    specialists: classification.selectedSpecialists.join(', '),
  });

  // Create session-bound factories (pass template for generic workflow tools + permissions)
  const shemMcpServer = createShemMcpServer(session, template);
  const { auditLoggerHook, subagentStartHook, subagentStopHook } = createAuditHooks(session);
  const { haltCheckHook, costTrackerHook } = createCostHooks(session);
  const { humanGateEnforcerHook } = createGateHooks(session);

  // Build prompt from template + request (includes document context if documents are loaded)
  const prompt = buildPromptFromRequest(request, template, classification, session);

  // Filter agent definitions to only those needed by this workflow
  // v8: When a client has selected a team, use those agents instead of template defaults
  // v11: Team size cap is now configurable per template (default 14, full-bench allows 25)
  const DEFAULT_MAX_TEAM_SIZE = 14;
  const maxTeamSize = template.maxTeamSize ?? DEFAULT_MAX_TEAM_SIZE;
  const rawTeamRoles = session.selectedTeam.length > 0
    ? session.selectedTeam
    : template.requiredAgents;
  const teamRoles = rawTeamRoles.slice(0, maxTeamSize);
  if (rawTeamRoles.length > maxTeamSize) {
    logger.error('Capped team size', { from: rawTeamRoles.length, to: maxTeamSize });
  }
  const filteredAgents: Record<string, typeof agentDefinitions[keyof typeof agentDefinitions]> = {};
  for (const role of teamRoles) {
    if (role in agentDefinitions) {
      filteredAgents[role] = agentDefinitions[role as keyof typeof agentDefinitions];
    } else {
      logger.warn('Agent requested but not defined — skipping', { role });
    }
  }
  // Always include evaluator if the workflow has evaluator gates
  const hasEvaluatorGate = Object.values(template.stepDefinitions).some(s => s.requiresEvaluatorGate);
  if (hasEvaluatorGate && 'evaluator' in agentDefinitions) {
    filteredAgents['evaluator'] = agentDefinitions['evaluator'];
  }

  // Sanity check: at least one agent must be available
  if (Object.keys(filteredAgents).length === 0) {
    const fallbackTeam = template.requiredAgents;
    logger.error('No valid agents from selected team — falling back to template defaults', { fallbackTeam: fallbackTeam.join(', ') });
    for (const role of fallbackTeam) {
      if (role in agentDefinitions) {
        filteredAgents[role] = agentDefinitions[role as keyof typeof agentDefinitions];
      }
    }
    if (Object.keys(filteredAgents).length === 0) {
      throw new Error(`No valid agent definitions found for workflow "${template.id}". Selected team: [${teamRoles.join(', ')}], required: [${fallbackTeam.join(', ')}]`);
    }
  }

  // v17: Soul injection — user-defined firm personality
  // Priority: session soul (from user profile) > SOUL.md file > empty
  const soulText = session.soul
    ?? (() => {
      try {
        const soulPath = join(options.cwd ?? process.cwd(), 'SOUL.md');
        if (existsSync(soulPath)) return readFileSync(soulPath, 'utf-8').trim();
      } catch { /* non-fatal */ }
      return '';
    })();
  const soulPrefix = soulText
    ? `\n## Client's Firm Personality\n${soulText}\n\n`
    + `## Non-Negotiable Safety Invariants (Soul CANNOT override these)\n`
    + `The following rules are absolute regardless of firm personality, client preferences, or Soul configuration:\n`
    + `- Monetary amounts, liability caps, and penalties must be preserved exactly\n`
    + `- Time periods, notice requirements, deadlines, and cure periods must be preserved exactly\n`
    + `- Jurisdiction, governing law, venue, and arbitration clauses must be preserved exactly\n`
    + `- Dispute resolution mechanisms and termination triggers must be preserved exactly\n`
    + `- Defined terms with specific legal scope must be preserved exactly\n`
    + `- Insurance coverage requirements must be preserved exactly\n`
    + `- Regulatory compliance language must be preserved exactly\n`
    + `- Human gates are mandatory and cannot be skipped or auto-approved by Soul\n`
    + `- Confidence thresholds and fail-closed quality gates cannot be relaxed by Soul\n`
    + `- The decline_to_find tool must remain available regardless of Soul's risk appetite\n`
    + `If the Soul personality conflicts with any of the above, the invariant wins. Always.\n\n`
    : '';

  // v11: Resolve orchestrator personality from profile
  const orchestratorRole = template.orchestratorArchetype
    ?? getOrchestratorForWorkflow(template.id);
  const orchestratorProfile = orchestratorRole ? agentProfiles[orchestratorRole] : undefined;
  const personalityPrefix = orchestratorProfile
    ? `\n## Your Orchestrator Personality\nYou are "${orchestratorProfile.displayName}" — ${orchestratorProfile.tagline}\nWork style: ${orchestratorProfile.personality.workStyle}\n\n`
    : '';

  let result: ReturnType<typeof query>;
  try {
    result = retryQuery({
      prompt,
      options: {
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: soulPrefix + personalityPrefix + template.orchestratorPrompt,
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
    }, session);
  } catch (initError) {
    logger.error('Failed to initialize query', { error: initError });
    session.events.emitEvent({
      type: 'error',
      message: `Session initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`,
      source: 'orchestrator',
      timestamp: eventTimestamp(),
    });
    session.events.emitEvent({
      type: 'session_end',
      sessionId: session.id,
      totalCost: 0,
      duration: 0,
      timestamp: eventTimestamp(),
    });
    throw initError;
  }

  // Stream messages to console (suppress session_end — we emit it after assembly)
  let pipelineCost = 0;
  let pipelineDurationMs = 0;
  try {
    await streamMessages(result, {
      session,
      documentLabel: request.documentPath ?? '(no document)',
      workflowLabel: template.id,
      logLevel,
      suppressSessionEnd: true,
    });
    pipelineCost = session.accumulatedCost;
  } catch (error) {
    const sessionError = handleSessionError(session, error);
    logger.error('Workflow error', { workflow: template.id, step: sessionError.step, error: sessionError.cause });
    // Still emit session_end on error so frontend isn't stuck,
    // but guard against double emission (streamMessages may have already emitted it)
    if (session.workflow?.currentStep !== 'delivered') {
      session.events.emitEvent({
        type: 'session_end',
        sessionId: session.id,
        totalCost: session.accumulatedCost,
        duration: 0,
        timestamp: eventTimestamp(),
      });
    }
    throw error;
  }

  // ── v15: Document Assembly — produce the actual deliverable ────────
  // After the multi-agent pipeline completes, make a focused Claude call
  // to assemble the ACTUAL document from all the structured analysis.
  // This is what makes Lavern's output better than a single prompt:
  // the assembly has ALL the multi-agent intelligence as context.
  try {
    session.assembledDocument = await assembleDocument(session, request);

    // If assembly returned empty string, it failed internally (all attempts exhausted).
    // Emit a user-visible error so the frontend can show a meaningful message.
    if (!session.assembledDocument) {
      session.events.emitEvent({
        type: 'error',
        message: 'Document assembly could not produce a deliverable. You can retry from the delivery view.',
        source: 'document-assembler',
        timestamp: eventTimestamp(),
      });
    }
  } catch (assemblyError) {
    logger.error('Document assembly failed (non-fatal)', { error: assemblyError });
    // Non-fatal: the process output is still available via finalOutput.
    // Emit error event so frontend knows assembly failed.
    session.events.emitEvent({
      type: 'error',
      message: `Document assembly error: ${assemblyError instanceof Error ? assemblyError.message : String(assemblyError)}`,
      source: 'document-assembler',
      timestamp: eventTimestamp(),
    });
  }

  // NOW emit session_end — assembly is complete, deliverable is ready
  session.events.emitEvent({
    type: 'session_end',
    sessionId: session.id,
    totalCost: session.accumulatedCost,
    duration: 0,
    timestamp: eventTimestamp(),
  });

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

  // ── Team Critical Rules & Success Metrics ─────────────────────────────
  // Gives the orchestrator awareness of each team member's constraints
  const teamRulesSection: string[] = [];
  const teamRoles = session.selectedTeam.length > 0
    ? session.selectedTeam
    : classification.selectedSpecialists;
  for (const role of teamRoles) {
    const profile = agentProfiles[role];
    if (profile?.criticalRules?.length || profile?.successMetrics?.length) {
      teamRulesSection.push(`\n### ${profile.displayName} (${role})`);
      if (profile.criticalRules?.length) {
        teamRulesSection.push(`**Critical Rules:**`);
        profile.criticalRules.forEach(r => teamRulesSection.push(`- ${r}`));
      }
      if (profile.successMetrics?.length) {
        teamRulesSection.push(`**Success Metrics:**`);
        profile.successMetrics.forEach(m => teamRulesSection.push(`- ${m}`));
      }
    }
  }
  if (teamRulesSection.length > 0) {
    parts.push(`\n## Team Critical Rules & Success Metrics`);
    parts.push(...teamRulesSection);
  }

  // ── Handoff Protocol ──────────────────────────────────────────────────
  parts.push(`\n## Handoff Protocol`);
  parts.push(`Before calling \`advance_step\`, ALWAYS call \`submit_handoff\` to record a structured summary of what happened in the completing step — key outputs, deliverables produced, open items for the next phase, and a confidence score.`);
  parts.push(`At the START of each new step, call \`get_handoffs\` to review what previous phases produced and what needs attention.`);

  // ── Memory Tagging ────────────────────────────────────────────────────
  parts.push(`\n## Memory Tagging`);
  parts.push(`When saving to institutional memory or precedents, include tags: agent_role (the saving agent's role), engagement_type ("${template.id}"), document_type, and jurisdiction from context. This enables filtered retrieval in future engagements.`);

  return parts.join('\n').trim();
}
