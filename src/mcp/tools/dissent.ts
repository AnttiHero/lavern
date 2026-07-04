/**
 * Dissent Mode MCP tool — run an independent panel of different models on one
 * hard interpretive question about a specific clause and surface where they
 * DISAGREE. For load-bearing, ambiguous clauses (liability caps, indemnity,
 * termination, governing law) a split decision is a first-class finding: the
 * deliverable should show the disagreement, not hide it behind a single answer.
 *
 * Hivemind: the panel is COMPOSED per matter type from the performance ledger
 * (best-measured, decorrelated panelists). A split triggers the resolution
 * loop — retrieve authority, re-vote with the evidence — and a resolved split
 * teaches the ledger which panelists read it right. An unresolved split is
 * escalated to human review.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { config } from '../../config.js';
import { runDissent, EST_PANELIST_CALL_USD } from '../../orchestration/dissent.js';
import { resolveDissent } from '../../orchestration/resolution.js';
import { composePanel, panelPool, recordPanelistOutcomes } from '../../orchestration/panels.js';
import { getLedger } from '../../orchestration/record-engagement-routing.js';

export function createDissentTools(session: SessionState) {
  const dissentTool = tool(
    'run_dissent_panel',
    'Ask an INDEPENDENT panel of different AI models the SAME multiple-choice interpretive question about a specific clause, and surface where they disagree. Use on load-bearing, genuinely ambiguous clauses (liability caps, indemnity, termination triggers, governing law) where a wrong reading is costly. Returns each model\'s labelled position + the exact text it relied on, and flags material dissent. If the panel splits, the hivemind automatically retrieves authority and re-votes; a split that survives the evidence is escalated to human review. When a split stands, quote it verbatim in the deliverable — do NOT silently pick one side.',
    {
      question: z.string().min(1).max(500)
        .describe('The interpretive question, e.g. "Is the Provider\'s liability capped?"'),
      options: z.array(z.string().min(1)).min(2).max(6)
        .describe('The candidate answers, e.g. ["uncapped","capped at fees paid","capped at a fixed amount","ambiguous"]'),
      clause: z.string().min(1).max(8000)
        .describe('The exact clause / passage the panel should analyze'),
    },
    async (args) => {
      const matterType = session.workflowTemplateId ?? 'general';
      // Panel follows the SESSION's provider: an EU-sovereign engagement gets
      // an EU panel even when the deployment's global provider is anthropic.
      const sessionProvider = session.provider ?? config.provider;
      const panel = composePanel(matterType, getLedger(), 2, panelPool(sessionProvider));
      if (panel.length < 2) {
        return {
          content: [{
            type: 'text' as const,
            text: `Dissent needs at least 2 independent models; only ${panel.length} is available for the active provider. Configure a second model to enable a dissent panel.`,
          }],
        };
      }

      let result = await runDissent({ question: args.question, options: args.options, context: args.clause, panel });
      session.hivemindCostUsd += panel.length * EST_PANELIST_CALL_USD;

      if (result.dissent) {
        result = await resolveDissent(result, { context: args.clause, userId: session.userId, provider: sessionProvider, panel });
        if (result.resolution?.revote.length) {
          session.hivemindCostUsd += panel.length * EST_PANELIST_CALL_USD;
        }
        if (result.resolution?.resolved && result.resolution.finalLabel) {
          // Layer 3: a resolved split reveals who read it right first time.
          recordPanelistOutcomes(getLedger(), matterType, result.verdicts, result.resolution.finalLabel);
        }
      }

      session.dissents.push(result); // surfaced in the delivery "Dissent" view + audit bundle

      const lines = result.verdicts.map(v => v.error
        ? `- ${v.member}: (unavailable — ${v.error})`
        : `- ${v.member} → **${v.label}** [${v.confidence}] · "${v.quote}" — ${v.rationale}`);

      const header = result.dissent
        ? `⚖️ DISSENT — the panel does NOT agree. ${result.summary}`
        : `Panel consensus. ${result.summary}`;

      let resolutionBlock = '';
      if (result.resolution) {
        const r = result.resolution;
        const evidenceLines = r.evidence.map(e => `  · ${e.source}`);
        const revoteLines = r.revote.filter(v => !v.error).map(v => `  · ${v.member} → ${v.label}`);
        resolutionBlock =
          `\n\nRESOLUTION LOOP: ${r.note}`
          + (evidenceLines.length ? `\nEvidence retrieved:\n${evidenceLines.join('\n')}` : '')
          + (revoteLines.length ? `\nRe-vote with evidence:\n${revoteLines.join('\n')}` : '');
      }

      const guidance = result.resolution?.escalated
        ? '\n\nThe split SURVIVED the evidence — this is a genuine ambiguity. Surface it in the deliverable: name the models, quote the clause, list the evidence both sides saw, and flag it for human judgment. Do not silently resolve it.'
        : result.resolution?.resolved
          ? `\n\nThe panel converged on "${result.resolution.finalLabel}" once the evidence was on the table. Use that reading and cite the retrieved authority — but still NOTE the initial split in the deliverable (which models disagreed and why), so the reader sees the clause was contested before it was resolved.`
          : '';

      return { content: [{ type: 'text' as const, text: `${header}\n\n${lines.join('\n')}${resolutionBlock}${guidance}` }] };
    },
  );

  return [dissentTool];
}
