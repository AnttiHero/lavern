/**
 * Mistral Executor — Parallel workflow runner for the Mistral provider.
 *
 * This replaces `query()` from the Claude Agent SDK when MARBLE_PROVIDER=mistral.
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
 * delegate to specialists. For Mistral, "delegation" happens inline via
 * tool calls rather than subprocess spawning.
 */

import { createShemMcpServer } from '../mcp/server.js';
import { agentProfiles } from '../agents/profiles.js';
import { getOrchestratorForWorkflow } from '../workflows/orchestrator-mapping.js';
import { eventTimestamp } from '../events/event-bus.js';
import { handleSessionError } from '../utils/error-recovery.js';
import { config } from '../config.js';
import { mistralChat } from './mistral.js';
import { buildToolRegistry, type McpServer } from './tool-converter.js';
import { assembleMistralDocument } from './mistral-assembler.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SessionState } from '../session/session-state.js';
import type { LegalRequest, RouterClassification } from '../types/index.js';
import type { WorkflowTemplate } from '../types/workflow.js';
import type { SchemOptions } from '../orchestrator.js';
import type OpenAI from 'openai';

// ── Constants ────────────────────────────────────────────────────────────

/** Maximum size for session.finalOutput to prevent unbounded memory growth. */
const MAX_FINAL_OUTPUT_BYTES = 500_000;

// ── Types ───────────────────────────────────────────────────────────────

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// ── Main Executor ───────────────────────────────────────────────────────

/**
 * Run a workflow using Mistral instead of the Claude Agent SDK.
 *
 * This is the parallel execution path — same inputs and outputs as
 * `runGenericWorkflow()`, but uses Mistral's chat completion API
 * with tool calling instead of the Agent SDK's `query()`.
 */
export async function runMistralWorkflow(
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

  const model = config.mistral.defaultModel;

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

  console.log(`
╔${'═'.repeat(62)}╗
║                        THE SHEM v8                           ║
║        "We know what's written in the Golem's mouth"         ║
║                    ⚡ MISTRAL PROVIDER ⚡                     ║
╚${'═'.repeat(62)}╝

Session: ${session.id}
Provider: mistral (${model})
Workflow: ${template.id} (${template.name})
Request Type: ${classification.requestType}
Complexity: ${classification.complexity}
${request.documentPath ? `Document: ${request.documentPath}` : ''}
${request.requestText ? `Request: ${request.requestText.substring(0, 100)}...` : ''}
Budget: $${maxBudgetUsd.toFixed(2)}
Specialists: ${classification.selectedSpecialists.join(', ')}
`);

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
    `\n\n## Provider Note\nYou are running on Mistral (${model}). You are a single orchestrator — there are no subagents. Execute all analysis steps yourself using the available tools. Work through each workflow step methodically.`;

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
        console.log('[MISTRAL] Session halted — stopping execution');
        break;
      }

      // Budget check
      if (totalCost >= maxBudgetUsd) {
        console.log(`[MISTRAL] Budget exhausted ($${totalCost.toFixed(4)} >= $${maxBudgetUsd.toFixed(2)})`);
        break;
      }

      const result = await mistralChat({
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
        console.error(`[MISTRAL] Turn ${turns}: +$${result.cost.toFixed(4)} (total: $${totalCost.toFixed(4)}), finish: ${result.finishReason}`);
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
          console.warn(`[MISTRAL] Failed to parse tool arguments for ${toolName}:`, parseErr instanceof Error ? parseErr.message : parseErr);
          toolArgs = {};
        }

        if (logLevel === 'debug') {
          console.error(`[MISTRAL] Tool call: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`);
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
          console.log('[MISTRAL] Session halted during tool execution');
          break;
        }
      }
    }

    if (turns >= maxTurns) {
      console.warn(`[MISTRAL] Hit max turns (${maxTurns})`);
    }

  } catch (error) {
    const sessionError = handleSessionError(session, error);
    console.error(`[MISTRAL] (${template.id}) error at step "${sessionError.step}":`, sessionError.cause);

    session.events.emitEvent({
      type: 'session_end',
      sessionId: session.id,
      totalCost,
      duration: 0,
      timestamp: eventTimestamp(),
    });
    throw error;
  }

  // ── Document assembly (via Mistral) ─────────────────────────────────
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
    console.error('[MISTRAL] Document assembly failed (non-fatal):', assemblyError);
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

  console.log('\n' + '═'.repeat(60));
  console.log(`SESSION COMPLETE (${template.id}) — Mistral`);
  console.log(`Cost: $${totalCost.toFixed(2)}`);
  console.log(`Turns: ${turns}`);
  console.log(`Findings: ${session.debate.findings.length}`);
  console.log(`Resolutions: ${session.debate.resolutions.length}`);
  console.log('═'.repeat(60));

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
