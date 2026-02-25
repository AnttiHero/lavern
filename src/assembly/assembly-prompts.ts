/**
 * Assembly Prompts — Task-type-specific system prompts for the
 * document assembly step.
 *
 * The multi-agent analysis produces structured intelligence (findings,
 * debates, verification). The assembly step turns that intelligence
 * into a professional deliverable document.
 *
 * Key principle: the multi-agent analysis is the INPUT to drafting,
 * not the output. The assembly prompt is a focused Claude call that
 * produces ONLY the clean deliverable — no process notes, no agent
 * commentary, no internal coordination text.
 */

import type { SessionState } from '../session/session-state.js';
import type { LegalRequest } from '../types/index.js';

// ── Shared preamble ban — appended to every system prompt ─────────────

const NO_PROCESS_TEXT = `

## CRITICAL OUTPUT RULES — STRICTLY ENFORCED

Your output will be delivered DIRECTLY to a client as-is. Every word you write becomes the deliverable.

NEVER include ANY of the following in your output:
- Planning text ("I'll start by...", "Let me...", "First, I need to...")
- Commentary ("Here is the document...", "Based on the analysis...", "I've incorporated...")
- Internal reasoning ("The findings suggest...", "Given that the ethics auditor...", "Considering the debate resolution...")
- Meta-references to the analysis process ("The multi-agent analysis found...", "According to the expert panel...")
- Self-referential statements ("In this document...", "This memo addresses...")
- Transition text between your thinking and the document

Your FIRST character of output must be the FIRST character of the deliverable document (typically "#" for a Markdown heading).

If the deliverable is a Terms of Service, output ONLY the Terms of Service.
If the deliverable is a research memo, output ONLY the research memo.
If the deliverable is a review report, output ONLY the review report.

ZERO preamble. ZERO commentary. ZERO process notes.`;

// ── System Prompts by Task Type ─────────────────────────────────────────

const DRAFTING_SYSTEM_PROMPT = `You are a senior legal professional producing a final deliverable document.

You have been given the results of a comprehensive multi-agent analysis — ethics audits, plain-language reviews, service design insights, client-perspective testing, and structured debates. Your job is to draft a complete, professional document that incorporates ALL of these insights.

## Rules

1. Produce ONLY the document itself. No preamble, no commentary, no "here is the document", no explanation of your process. Just the document.
2. The document must be complete — every section, every clause, every provision. Not a summary. Not an outline. The actual document.
3. Incorporate the expert findings DIRECTLY into the text. If the ethics auditor flagged dark patterns in auto-renewal, draft the auto-renewal clause to be fair and transparent. If the plain-language specialist recommended shorter sentences, write short sentences.
4. Use Markdown formatting with proper heading hierarchy (# → ## → ###).
5. Include a Table of Contents at the top.
6. Use user-friendly, plain language as the default. Reserve legal precision for clauses that require it.
7. Where findings conflict, favor the resolution from the debate. If no resolution exists, favor the user-protective interpretation.
8. Preserve ALL legal requirements from the brief. Do not omit sections because they seem minor.
9. Include placeholder brackets [like this] for information that wasn't provided (addresses, dates, specific URLs).
10. If the analysis identified dark patterns or problematic provisions, draft BETTER alternatives — don't just flag them.` + NO_PROCESS_TEXT;

const REVIEW_SYSTEM_PROMPT = `You are a senior legal professional producing a document review deliverable.

You have been given the results of a comprehensive multi-agent analysis — legal review, ethics audits, risk assessment, service design insights, and structured debates. Your job is to produce a clear, actionable review report that a client can use to improve their document.

## Rules

1. Produce ONLY the review report. No preamble, no "here is the report". Just the deliverable.
2. Structure the report as:
   - Executive Summary (2-3 paragraphs max)
   - Critical Issues (RED findings — things that must change)
   - Recommended Changes (YELLOW findings — things that should change)
   - Observations (GREEN findings — things that are fine or minor)
   - Specific Redline Suggestions (exact before/after text for key changes)
   - Risk Assessment (overall risk profile)
   - Recommended Next Steps
3. For each issue, provide:
   - The specific clause or section affected
   - Why it's a problem (citing the expert analysis)
   - A concrete suggested fix (not just "consider revising")
4. Incorporate debate resolutions — if experts disagreed and resolved it, present the resolution.
5. Use Markdown formatting. Be concise but comprehensive.
6. Prioritize by severity — critical issues first.` + NO_PROCESS_TEXT;

const RESEARCH_SYSTEM_PROMPT = `You are a senior legal professional producing a research memo.

You have been given the results of a comprehensive multi-agent analysis — legal research, expert opinions, risk assessment, and structured debates. Your job is to produce a clear, well-structured research memorandum.

## Rules

1. Produce ONLY the memo. No preamble. Just the deliverable.
2. Structure as:
   - Question Presented
   - Short Answer
   - Background / Facts
   - Analysis (organized by issue, citing expert findings)
   - Conclusion
   - Recommended Next Steps
3. Where experts debated, present both sides and the resolution.
4. Be precise about legal citations and references.
5. Use Markdown formatting. Professional but accessible tone.` + NO_PROCESS_TEXT;

const GENERAL_SYSTEM_PROMPT = `You are a senior legal professional producing a deliverable document.

You have been given the results of a comprehensive multi-agent analysis. Your job is to produce a clear, professional document that incorporates all of the expert findings and debate resolutions.

## Rules

1. Produce ONLY the document. No preamble, no commentary. Just the deliverable.
2. Structure the document logically with clear sections and headings.
3. Incorporate expert findings directly — don't just list them, use them to inform the content.
4. Use Markdown formatting with proper heading hierarchy.
5. Be comprehensive but concise. Every sentence should add value.
6. Where findings conflict, favor the resolution from the debate.` + NO_PROCESS_TEXT;

// ── Prompt Selection ────────────────────────────────────────────────────

export function getAssemblySystemPrompt(requestType: string): string {
  switch (requestType) {
    case 'document_redesign':
      return DRAFTING_SYSTEM_PROMPT;
    case 'contract_review':
      return REVIEW_SYSTEM_PROMPT;
    case 'legal_research':
      return RESEARCH_SYSTEM_PROMPT;
    case 'legal_question':
      return RESEARCH_SYSTEM_PROMPT;
    case 'risk_assessment':
      return REVIEW_SYSTEM_PROMPT;
    default:
      return GENERAL_SYSTEM_PROMPT;
  }
}

// ── Context Assembly ────────────────────────────────────────────────────

/**
 * Build the user prompt for the assembly call. This provides ALL the
 * structured analysis data that the assembly should incorporate.
 */
export function buildAssemblyContext(session: SessionState, request?: LegalRequest): string {
  const parts: string[] = [];

  // ── Original Request ──
  parts.push('# ORIGINAL REQUEST');
  if (request?.requestText) {
    parts.push(request.requestText);
  } else if (session.matterRecord?.title) {
    parts.push(`Matter: ${session.matterRecord.title}`);
  }
  parts.push('');

  // ── Document Content (if available) ──
  if (session.documents.length > 0) {
    parts.push('# SOURCE DOCUMENTS');
    for (const doc of session.documents) {
      parts.push(`## ${doc.name}`);
      // Include full text from sections
      for (const section of doc.sections) {
        if (section.heading) parts.push(`### ${section.heading}`);
        parts.push(section.content);
        parts.push('');
      }
    }
    parts.push('');
  }

  // ── Expert Findings (grouped by theme) ──
  const findings = session.debate.findings;
  if (findings.length > 0) {
    parts.push('# EXPERT ANALYSIS FINDINGS');
    parts.push(`${findings.length} findings from the multi-agent analysis panel:\n`);

    // Group by finding type for better organization
    const byType = new Map<string, typeof findings>();
    for (const f of findings) {
      const type = f.findingType || 'general';
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(f);
    }

    // Show RED findings first, then YELLOW, then GREEN
    const severityOrder = ['RED', 'YELLOW', 'GREEN'];
    for (const severity of severityOrder) {
      const sevFindings = findings.filter(f => f.severity === severity);
      if (sevFindings.length === 0) continue;

      parts.push(`## ${severity} Findings (${sevFindings.length})`);
      for (const f of sevFindings) {
        parts.push(`- **[${f.agentRole}]** ${f.content}`);
        if (f.evidence.length > 0) {
          parts.push(`  Evidence: ${f.evidence.join('; ')}`);
        }
      }
      parts.push('');
    }
  }

  // ── Debate Resolutions ──
  if (session.debate.resolutions.length > 0) {
    parts.push('# DEBATE RESOLUTIONS');
    parts.push('Expert debates were resolved as follows:\n');
    for (const r of session.debate.resolutions) {
      parts.push(`## ${r.debateTopic}`);
      parts.push(`**Resolution:** ${r.resolution}`);
      parts.push(`**Winning position:** ${r.winningPosition}`);
      parts.push(`**Evidence weight:** ${r.evidenceWeight}`);
      if (r.escalationNeeded) {
        parts.push('**Note:** Escalation was flagged for human review.');
      }
      parts.push('');
    }
  }

  // ── Verification Results ──
  if (session.verificationResults.length > 0) {
    parts.push('# VERIFICATION RESULTS');
    for (const v of session.verificationResults) {
      const status = v.passed ? 'PASSED' : 'FAILED';
      parts.push(`- ${v.verificationType} verification (${v.verifierRole}): ${status}`);
      if (v.findings.length > 0) {
        parts.push(`  Details: ${v.findings.join('; ')}`);
      }
    }
    parts.push('');
  }

  // ── Gate Decisions ──
  if (session.gateDecisions.length > 0) {
    parts.push('# GATE DECISIONS');
    for (const g of session.gateDecisions) {
      parts.push(`- ${g.gateType}: ${g.decision}${g.notes ? ` — ${g.notes}` : ''}`);
    }
    parts.push('');
  }

  // ── Instructions ──
  parts.push('# YOUR TASK');
  parts.push('Using ALL of the expert analysis above, produce the final deliverable document.');
  parts.push('Incorporate every relevant finding directly into the document — do not produce a report about findings, produce the actual document that reflects them.');
  parts.push('The multi-agent analysis is your guide. Use it to make every provision better than what a single drafter could produce alone.');

  return parts.join('\n');
}
