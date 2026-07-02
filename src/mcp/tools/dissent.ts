/**
 * Dissent Mode MCP tool — run an independent panel of different models on one
 * hard interpretive question about a specific clause and surface where they
 * DISAGREE. For load-bearing, ambiguous clauses (liability caps, indemnity,
 * termination, governing law) a split decision is a first-class finding: the
 * deliverable should show the disagreement, not hide it behind a single answer.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { runDissent, defaultPanel } from '../../orchestration/dissent.js';

export function createDissentTools(session: SessionState) {
  const dissentTool = tool(
    'run_dissent_panel',
    'Ask an INDEPENDENT panel of different AI models the SAME multiple-choice interpretive question about a specific clause, and surface where they disagree. Use on load-bearing, genuinely ambiguous clauses (liability caps, indemnity, termination triggers, governing law) where a wrong reading is costly. Returns each model\'s labelled position + the exact text it relied on, and flags material dissent. When the panel splits, quote the split verbatim in the deliverable — do NOT silently pick one side.',
    {
      question: z.string().min(1).max(500)
        .describe('The interpretive question, e.g. "Is the Provider\'s liability capped?"'),
      options: z.array(z.string().min(1)).min(2).max(6)
        .describe('The candidate answers, e.g. ["uncapped","capped at fees paid","capped at a fixed amount","ambiguous"]'),
      clause: z.string().min(1).max(8000)
        .describe('The exact clause / passage the panel should analyze'),
    },
    async (args) => {
      const panel = defaultPanel();
      if (panel.length < 2) {
        return {
          content: [{
            type: 'text' as const,
            text: `Dissent needs at least 2 independent models; only ${panel.length} is available for the active provider. Configure a second model to enable a dissent panel.`,
          }],
        };
      }

      const result = await runDissent({ question: args.question, options: args.options, context: args.clause });
      session.dissents.push(result); // surfaced in the delivery "Dissent" view + audit bundle

      const lines = result.verdicts.map(v => v.error
        ? `- ${v.member}: (unavailable — ${v.error})`
        : `- ${v.member} → **${v.label}** [${v.confidence}] · "${v.quote}" — ${v.rationale}`);

      const header = result.dissent
        ? `⚖️ DISSENT — the panel does NOT agree. ${result.summary}`
        : `Panel consensus. ${result.summary}`;

      const guidance = result.dissent
        ? '\n\nThis is a genuine split among independent models. Surface it in the deliverable — name the models, quote the clause, and flag it for human judgment. Do not silently resolve it.'
        : '';

      return { content: [{ type: 'text' as const, text: `${header}\n\n${lines.join('\n')}${guidance}` }] };
    },
  );

  return [dissentTool];
}
