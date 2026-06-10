/**
 * Findings Report — deterministic fallback deliverable.
 *
 * When LLM document assembly fails (or there is no orchestrator finalOutput
 * to assemble from), the session very often still holds the real value of
 * the engagement: cited findings on the debate board, debate resolutions,
 * clarification Q&A, and gate decisions. This module renders that state
 * into a structured markdown report with ZERO LLM calls — it cannot time
 * out, cannot be rejected by a quality gate, and cannot hallucinate.
 *
 * It is explicitly labeled as a structured findings report (not a polished
 * memo) so the reader knows what they are looking at.
 */

import type { SessionState } from '../session/session-state.js';
import type { LegalRequest } from '../types/index.js';
import type { Finding } from '../types/debate.js';

const SEVERITY_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
const SEVERITY_LABELS: Record<string, string> = {
  RED: 'Critical Findings',
  YELLOW: 'Significant Findings',
  GREEN: 'Observations & Confirmations',
};

/** Minimum findings for the report to be worth producing. */
const MIN_FINDINGS = 1;

/**
 * Render a deterministic findings report from session state.
 * Returns '' when the session has nothing substantive to report.
 */
export function buildFindingsReport(
  session: SessionState,
  request?: LegalRequest,
): string {
  const findings = session.debate.findings;
  if (findings.length < MIN_FINDINGS) return '';

  const lines: string[] = [];
  const title = session.matterRecord?.title
    ?? truncate(request?.requestText, 90)
    ?? 'Engagement Analysis';

  lines.push(`# ${title} — Structured Findings Report`);
  lines.push('');
  lines.push('> This is the structured findings report assembled directly from the team\'s analysis record. A separately polished narrative deliverable could not be produced for this session; every finding below is shown as the analyst posted it, with its evidence citations.');
  lines.push('');

  // ── Scope ────────────────────────────────────────────────────────────
  lines.push('## Scope of Review');
  lines.push('');
  if (request?.requestText) {
    lines.push(`**Request:** ${request.requestText.trim()}`);
    lines.push('');
  }
  if (session.documents.length > 0) {
    lines.push('**Documents reviewed:**');
    lines.push('');
    for (const doc of session.documents) {
      lines.push(`- ${doc.name} (${doc.pageCount} pages, ${doc.wordCount.toLocaleString()} words)`);
    }
    lines.push('');
  }
  const red = findings.filter(f => f.severity === 'RED').length;
  const yellow = findings.filter(f => f.severity === 'YELLOW').length;
  const green = findings.filter(f => f.severity === 'GREEN').length;
  lines.push(`**Analysis record:** ${findings.length} findings (${red} critical, ${yellow} significant, ${green} observations), ${session.debate.challenges.length} challenges, ${session.debate.resolutions.length} debate resolutions.`);
  lines.push('');

  // ── Clarifications from the client ───────────────────────────────────
  const clarifications = session.gateDecisions.filter(g => g.gateType === 'clarification');
  if (clarifications.length > 0) {
    lines.push('## Client Clarifications');
    lines.push('');
    for (const c of clarifications) {
      lines.push(`**Q:** ${c.summary}`);
      lines.push('');
      lines.push(c.answer && c.answer.trim()
        ? `**A (client statement):** ${c.answer.trim()}`
        : '**A:** _No answer provided — the team proceeded on stated assumptions tagged [A]._');
      lines.push('');
    }
  }

  // ── Findings grouped by severity ─────────────────────────────────────
  const grouped = [...findings].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));

  let currentSeverity = '';
  for (const finding of grouped) {
    if (finding.severity !== currentSeverity) {
      currentSeverity = finding.severity;
      lines.push(`## ${SEVERITY_LABELS[currentSeverity] ?? `${currentSeverity} Findings`}`);
      lines.push('');
    }
    lines.push(...renderFinding(finding));
  }

  // ── Debate resolutions ───────────────────────────────────────────────
  if (session.debate.resolutions.length > 0) {
    lines.push('## Debate Resolutions');
    lines.push('');
    for (const r of session.debate.resolutions) {
      lines.push(`### ${r.debateTopic}`);
      lines.push('');
      lines.push(r.resolution);
      lines.push('');
      lines.push(`_Winning position:_ ${r.winningPosition} · _Evidence weight:_ ${r.evidenceWeight} · _Confidence:_ ${Math.round(r.confidence * 100)}%${r.escalationNeeded ? ' · **Escalation to counsel recommended**' : ''}`);
      lines.push('');
    }
  }

  // ── Disclaimer ───────────────────────────────────────────────────────
  lines.push('## Important Notes');
  lines.push('');
  lines.push('This report organizes and explains the document record for review by qualified legal professionals. It is not legal advice. Findings tagged with lower confidence, marked uncertain, or based on client statements should be independently verified against the source documents before being relied upon.');
  lines.push('');

  return lines.join('\n');
}

function renderFinding(finding: Finding): string[] {
  const lines: string[] = [];
  const heading = truncate(finding.content.split(/[.\n]/)[0], 90) ?? finding.id;
  lines.push(`### ${finding.id} — ${heading}`);
  lines.push('');
  lines.push(finding.content.trim());
  lines.push('');
  if (finding.evidence.length > 0) {
    lines.push('**Evidence:**');
    lines.push('');
    for (const quote of finding.evidence) {
      lines.push(`> ${quote.replace(/\n/g, '\n> ')}`);
      lines.push('');
    }
  }
  lines.push(`_Posted by:_ ${finding.agentRole} · _Type:_ ${finding.findingType} · _Confidence:_ ${Math.round(finding.confidence * 100)}%${finding.groundingScore !== undefined ? ` · _Evidence grounding:_ ${Math.round(finding.groundingScore * 100)}%` : ''}`);
  lines.push('');
  return lines;
}

function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
