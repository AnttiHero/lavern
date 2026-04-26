/**
 * Local Executor — Parallel workflow runner for the Local provider.
 *
 * This replaces `query()` from the Claude Agent SDK when LAVERN_PROVIDER=mistral.
 * Instead of multi-agent subprocess orchestration, it runs a single-orchestrator
 * chat completion loop that calls the same MCP tools.
 *
 * Architecture:
 * - Same system prompt (soul + personality + orchestrator prompt)
 * - Same user prompt (buildPromptFromRequest)
 * - Same MCP tools (debate board, scoring, workflow engine, etc.)
 * - Different execution: OpenAI-compatible chat loop instead of Agent SDK
 *
 * The orchestrator prompt already describes how to work through steps and
 * delegate to specialists. For Local, "delegation" happens inline via
 * tool calls rather than subprocess spawning.
 */

import { createShemMcpServer } from '../mcp/server.js';
import { agentProfiles } from '../agents/profiles.js';
import { getOrchestratorForWorkflow } from '../workflows/orchestrator-mapping.js';
import { eventTimestamp } from '../events/event-bus.js';
import { handleSessionError } from '../utils/error-recovery.js';
import { config } from '../config.js';
import { localChat } from './local.js';
import { buildToolRegistry, type McpServer } from './tool-converter.js';
import { assembleMistralDocument } from './mistral-assembler.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SessionState } from '../session/session-state.js';
import type { LegalRequest, RouterClassification } from '../types/index.js';
import type { WorkflowTemplate } from '../types/workflow.js';
import type { SchemOptions } from '../orchestrator.js';
import type OpenAI from 'openai';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('LOCAL');

// ── Constants ────────────────────────────────────────────────────────────

/** Maximum size for session.finalOutput to prevent unbounded memory growth. */
const MAX_FINAL_OUTPUT_BYTES = 500_000;

// ── Types ───────────────────────────────────────────────────────────────

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// ── Main Executor ───────────────────────────────────────────────────────

/**
 * Run a workflow using Local instead of the Claude Agent SDK.
 *
 * This is the parallel execution path — same inputs and outputs as
 * `runGenericWorkflow()`, but uses Local's chat completion API
 * with tool calling instead of the Agent SDK's `query()`.
 */
export async function runLocalWorkflow(
  request: LegalRequest,
  template: WorkflowTemplate,
  classification: RouterClassification,
  session: SessionState,
  options: SchemOptions = {},
): Promise<SessionState> {
  const {
    maxBudgetUsd = config.defaultBudgetUsd,
    maxTurns = config.genericMaxTurns,
    logLevel = config.logLevel,
  } = options;

  const model = config.local.defaultModel;

  session.budgetUsd = maxBudgetUsd;
  session.workflowTemplateId = template.id;
  session.legalRequest = request;

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

  logger.info('Starting Local workflow', {
    sessionId: session.id,
    workflow: `${template.id} (${template.name})`,
    requestType: classification.requestType,
    budget: maxBudgetUsd.toFixed(2),
    model: config.local.defaultModel,
    specialists: classification.selectedSpecialists.join(', '),
  });

  // ── Build system prompt (identical to Claude path) ──────────────────

  // Soul injection
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
    : '';

  // Orchestrator personality
  const orchestratorRole = template.orchestratorArchetype
    ?? getOrchestratorForWorkflow(template.id);
  const orchestratorProfile = orchestratorRole ? agentProfiles[orchestratorRole] : undefined;
  const personalityPrefix = orchestratorProfile
    ? `\n## Your Orchestrator Personality\nYou are "${orchestratorProfile.displayName}" — ${orchestratorProfile.tagline}\nWork style: ${orchestratorProfile.personality.workStyle}\n\n`
    : '';

  const systemPrompt = soulPrefix + personalityPrefix + template.orchestratorPrompt +
    `\n\n## Provider Note\nYou are running on Local (${model}). You are a single orchestrator — there are no subagents. Execute all analysis steps yourself using the available tools. Work through each workflow step methodically.`;

  // ── Build user prompt (reuse existing logic) ──────────────────────
  const userPrompt = buildPromptFromRequest(request, template, classification, session);

  // ── Build tool registry from MCP server ───────────────────────────
  // The SDK MCP server type is structurally compatible with our McpServer
  // interface (listTools + callTool), but TypeScript can't verify this
  // across SDK boundaries — hence the explicit cast via unknown.
  const mcpServer: McpServer = createShemMcpServer(session, template) as unknown as McpServer;
  const toolRegistry = await buildToolRegistry(mcpServer);

  // ── Initialize conversation ───────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // ── Chat completion loop ──────────────────────────────────────────
  let turns = 0;
  let totalCost = 0;

  try {
    while (turns < maxTurns) {
      // Check if session was halted (cancelled by user)
      if (session.isHalted()) {
        logger.info('Session halted — stopping execution');
        break;
      }

      // Budget check
      if (totalCost >= maxBudgetUsd) {
        logger.info('Budget exhausted', { cost: totalCost.toFixed(4), budget: maxBudgetUsd.toFixed(2) });
        break;
      }

      const result = await localChat({
        model,
        messages,
        tools: toolRegistry.definitions,
        toolChoice: 'auto',
        temperature: 0.1,
        maxTokens: 8192,
      });

      turns++;
      totalCost += result.cost;
      session.updateCost(totalCost);

      if (logLevel === 'debug') {
        logger.error('Turn completed', { turn: turns, turnCost: result.cost.toFixed(4), totalCost: totalCost.toFixed(4), finishReason: result.finishReason });
      }

      const msg = result.message;

      // Emit activity for frontend (use tool_used which the frontend renders)
      if (msg.content) {
        session.events.emitEvent({
          type: 'tool_used',
          tool: 'orchestrator_output',
          agent: 'orchestrator',
          timestamp: eventTimestamp(),
        });

        // Capture output (capped to prevent unbounded memory growth)
        if (session.finalOutput.length < MAX_FINAL_OUTPUT_BYTES) {
          session.finalOutput += msg.content;
        }
        if (logLevel === 'debug') {
          process.stdout.write(msg.content);
          process.stdout.write('\n');
        }
      }

      // If no tool calls → done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        messages.push(msg);
        break;
      }

      // ── Execute tool calls ──────────────────────────────────────────
      messages.push(msg); // assistant message with tool_calls

      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;

        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseErr) {
          logger.warn('Failed to parse tool arguments', { toolName, error: parseErr instanceof Error ? parseErr.message : parseErr });
          toolArgs = {};
        }

        if (logLevel === 'debug') {
          logger.error('Tool call', { toolName, args: JSON.stringify(toolArgs).substring(0, 100) });
        }

        // Emit tool use event
        session.events.emitEvent({
          type: 'tool_used',
          tool: toolName,
          agent: 'orchestrator',
          timestamp: eventTimestamp(),
        });

        // Execute tool via MCP server
        const toolResult = await toolRegistry.callTool(toolName, toolArgs);

        // Add tool result to conversation
        messages.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: toolResult,
        });

        // Emit cost update
        session.events.emitEvent({
          type: 'cost_update',
          totalUsd: totalCost,
          budgetUsd: maxBudgetUsd,
          timestamp: eventTimestamp(),
        });

        // Check halt between tool calls
        if (session.isHalted()) {
          logger.info('Session halted during tool execution');
          break;
        }
      }
    }

    if (turns >= maxTurns) {
      logger.warn('Hit max turns', { maxTurns });
    }

  } catch (error) {
    const sessionError = handleSessionError(session, error);
    logger.error('Workflow error', { workflow: template.id, step: sessionError.step, error: sessionError.cause });

    session.events.emitEvent({
      type: 'session_end',
      sessionId: session.id,
      totalCost,
      duration: 0,
      timestamp: eventTimestamp(),
    });
    throw error;
  }

  // ── Document assembly (via Local) ─────────────────────────────────
  try {
    session.assembledDocument = await assembleMistralDocument(session, request);

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
    session.events.emitEvent({
      type: 'error',
      message: `Document assembly error: ${assemblyError instanceof Error ? assemblyError.message : String(assemblyError)}`,
      source: 'document-assembler',
      timestamp: eventTimestamp(),
    });
  }

  // Emit session_end — assembly is complete
  session.events.emitEvent({
    type: 'session_end',
    sessionId: session.id,
    totalCost,
    duration: 0,
    timestamp: eventTimestamp(),
  });

  logger.info('Session complete', {
    workflow: template.id,
    provider: 'Local',
    cost: totalCost.toFixed(2),
    turns,
    findings: session.debate.findings.length,
    resolutions: session.debate.resolutions.length,
  });

  return session;
}

// ── Prompt Builder (duplicated from executor.ts to avoid circular deps) ──

function buildPromptFromRequest(
  request: LegalRequest,
  template: WorkflowTemplate,
  classification: RouterClassification,
  session: SessionState,
): string {
  const parts: string[] = [];

  if (request.documentPath) {
    parts.push(`Analyze the document at: ${request.documentPath}`);
  }
  if (request.requestText) {
    parts.push(`Request: ${request.requestText}`);
  }

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

  // v0.14.5 — embed full document text inline (Local large has 128k context, so use a tighter budget)
  if (session.documents.length > 0) {
    const PER_DOC_BUDGET = 50_000;
    const TOTAL_BUDGET   = 110_000;
    let remaining = TOTAL_BUDGET;

    parts.push('\n══════════════════════════════════════════════════════════════');
    parts.push('UPLOADED DOCUMENTS — full text included below');
    parts.push('══════════════════════════════════════════════════════════════');
    parts.push(`${session.documents.length} document(s) attached. Read them directly. Cite clause numbers and quote text.\n`);

    for (let i = 0; i < session.documents.length; i++) {
      const doc = session.documents[i];
      const docBudget = Math.min(PER_DOC_BUDGET, remaining);
      if (docBudget <= 0) {
        parts.push(`### Document ${i + 1}: ${doc.name} — [skipped: budget exceeded]`);
        continue;
      }
      const headings = doc.sections.slice(0, 10).map(s => s.heading).join(', ');
      parts.push(`### Document ${i + 1}: ${doc.name}`);
      parts.push(`   ${doc.pageCount} pages · ${doc.wordCount.toLocaleString()} words${headings ? ` · sections: ${headings}` : ''}`);
      parts.push('');
      const text = doc.fullText ?? '';
      if (text.length <= docBudget) {
        parts.push('--- BEGIN ' + doc.name + ' ---');
        parts.push(text);
        parts.push('--- END ' + doc.name + ' ---\n');
        remaining -= text.length;
      } else {
        const head = text.slice(0, Math.floor(docBudget * 0.65));
        const tail = text.slice(-Math.floor(docBudget * 0.30));
        parts.push('--- BEGIN ' + doc.name + ' (truncated) ---');
        parts.push(head);
        parts.push('\n[…middle truncated to fit context…]\n');
        parts.push(tail);
        parts.push('--- END ' + doc.name + ' ---\n');
        remaining -= (head.length + tail.length);
      }
    }
    parts.push('══════════════════════════════════════════════════════════════');
    parts.push('END OF UPLOADED DOCUMENTS');
    parts.push('══════════════════════════════════════════════════════════════\n');
    parts.push('Cite clause numbers and quote verbatim from the text above. Do not paraphrase from memory of standard contract language.\n');
  }

  parts.push(`\nRouter Classification:`);
  parts.push(`- Request Type: ${classification.requestType}`);
  parts.push(`- Complexity: ${classification.complexity}`);
  parts.push(`- Risk Level: ${classification.riskLevel}`);
  parts.push(`- Selected Specialists: ${classification.selectedSpecialists.join(', ')}`);
  if (classification.requiresDebate) parts.push(`- Debate rounds required`);
  if (classification.requiresEthicsFirst) parts.push(`- Ethics-first review required`);
  if (classification.requiresConsistencyCheck) parts.push(`- Consistency check required`);

  parts.push(`\nFollow the ${template.id} workflow. Start by calling \`get_current_step\` to see where you are.`);
  parts.push(`Use \`advance_step\` after completing each step.`);

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
