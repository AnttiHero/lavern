/**
 * Hivemind — dissent resolution loop (Layer 2).
 *
 * A split is not the end of the conversation. When the panel disagrees on a
 * clause: retrieve authority (knowledge base + case law where permitted),
 * re-put the SAME question with the evidence attached, and re-vote.
 *
 *   Split resolves  → record the outcome (and which panelists read it right —
 *                     that feeds the panel ledger, Layer 3).
 *   Split persists  → escalate: the disagreement plus the evidence both sides
 *                     saw becomes a human-review item, not a buried footnote.
 *
 * Fail-safe: any error in retrieval or re-vote leaves the original split
 * untouched and escalated. Resolution can only ADD information.
 */

import { runDissent } from './dissent.js';
import type { DissentResult, DissentVerdict, PanelMember } from './dissent.js';
import { searchKnowledgeBase } from '../knowledge-base/retriever.js';
import { searchCaseLaw, isConnectorError } from '../connectors/courtlistener.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('HIVE-RESOLVE');

export interface DissentEvidence {
  /** Where it came from, e.g. "KB: Indemnification" or "Smith v. Jones, 12 F.3d 34". */
  source: string;
  snippet: string;
}

export interface DissentResolution {
  evidence: DissentEvidence[];
  /** The panel's second round, cast with the evidence in front of it. */
  revote: DissentVerdict[];
  resolved: boolean;
  /** The label the panel converged on, when resolved. */
  finalLabel?: string;
  /** True when the split survived the evidence — needs a human. */
  escalated: boolean;
  note: string;
}

/**
 * Default evidence gatherer. Knowledge base is local (no egress). Case law
 * goes out to CourtListener only under the same gate as the case-law tools:
 * anthropic provider + connector enabled — and `provider` MUST be the
 * engagement's EFFECTIVE provider (session.provider ?? config.provider), so
 * an EU-sovereign or local engagement never leaks clause context to a US
 * endpoint even on a globally-anthropic deployment.
 */
export async function gatherEvidence(
  question: string,
  userId?: string,
  provider: string = config.provider,
): Promise<DissentEvidence[]> {
  const out: DissentEvidence[] = [];

  if (userId) {
    try {
      const hits = searchKnowledgeBase({ query: question, userId, maxResults: 3 });
      for (const h of hits) {
        out.push({ source: `KB: ${h.heading || h.doc_type}`, snippet: h.content.replace(/\s+/g, ' ').trim().slice(0, 500) });
      }
    } catch (err) {
      logger.warn('KB evidence lookup failed', { err: (err as Error).message });
    }
  }

  if (provider === 'anthropic' && config.courtListener.enabled) {
    try {
      const res = await searchCaseLaw(question, { maxResults: 2, timeoutMs: 10_000 });
      if (!isConnectorError(res)) {
        for (const c of res) {
          if (!c.snippet) continue;
          const cite = c.citation ? `, ${c.citation}` : '';
          out.push({ source: `${c.caseName}${cite} (${c.court})`, snippet: c.snippet.replace(/\s+/g, ' ').trim().slice(0, 500) });
        }
      }
    } catch (err) {
      logger.warn('case-law evidence lookup failed', { err: (err as Error).message });
    }
  }

  return out.slice(0, 5);
}

/**
 * Run the resolution loop on a split. No-op for consensus results. `gatherFn`
 * and `callFn` are injectable for tests.
 */
export async function resolveDissent(result: DissentResult, opts: {
  /** The clause text the original panel saw. */
  context: string;
  userId?: string;
  /** The engagement's EFFECTIVE provider — gates external evidence egress. */
  provider?: string;
  panel?: PanelMember[];
  callFn?: (m: PanelMember, system: string, user: string) => Promise<string>;
  gatherFn?: (question: string, userId?: string, provider?: string) => Promise<DissentEvidence[]>;
}): Promise<DissentResult> {
  if (!result.dissent) return result;

  try {
    const gather = opts.gatherFn ?? gatherEvidence;
    const evidence = await gather(result.question, opts.userId, opts.provider ?? config.provider);

    // With nothing new to weigh, a re-vote is a coin re-flip, not a
    // resolution — the split stands and goes straight to a human.
    if (evidence.length === 0) {
      return {
        ...result,
        resolution: { evidence, revote: [], resolved: false, escalated: true, note: 'No corroborating authority found; the split stands — escalated to human review.' },
      };
    }

    const evidenceBlock =
      '\n\n--- RETRIEVED AUTHORITY (secondary — the document text controls) ---\n'
      + evidence.map(e => `[${e.source}] ${e.snippet}`).join('\n\n');

    const second = await runDissent({
      question: result.question,
      options: result.options,
      context: `${opts.context}${evidenceBlock}`,
      panel: opts.panel,
      callFn: opts.callFn,
    });

    const answered = second.verdicts.filter(v => !v.error);
    const labels = Object.keys(second.positions);
    // Convergence must be on one of the CALLER's options. A unanimous 'other'
    // (both panelists unparseable or off-list) is a parser artifact, not a
    // legal reading — telling the orchestrator to "adopt other" and crediting
    // the ledger on it would launder a non-answer. Escalate instead.
    const resolved = answered.length >= 2 && labels.length === 1 && result.options.includes(labels[0]);
    const finalLabel = resolved ? labels[0] : undefined;
    const note = resolved
      ? `Split resolved after evidence review — panel converged on "${finalLabel}".`
      : labels.length === 1
        ? 'Re-vote did not converge on a listed option — escalated to human review.'
        : 'Split persists after evidence review — escalated to human review.';

    return { ...result, resolution: { evidence, revote: second.verdicts, resolved, finalLabel, escalated: !resolved, note } };
  } catch (err) {
    logger.warn('resolution loop failed; escalating split unchanged', { err: (err as Error).message });
    return {
      ...result,
      resolution: { evidence: [], revote: [], resolved: false, escalated: true, note: `Resolution loop failed (${(err as Error).message}); the split stands — escalated to human review.` },
    };
  }
}
