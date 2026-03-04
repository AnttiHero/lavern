/**
 * Derivative Document Type Registry — Defines the document types that can be
 * intelligently generated from a completed Shem analysis session.
 *
 * Each type specifies:
 * - A system prompt that instructs Claude on document format, tone, and structure
 * - A context builder that assembles the relevant session data for generation
 *
 * Legal work generates more legal work. This registry makes it easy to produce
 * implementation guides, memos, checklists, board briefings, and more from
 * the primary analysis.
 */

import type { SessionState } from '../../session/session-state.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DerivativeType {
  id: string;
  title: string;
  description: string;
  icon: string;
  systemPrompt: string;
  buildContext: (session: SessionState) => string;
}

// ── Context Helpers ──────────────────────────────────────────────────────────

function formatFindings(session: SessionState, severities?: ('RED' | 'YELLOW' | 'GREEN')[]): string {
  const findings = severities
    ? session.debate.findings.filter(f => (severities as string[]).includes(f.severity))
    : session.debate.findings;

  if (findings.length === 0) return '(none)';

  return findings.map(f =>
    `- [${f.severity}] (${f.agentRole}, confidence ${(f.confidence * 100).toFixed(0)}%): ${f.content}`
      + (f.evidence.length > 0 ? `\n  Evidence: ${f.evidence.join('; ')}` : ''),
  ).join('\n');
}

function formatResolutions(session: SessionState): string {
  if (session.debate.resolutions.length === 0) return '(none)';

  return session.debate.resolutions.map(r =>
    `- **${r.debateTopic}**: ${r.resolution}\n`
    + `  Winner: ${r.winningPosition} | Evidence: ${r.evidenceWeight} | `
    + `Confidence: ${(r.confidence * 100).toFixed(0)}%`
    + (r.escalationNeeded ? ' | ⚠️ ESCALATION NEEDED' : ''),
  ).join('\n');
}

function formatScores(session: SessionState): string {
  if (session.beforeScores.length === 0 && session.afterScores.length === 0) return '(no scores available)';

  const dims = new Map<string, { before?: number; after?: number }>();
  for (const s of session.beforeScores) dims.set(s.dimension, { before: s.score });
  for (const s of session.afterScores) {
    const existing = dims.get(s.dimension) ?? {};
    dims.set(s.dimension, { ...existing, after: s.score });
  }

  return Array.from(dims.entries()).map(([dim, scores]) => {
    const before = scores.before?.toFixed(1) ?? '—';
    const after = scores.after?.toFixed(1) ?? '—';
    const delta = scores.before != null && scores.after != null
      ? ` (${scores.after >= scores.before ? '+' : ''}${(scores.after - scores.before).toFixed(1)})`
      : '';
    return `- ${dim}: ${before} → ${after}${delta}`;
  }).join('\n');
}

function formatGateDecisions(session: SessionState): string {
  if (session.gateDecisions.length === 0) return '(none)';

  return session.gateDecisions.map(g =>
    `- ${g.gateType}: ${g.decision}${g.notes ? ` — ${g.notes}` : ''}`,
  ).join('\n');
}

function matterTitle(session: SessionState): string {
  return session.matterRecord?.title ?? 'Analysis';
}

/** Build a full context block that all derivative types share. */
export function buildFullContext(session: SessionState): string {
  // v18: NEVER fall back to finalOutput — it contains process dumps.
  // If assembledDocument is empty, derivatives should work from findings/resolutions only.
  const deliverable = session.assembledDocument || '(deliverable not yet assembled)';

  return `# Analysis Context

## Matter
Title: ${matterTitle(session)}
${session.matterRecord?.matterNumber ? `Matter Number: ${session.matterRecord.matterNumber}` : ''}
${session.matterRecord ? `Status: ${session.matterRecord.status ?? 'active'}` : ''}

## Work Product (Primary Deliverable)
${deliverable}

## Key Findings
${formatFindings(session)}

## Debate Resolutions
${formatResolutions(session)}

## Quality Scores
${formatScores(session)}

## Gate Decisions
${formatGateDecisions(session)}

## Verification Summary
- Total checks: ${session.verificationResults.length}
- Passed: ${session.verificationResults.filter(v => v.passed).length}
- Failed: ${session.verificationResults.filter(v => !v.passed).length}

## Cost
- Spent: $${session.accumulatedCost.toFixed(2)}
- Budget: $${session.budgetUsd.toFixed(2)}`;
}

/** Build a client-safe context (no internal debate details, agent names cleaned). */
function buildClientContext(session: SessionState): string {
  const redYellow = session.debate.findings.filter(f => f.severity === 'RED' || f.severity === 'YELLOW');
  // v18: NEVER fall back to finalOutput — it contains process dumps.
  const deliverable = session.assembledDocument || '(deliverable not yet assembled)';

  return `# Analysis Context

## Matter
Title: ${matterTitle(session)}
${session.matterRecord?.matterNumber ? `Matter Number: ${session.matterRecord.matterNumber}` : ''}

## Work Product (Primary Deliverable)
${deliverable}

## Key Issues Identified
${redYellow.length > 0
    ? redYellow.map(f => `- [${f.severity}]: ${f.content}`).join('\n')
    : '(no critical issues found)'}

## Resolutions & Recommendations
${session.debate.resolutions.length > 0
    ? session.debate.resolutions.map(r => `- **${r.debateTopic}**: ${r.resolution}`).join('\n')
    : '(no formal resolutions)'}

## Quality Assessment
${formatScores(session)}`;
}

/** Build a risk-focused context (emphasizes RED findings, escalations, failures). */
function buildRiskContext(session: SessionState): string {
  const redFindings = session.debate.findings.filter(f => f.severity === 'RED');
  const escalations = session.debate.resolutions.filter(r => r.escalationNeeded);
  const failures = session.verificationResults.filter(v => !v.passed);

  return `# Risk Analysis Context

## Matter
Title: ${matterTitle(session)}
${session.matterRecord?.matterNumber ? `Matter Number: ${session.matterRecord.matterNumber}` : ''}

## Critical Findings (RED)
${redFindings.length > 0
    ? redFindings.map(f => `- ${f.content}\n  Evidence: ${f.evidence.join('; ')}\n  Confidence: ${(f.confidence * 100).toFixed(0)}%`).join('\n')
    : '(no critical findings)'}

## All Findings by Severity
${formatFindings(session)}

## Escalated Items
${escalations.length > 0
    ? escalations.map(r => `- ${r.debateTopic}: ${r.resolution}`).join('\n')
    : '(no escalations)'}

## Verification Failures
${failures.length > 0
    ? failures.map(v => `- ${v.verificationType} check by ${v.verifierRole}: ${v.findings.join('; ')}`).join('\n')
    : '(all checks passed)'}

## Quality Scores
${formatScores(session)}

## Full Work Product
${session.assembledDocument || '(deliverable not yet assembled)'}`;
}

// ── Derivative Types ─────────────────────────────────────────────────────────

export const DERIVATIVE_TYPES: Record<string, DerivativeType> = {
  'executive-memo': {
    id: 'executive-memo',
    title: 'Executive Memo',
    description: 'Formal memo for leadership',
    icon: '\uD83D\uDCDD',
    systemPrompt: `You are a senior legal professional drafting a formal executive memorandum.

Generate a 1-2 page executive memo based on the analysis provided. Use this format:

MEMORANDUM

TO:      [Leave as placeholder for user to fill]
FROM:    Legal Analysis Team
DATE:    ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
RE:      [Derived from matter title]

---

I. SITUATION OVERVIEW
Brief paragraph summarizing the matter and why analysis was conducted.

II. KEY FINDINGS
Numbered list of the most important findings, starting with critical (RED) items.
Each finding should be 1-2 sentences with clear business impact.

III. RECOMMENDATIONS
Concrete, actionable recommendations based on the analysis.
Prioritized by urgency and importance.

IV. NEXT STEPS
Specific actions with suggested timelines.

V. LIMITATIONS
Brief note on the scope of analysis and any caveats.

---

Guidelines:
- Write in formal business memo style
- Lead with the most important information
- Be concise but comprehensive
- Focus on business impact, not technical details
- Include appropriate legal disclaimers
- Output as clean Markdown`,
    buildContext: buildFullContext,
  },

  'board-briefing': {
    id: 'board-briefing',
    title: 'Board Briefing',
    description: 'Board-level risk summary',
    icon: '\uD83C\uDFDB\uFE0F',
    systemPrompt: `You are preparing a board briefing document for corporate directors and fiduciaries.

Generate a board briefing based on the analysis provided. Structure it as:

# BOARD BRIEFING
## [Matter Title]
### Prepared for Board Review — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

### EXECUTIVE SUMMARY
2-3 sentence overview suitable for board members who may not read further.

### RISK ASSESSMENT
A brief risk heat summary using this format:
- 🔴 **Critical**: [count and nature of critical risks]
- 🟡 **Elevated**: [count and nature of elevated risks]
- 🟢 **Managed**: [count and nature of managed risks]

### STRATEGIC IMPLICATIONS
How do the findings affect the organization's strategic position?
What are the second-order effects?

### FIDUCIARY CONSIDERATIONS
What should directors be aware of from a governance perspective?
Any duty-of-care or duty-of-loyalty implications?

### RECOMMENDED BOARD ACTIONS
Specific resolutions or approvals the board should consider.

### TIMELINE & URGENCY
What needs to happen and by when.

---

Guidelines:
- Write for a non-specialist audience at the board level
- Focus on strategic and governance implications, not technical details
- Be precise about risk levels and their business impact
- Highlight any items requiring board action or resolution
- Keep under 2 pages
- Include disclaimer about AI-assisted analysis
- Output as clean Markdown`,
    buildContext: buildRiskContext,
  },

  'implementation-guide': {
    id: 'implementation-guide',
    title: 'Implementation Guide',
    description: 'Step-by-step action plan',
    icon: '\uD83D\uDCCB',
    systemPrompt: `You are creating a practical implementation guide for a team that needs to put legal analysis recommendations into action.

Generate a detailed implementation guide based on the analysis provided. Structure it as:

# Implementation Guide
## [Matter Title]
### ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

### OVERVIEW
Brief summary of what needs to be implemented and why.

### IMPLEMENTATION PHASES

For each major recommendation, create a phase with:

#### Phase N: [Title]
- **Objective**: What this phase achieves
- **Owner**: [Leave as placeholder — e.g., "Legal/Compliance Team"]
- **Timeline**: Suggested timeframe
- **Steps**:
  1. Specific action step
  2. Specific action step
  3. ...
- **Dependencies**: What must be in place before this phase
- **Success Criteria**: How to know this phase is complete
- **Risks**: What could go wrong and how to mitigate

### MONITORING & REVIEW
How to track progress and measure success.
Suggested review cadence and KPIs.

### RESOURCE REQUIREMENTS
Estimated effort, budget, and personnel needed.

### ESCALATION PROCEDURES
When and how to escalate issues during implementation.

---

Guidelines:
- Make every step concrete and actionable
- Include realistic timelines
- Identify dependencies between phases
- Include success criteria that are measurable
- Consider resource constraints
- Output as clean Markdown`,
    buildContext: buildFullContext,
  },

  'compliance-checklist': {
    id: 'compliance-checklist',
    title: 'Compliance Checklist',
    description: 'Actionable compliance items',
    icon: '\u2705',
    systemPrompt: `You are creating a compliance checklist for a compliance team to work through.

Generate a structured compliance checklist based on the analysis provided. Format:

# Compliance Checklist
## [Matter Title]
### ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

Group checklist items by compliance area. For each area:

### [Compliance Area Name]

| # | Item | Priority | Responsible | Deadline | Status |
|---|------|----------|-------------|----------|--------|
| 1 | Specific compliance action | HIGH/MED/LOW | [Placeholder] | [Suggested] | ☐ |

After each table, include:

**Regulatory References**: Relevant regulations, standards, or internal policies.
**Evidence Required**: What documentation or proof of compliance is needed.

### ONGOING MONITORING
Items that require regular review rather than one-time completion.

### REPORTING REQUIREMENTS
What needs to be reported, to whom, and how often.

---

Guidelines:
- Derive checklist items directly from the analysis findings
- Prioritize based on severity (RED findings = HIGH priority)
- Include specific regulatory references where possible
- Make each item pass/fail testable
- Group logically by compliance domain
- Include both immediate and ongoing items
- Output as clean Markdown`,
    buildContext: buildFullContext,
  },

  'risk-register': {
    id: 'risk-register',
    title: 'Risk Register',
    description: 'Structured risk entries',
    icon: '\u26A0\uFE0F',
    systemPrompt: `You are creating a formal risk register from an analysis.

Generate a structured risk register based on the analysis provided. Format:

# Risk Register
## [Matter Title]
### Last Updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

### RISK SUMMARY
- Total risks identified: [count]
- Critical (RED): [count]
- Elevated (YELLOW): [count]
- Managed (GREEN): [count]

### RISK REGISTER

For each identified risk:

---

#### RISK-[NNN]: [Risk Title]

| Field | Detail |
|-------|--------|
| **Description** | Clear description of the risk |
| **Category** | Legal / Regulatory / Operational / Financial / Reputational |
| **Likelihood** | High / Medium / Low |
| **Impact** | Critical / Major / Moderate / Minor |
| **Risk Score** | [Likelihood × Impact] |
| **Current Controls** | What is currently in place |
| **Recommended Mitigation** | What should be done |
| **Owner** | [Placeholder] |
| **Review Date** | [Suggested date] |
| **Status** | Open / In Progress / Mitigated |

---

### RISK HEAT MAP SUMMARY
Brief textual summary of risk distribution.

### RISK APPETITE CONSIDERATIONS
How identified risks relate to organizational risk tolerance.

---

Guidelines:
- Derive risks directly from RED and YELLOW findings
- Use consistent scoring methodology
- Include both current and residual risk levels
- Make mitigation actions specific and actionable
- Include review dates
- Output as clean Markdown`,
    buildContext: buildRiskContext,
  },

  'client-letter': {
    id: 'client-letter',
    title: 'Client Letter',
    description: 'Professional advice letter',
    icon: '\u2709\uFE0F',
    systemPrompt: `You are drafting a formal client advice letter.

Generate a professional client letter based on the analysis provided. Format:

# [Firm Name — Leave as placeholder]

${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

**PRIVILEGED AND CONFIDENTIAL**

[Client Name — Leave as placeholder]
[Client Address — Leave as placeholder]

Re: [Matter Title]

---

Dear [Client Name],

**I. Introduction**
Thank you for engaging us regarding [matter]. This letter summarizes our analysis and recommendations.

**II. Background**
Brief, client-friendly recap of the situation and scope of analysis.

**III. Summary of Analysis**
Key findings presented in clear, non-technical language.
Organized by importance.

**IV. Our Advice**
Clear, actionable recommendations.
Where there are options, present them with pros and cons.

**V. Recommended Next Steps**
Specific actions for the client to take, with suggested priorities.

**VI. Limitations and Caveats**
Scope limitations, assumptions made, areas requiring further investigation.

Yours sincerely,

[Attorney Name — Leave as placeholder]
[Title — Leave as placeholder]

---

*This letter was prepared with the assistance of AI-powered legal analysis tools. The advice contained herein should be reviewed by qualified legal counsel before reliance.*

---

Guidelines:
- Write in professional but accessible language
- Avoid internal jargon — the client may not be a lawyer
- Do NOT include internal debate details, agent names, or system architecture
- Focus on what the client needs to know and do
- Present options where they exist
- Include appropriate privilege and confidentiality markings
- Output as clean Markdown`,
    buildContext: buildClientContext,
  },

  'matter-update': {
    id: 'matter-update',
    title: 'Status Update',
    description: 'Internal matter update',
    icon: '\uD83D\uDCCA',
    systemPrompt: `You are preparing an internal matter status update for the legal team.

Generate a status update based on the analysis provided. Format:

# Matter Status Update
## [Matter Title]
### ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

### STATUS: [COMPLETE / IN PROGRESS / ON HOLD]

### SUMMARY
2-3 sentence summary of current matter status.

### WORK COMPLETED
- Bullet list of analysis activities performed
- Include agent roles involved and their contributions
- Note key findings discovered during analysis

### KEY FINDINGS
| Severity | Finding | Confidence |
|----------|---------|------------|
| [RED/YELLOW/GREEN] | [Finding summary] | [%] |

### DEBATE & RESOLUTION
Summary of debates conducted and how they were resolved.
Note any items that required escalation.

### OUTSTANDING ITEMS
- Items still requiring attention
- Unresolved questions or risks
- Areas needing further investigation

### TIMELINE
- Analysis started: [date]
- Analysis completed: [date]
- Duration: [time]
- Next review: [suggested]

### BUDGET
- Allocated: $[amount]
- Spent: $[amount]
- Remaining: $[amount]

### NEXT STEPS
Specific actions and owners.

---

Guidelines:
- Write for an internal legal team audience
- Include operational details (cost, timeline, team)
- Be specific about what was and wasn't covered
- Flag outstanding items clearly
- Include budget information
- Output as clean Markdown`,
    buildContext: buildFullContext,
  },

  'training-brief': {
    id: 'training-brief',
    title: 'Training Brief',
    description: 'Educational issues summary',
    icon: '\uD83C\uDF93',
    systemPrompt: `You are creating an educational training brief based on issues found in a legal analysis.

Generate a training document based on the analysis provided. Format:

# Training Brief
## Lessons from: [Matter Title]
### ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

### PURPOSE
Why this training brief was created and who should read it.

### BACKGROUND
Brief context about the matter and type of analysis performed.

### KEY ISSUES EXPLAINED

For each significant issue found:

#### Issue N: [Title]

**What happened**: Plain-language description of the issue.

**Why it matters**: Business and legal significance.

**How it was identified**: What analysis revealed this issue.

**The right approach**: Best practice or correct handling.

**Common pitfalls**: Mistakes to avoid.

---

### LESSONS LEARNED
Numbered list of key takeaways from this analysis.

### BEST PRACTICES
Bullet list of best practices reinforced by this analysis.

### SELF-CHECK QUESTIONS
Questions practitioners can ask themselves to catch similar issues:
1. [Question]
2. [Question]
3. ...

### FURTHER READING
Suggested areas for deeper study based on the issues found.

---

Guidelines:
- Write in an educational, accessible tone
- Explain concepts — don't assume expertise
- Use the specific findings as teaching examples
- Include both what went wrong and what good practice looks like
- Make it practically useful, not theoretical
- Include self-assessment questions
- Output as clean Markdown`,
    buildContext: buildFullContext,
  },
};

/** List of derivative types for frontend display. */
export const DERIVATIVE_TYPE_LIST = Object.values(DERIVATIVE_TYPES).map(d => ({
  id: d.id,
  title: d.title,
  description: d.description,
  icon: d.icon,
}));
