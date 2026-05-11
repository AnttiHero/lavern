/**
 * Debate Board MCP Tool — Shared state for agent collaboration.
 *
 * v3: Refactored to factory pattern — all state lives in SessionState.
 * Events emitted on every state mutation for visualization + API.
 *
 * The orchestrator MUST call resolve_debate to formally close each debate.
 * Resolution is a first-class auditable event — insurance reviewers can see
 * "Why did the system resolve this dispute this way?"
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import type { Finding, Challenge, Response, DebateResolution } from '../../types/debate.js';

/**
 * Strip process-text preambles from finding content before storing.
 * Agents sometimes prefix findings with "I'll analyze...", "Let me review..." —
 * this strips that preamble so users see only the substantive finding.
 */
const FINDING_PROCESS_PATTERNS = [
  /^I'll /i, /^I will /i, /^Let me /i, /^I need to/i, /^I see /i,
  /^I can see/i, /^I have /i, /^I've /i,
  /^OK[,.\s]/i, /^Okay/i, /^Sure/i, /^Certainly/i,
  /^Here is/i, /^Here's /i, /^Based on my/i,
  /^Looking at/i, /^After review/i, /^I'll get started/i,
  /^Let me check/i, /^I'll start/i, /^I'll now/i,
];

export function sanitizeFindingContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;

  // If the entire content is a single sentence matching a process pattern, keep it
  // (better than returning empty). Only strip if there's substantive content after.
  const sentences = trimmed.split(/(?<=\.)\s+/);
  if (sentences.length <= 1) return trimmed;

  // Find the first sentence that doesn't match a process pattern
  const firstSubstantiveIdx = sentences.findIndex(
    s => !FINDING_PROCESS_PATTERNS.some(p => p.test(s.trim())),
  );

  if (firstSubstantiveIdx <= 0) return trimmed; // No preamble or all substantive
  return sentences.slice(firstSubstantiveIdx).join(' ').trim();
}

export function createDebateBoardTools(session: SessionState) {
  const state = session.debate;
  const counters = session.debateCounters;

  const postFinding = tool(
    'post_finding',
    'Post a finding to the debate board. Used by agents to share their analysis results with other agents. Include confidence score (0.0-1.0) based on evidence strength.',
    {
      agent_role: z.string().describe('The role of the agent posting'),
      finding_type: z.enum([
        // Legacy legal-design types
        'score', 'dark-pattern', 'transformation', 'meaning-concern', 'comprehension',
        // Contract review types
        'contract-risk', 'contract-deviation', 'contract-standard',
        // Research types
        'research-citation', 'research-conflict', 'research-gap',
        // Adversarial types
        'adversarial-vulnerability', 'adversarial-edge-case', 'adversarial-ambiguity',
        // Counsel types
        'direct-answer', 'caveat',
        // Roundtable types
        'panel-insight', 'cross-domain-connection', 'dissenting-view',
        // Full Bench types
        'workstream-output', 'synthesis-gap', 'integration-risk',
        // Ethics reviewer
        'ETHICAL_CONCERN',
        // Uncertainty — agent declines to make a determination
        'UNCERTAIN', 'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS_DOCUMENT',
      ]).describe('Type of finding'),
      content: z.string().describe('The finding content — what was discovered'),
      severity: z.enum(['RED', 'YELLOW', 'GREEN']).describe('Severity classification'),
      evidence: z.array(z.string()).describe('Specific quotes or references from the document as evidence'),
      confidence: z.number().min(0).max(1).optional()
        .describe('Confidence in this finding (0.0-1.0). Based on evidence strength, not self-assessment. Default: 0.8'),
    },
    async (args) => {
      const sanitizedContent = sanitizeFindingContent(args.content);
      const finding: Finding = {
        id: `F-${String(++counters.finding).padStart(3, '0')}`,
        agentRole: args.agent_role as Finding['agentRole'],
        findingType: args.finding_type,
        content: sanitizedContent,
        severity: args.severity,
        evidence: args.evidence,
        confidence: args.confidence ?? 0.8,
        timestamp: eventTimestamp(),
        resolved: false,
      };
      boundedPush(state.findings, finding);

      session.events.emitEvent({
        type: 'finding_posted',
        findingId: finding.id,
        agent: args.agent_role,
        category: args.finding_type,
        severity: args.severity,
        confidence: finding.confidence,
        content: sanitizedContent,
        evidence: args.evidence,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{ type: 'text' as const, text: `Finding ${finding.id} posted. Severity: ${finding.severity}. Confidence: ${(finding.confidence * 100).toFixed(0)}%. Total findings: ${state.findings.length}.` }],
      };
    }
  );

  const declineToFind = tool(
    'decline_to_find',
    'Explicitly declare that you cannot make a confident determination about something. Use this when evidence is insufficient, the document is ambiguous, or you would be guessing. This is better than posting a low-confidence finding. It triggers human review.',
    {
      agent_role: z.string().describe('The role of the agent declining'),
      category: z.enum(['UNCERTAIN', 'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS_DOCUMENT'])
        .describe('Why you are declining: UNCERTAIN (general), INSUFFICIENT_EVIDENCE (document lacks info), AMBIGUOUS_DOCUMENT (could be read multiple ways)'),
      subject: z.string().describe('What you cannot determine (e.g., "whether the indemnification clause is mutual or one-sided")'),
      reason: z.string().describe('Why you cannot determine this — what specific evidence is missing or ambiguous'),
      attempted_evidence: z.array(z.string()).optional()
        .describe('Any partial evidence you did find that was not sufficient'),
    },
    async (args) => {
      const finding: Finding = {
        id: `F-${String(++counters.finding).padStart(3, '0')}`,
        agentRole: args.agent_role as Finding['agentRole'],
        findingType: args.category,
        content: `[DECLINED] ${args.subject}: ${args.reason}`,
        severity: 'YELLOW',  // Uncertainty is always YELLOW — not RED (that would overreact), not GREEN (that would hide it)
        evidence: args.attempted_evidence ?? [],
        confidence: 0.0,  // Explicitly zero — the agent is saying "I don't know"
        timestamp: eventTimestamp(),
        resolved: false,
      };
      boundedPush(state.findings, finding);

      session.events.emitEvent({
        type: 'uncertainty_declared',
        findingId: finding.id,
        agent: args.agent_role,
        reason: args.reason,
        category: args.category,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{ type: 'text' as const, text: `Uncertainty ${finding.id} declared: "${args.subject}". Category: ${args.category}. This will be flagged for human review. Total findings: ${state.findings.length}.` }],
      };
    }
  );

  const postChallenge = tool(
    'post_challenge',
    'Challenge another agent\'s finding. Used when an agent disagrees with or wants to question a finding posted by another agent.',
    {
      challenger_role: z.string().describe('The role of the agent issuing the challenge'),
      target_finding_id: z.string().describe('The ID of the finding being challenged (e.g., "F-001")'),
      challenge_text: z.string().describe('The challenge — why this finding is questioned'),
      evidence: z.array(z.string()).describe('Evidence supporting the challenge'),
    },
    async (args) => {
      const targetFinding = state.findings.find(f => f.id === args.target_finding_id);
      if (!targetFinding) {
        return {
          content: [{ type: 'text' as const, text: `Error: Finding ${args.target_finding_id} not found.` }],
        };
      }

      const challenge: Challenge = {
        id: `C-${String(++counters.challenge).padStart(3, '0')}`,
        challengerRole: args.challenger_role as Challenge['challengerRole'],
        targetFindingId: args.target_finding_id,
        challengeText: args.challenge_text,
        evidence: args.evidence,
        timestamp: eventTimestamp(),
        resolved: false,
      };
      boundedPush(state.challenges, challenge);

      session.events.emitEvent({
        type: 'challenge_posted',
        challengeId: challenge.id,
        challenger: args.challenger_role,
        targetFindingId: args.target_finding_id,
        challengeText: args.challenge_text,
        evidence: args.evidence,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{ type: 'text' as const, text: `Challenge ${challenge.id} posted against ${args.target_finding_id} (by ${targetFinding.agentRole}). Awaiting response.` }],
      };
    }
  );

  const postResponse = tool(
    'post_response',
    'Respond to a challenge. Used by the challenged agent to defend, revise, or accept the challenge.',
    {
      responder_role: z.string().describe('The role of the agent responding'),
      challenge_id: z.string().describe('The ID of the challenge being responded to'),
      response_text: z.string().describe('The response — defense, revision, or acceptance'),
      revised_position: z.string().optional().describe('If revising, the new position'),
      accepted: z.boolean().describe('Whether the challenge is accepted (true = revised, false = maintained)'),
    },
    async (args) => {
      const targetChallenge = state.challenges.find(c => c.id === args.challenge_id);
      if (!targetChallenge) {
        return {
          content: [{ type: 'text' as const, text: `Error: Challenge ${args.challenge_id} not found.` }],
        };
      }

      const response: Response = {
        id: `R-${String(++counters.response).padStart(3, '0')}`,
        responderRole: args.responder_role as Response['responderRole'],
        challengeId: args.challenge_id,
        responseText: args.response_text,
        revisedPosition: args.revised_position,
        accepted: args.accepted,
        timestamp: eventTimestamp(),
      };
      boundedPush(state.responses, response);
      targetChallenge.resolved = true;

      if (args.accepted && args.revised_position) {
        const finding = state.findings.find(f => f.id === targetChallenge.targetFindingId);
        if (finding) {
          finding.content = args.revised_position;
          finding.resolved = true;
        }
      }

      session.events.emitEvent({
        type: 'response_posted',
        responseId: response.id,
        responder: args.responder_role,
        challengeId: args.challenge_id,
        accepted: args.accepted,
        responseText: args.response_text,
        revisedPosition: args.revised_position,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{ type: 'text' as const, text: `Response ${response.id} to ${args.challenge_id}: ${args.accepted ? 'ACCEPTED (revised)' : 'MAINTAINED (defended)'}` }],
      };
    }
  );

  const resolveDebate = tool(
    'resolve_debate',
    'Formally resolve a debate. The orchestrator MUST call this to close each debate topic. Creates a first-class auditable resolution record. Insurance reviewers will see this.',
    {
      debate_topic: z.string().describe('What the debate was about'),
      finding_ids: z.array(z.string()).describe('IDs of findings involved in the debate'),
      resolution: z.string().describe('What was decided'),
      winning_position: z.string().describe('Which position prevailed and why'),
      evidence_weight: z.string().describe('Why this position won — what evidence was most compelling'),
      confidence: z.number().min(0).max(1).describe('Confidence in the resolution (0.0-1.0)'),
      escalation_needed: z.boolean().describe('Should this be escalated to human review?'),
      resolved_by: z.string().describe('Which agent role resolved this (usually "orchestrator")'),
    },
    async (args) => {
      const resolution: DebateResolution = {
        id: `DR-${String(++counters.resolution).padStart(3, '0')}`,
        debateTopic: args.debate_topic,
        findingIds: args.finding_ids,
        resolution: args.resolution,
        winningPosition: args.winning_position,
        evidenceWeight: args.evidence_weight,
        confidence: args.confidence,
        escalationNeeded: args.escalation_needed,
        resolvedBy: args.resolved_by as DebateResolution['resolvedBy'],
        timestamp: eventTimestamp(),
      };
      boundedPush(state.resolutions, resolution);

      for (const fid of args.finding_ids) {
        const finding = state.findings.find(f => f.id === fid);
        if (finding) finding.resolved = true;
      }

      session.events.emitEvent({
        type: 'debate_resolved',
        resolutionId: resolution.id,
        topic: args.debate_topic,
        resolution: args.resolution,
        confidence: args.confidence,
        winningPosition: args.winning_position,
        evidenceWeight: args.evidence_weight,
        escalationNeeded: args.escalation_needed,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Debate resolved: ${resolution.id}\n**Topic**: ${args.debate_topic}\n**Winner**: ${args.winning_position}\n**Confidence**: ${(args.confidence * 100).toFixed(0)}%\n${args.escalation_needed ? '\u26a0\ufe0f ESCALATION RECOMMENDED \u2014 route to human review.' : '\u2705 Resolution accepted.'}`,
        }],
      };
    }
  );

  const getUnresolvedDebates = tool(
    'get_unresolved_debates',
    'Get all unresolved debate topics \u2014 findings that have been challenged but not formally resolved. The orchestrator must resolve ALL debates before advancing the workflow.',
    {},
    async () => {
      const unresolvedChallenges = state.challenges.filter(c => !c.resolved);
      const challengedButUnresolved = state.challenges
        .filter(c => c.resolved)
        .filter(c => {
          return !state.resolutions.some(r => r.findingIds.includes(c.targetFindingId));
        });

      const allUnresolved = [
        ...unresolvedChallenges.map(c => `PENDING CHALLENGE: ${c.id} against ${c.targetFindingId} \u2014 ${c.challengeText.slice(0, 80)}`),
        ...challengedButUnresolved.map(c => `NEEDS RESOLUTION: ${c.id} (responded but not formally resolved) \u2014 ${c.challengeText.slice(0, 80)}`),
        ...state.findings.filter(f => !f.resolved && f.severity === 'RED').map(f => `RED FINDING UNRESOLVED: ${f.id} \u2014 ${f.content.slice(0, 80)}`),
      ];

      return {
        content: [{
          type: 'text' as const,
          text: allUnresolved.length > 0
            ? `## Unresolved Debates (${allUnresolved.length})\n\n${allUnresolved.join('\n')}\n\n\u26a0\ufe0f All debates must be formally resolved before advancing the workflow.`
            : '\u2705 All debates have been formally resolved.',
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const getFindings = tool(
    'get_findings',
    'Get all findings on the debate board, optionally filtered by agent or severity.',
    {
      filter_by_agent: z.string().optional().describe('Filter by agent role'),
      filter_by_severity: z.enum(['RED', 'YELLOW', 'GREEN']).optional().describe('Filter by severity'),
      unresolved_only: z.boolean().optional().describe('Only return unresolved findings'),
    },
    async (args) => {
      let results = [...state.findings];
      if (args.filter_by_agent) results = results.filter(f => f.agentRole === args.filter_by_agent);
      if (args.filter_by_severity) results = results.filter(f => f.severity === args.filter_by_severity);
      if (args.unresolved_only) results = results.filter(f => !f.resolved);

      const summary = results.map(f =>
        `${f.id} [${f.severity}] (${f.agentRole}) [${(f.confidence * 100).toFixed(0)}%]: ${f.content}\n  Evidence: ${f.evidence.join('; ')}`
      ).join('\n\n');

      return {
        content: [{ type: 'text' as const, text: results.length > 0 ? summary : 'No findings match the criteria.' }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const getChallenges = tool(
    'get_challenges',
    'Get all challenges on the debate board, optionally filtered by target agent.',
    {
      target_agent: z.string().optional().describe('Filter challenges targeting this agent'),
      unresolved_only: z.boolean().optional().describe('Only return unresolved challenges'),
    },
    async (args) => {
      let results = [...state.challenges];
      if (args.target_agent) {
        results = results.filter(c => {
          const finding = state.findings.find(f => f.id === c.targetFindingId);
          return finding?.agentRole === args.target_agent;
        });
      }
      if (args.unresolved_only) results = results.filter(c => !c.resolved);

      const summary = results.map(c => {
        const finding = state.findings.find(f => f.id === c.targetFindingId);
        const response = state.responses.find(r => r.challengeId === c.id);
        return `${c.id} (${c.challengerRole} challenges ${finding?.agentRole}): ${c.challengeText}\n  Target: ${c.targetFindingId}\n  Status: ${response ? (response.accepted ? 'ACCEPTED' : 'DEFENDED') : 'PENDING'}`;
      }).join('\n\n');

      return {
        content: [{ type: 'text' as const, text: results.length > 0 ? summary : 'No challenges match the criteria.' }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const auditDebateCoherence = tool(
    'audit_debate_coherence',
    'Audit debate resolutions for coherence before synthesis. Checks for contradictions, confidence inversions, orphan findings, topic overlaps, and ignored challenges. Run this AFTER resolving all debates and BEFORE advancing to verification or synthesis.',
    {},
    async () => {
      const issues: Array<{
        type: 'coverage_gap' | 'confidence_inversion' | 'orphan_finding' | 'topic_overlap' | 'ignored_challenge';
        severity: 'RED' | 'YELLOW' | 'GREEN';
        description: string;
        resolutionIds: string[];
        findingIds: string[];
      }> = [];

      // Check 1: Coverage — every RED finding must appear in at least one resolution
      const redFindings = state.findings.filter(f => f.severity === 'RED');
      const resolvedFindingIds = new Set(state.resolutions.flatMap(r => r.findingIds));
      for (const f of redFindings) {
        if (!resolvedFindingIds.has(f.id)) {
          issues.push({
            type: 'coverage_gap',
            severity: 'RED',
            description: `RED finding ${f.id} ("${f.content.slice(0, 80)}") is not covered by any resolution`,
            resolutionIds: [],
            findingIds: [f.id],
          });
        }
      }

      // Check 2: Confidence inversion — resolution confidence >0.2 below finding average
      for (const r of state.resolutions) {
        const resolvedFindings = state.findings.filter(f => r.findingIds.includes(f.id));
        if (resolvedFindings.length === 0) continue;
        const avgFindingConfidence = resolvedFindings.reduce((s, f) => s + f.confidence, 0) / resolvedFindings.length;
        const delta = avgFindingConfidence - r.confidence;
        if (delta > 0.2) {
          issues.push({
            type: 'confidence_inversion',
            severity: 'YELLOW',
            description: `Resolution ${r.id} ("${r.debateTopic}") has confidence ${(r.confidence * 100).toFixed(0)}% but resolves findings averaging ${(avgFindingConfidence * 100).toFixed(0)}% — gap of ${(delta * 100).toFixed(0)}pp`,
            resolutionIds: [r.id],
            findingIds: r.findingIds,
          });
        }
      }

      // Check 3: Orphan detection — findings not in ANY resolution (YELLOW/RED only)
      for (const f of state.findings) {
        if (f.severity === 'GREEN') continue;
        if (!resolvedFindingIds.has(f.id)) {
          // RED orphans already caught in Check 1; only add YELLOW here
          if (f.severity === 'YELLOW') {
            issues.push({
              type: 'orphan_finding',
              severity: 'YELLOW',
              description: `YELLOW finding ${f.id} ("${f.content.slice(0, 80)}") is not referenced by any resolution`,
              resolutionIds: [],
              findingIds: [f.id],
            });
          }
        }
      }

      // Check 4: Topic overlap — same finding referenced by multiple resolutions
      const findingToResolutions = new Map<string, string[]>();
      for (const r of state.resolutions) {
        for (const fid of r.findingIds) {
          const existing = findingToResolutions.get(fid) || [];
          existing.push(r.id);
          findingToResolutions.set(fid, existing);
        }
      }
      for (const [fid, rids] of findingToResolutions) {
        if (rids.length > 1) {
          issues.push({
            type: 'topic_overlap',
            severity: 'RED',
            description: `Finding ${fid} is resolved by multiple resolutions (${rids.join(', ')}) — potential contradiction`,
            resolutionIds: rids,
            findingIds: [fid],
          });
        }
      }

      // Check 5: Challenge coverage — unanswered challenges on resolved findings
      for (const c of state.challenges) {
        const hasResponse = state.responses.some(r => r.challengeId === c.id);
        if (!hasResponse) {
          const finding = state.findings.find(f => f.id === c.targetFindingId);
          if (finding?.resolved) {
            issues.push({
              type: 'ignored_challenge',
              severity: 'YELLOW',
              description: `Challenge ${c.id} against ${c.targetFindingId} ("${c.challengeText.slice(0, 80)}") was never answered but finding was resolved anyway`,
              resolutionIds: state.resolutions.filter(r => r.findingIds.includes(c.targetFindingId)).map(r => r.id),
              findingIds: [c.targetFindingId],
            });
          }
        }
      }

      // Metrics
      const redFindingsTotal = redFindings.length;
      const redFindingsCovered = redFindings.filter(f => resolvedFindingIds.has(f.id)).length;
      const avgResConf = state.resolutions.length > 0
        ? state.resolutions.reduce((s, r) => s + r.confidence, 0) / state.resolutions.length
        : 0;
      const avgFindConf = state.findings.length > 0
        ? state.findings.reduce((s, f) => s + f.confidence, 0) / state.findings.length
        : 0;

      const passed = !issues.some(i => i.severity === 'RED' || i.severity === 'YELLOW');

      const report = {
        passed,
        issues,
        metrics: {
          totalResolutions: state.resolutions.length,
          totalFindings: state.findings.length,
          redFindingsCovered,
          redFindingsTotal,
          averageResolutionConfidence: Math.round(avgResConf * 100) / 100,
          averageFindingConfidence: Math.round(avgFindConf * 100) / 100,
        },
      };

      const issueText = issues.length > 0
        ? issues.map(i => `- [${i.severity}] ${i.type}: ${i.description}`).join('\n')
        : '(none)';

      return {
        content: [{
          type: 'text' as const,
          text: `## Debate Coherence Audit — ${passed ? '\u2705 PASSED' : '\u274c FAILED'}

**Issues**: ${issues.length} (RED: ${issues.filter(i => i.severity === 'RED').length}, YELLOW: ${issues.filter(i => i.severity === 'YELLOW').length}, GREEN: ${issues.filter(i => i.severity === 'GREEN').length})
${issueText}

**Metrics**:
- Resolutions: ${report.metrics.totalResolutions} | Findings: ${report.metrics.totalFindings}
- RED coverage: ${redFindingsCovered}/${redFindingsTotal}
- Avg resolution confidence: ${(avgResConf * 100).toFixed(0)}% | Avg finding confidence: ${(avgFindConf * 100).toFixed(0)}%`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const getDebateSummary = tool(
    'get_debate_summary',
    'Get a full summary of the debate board \u2014 all findings, challenges, resolutions, and formal debate closures.',
    {},
    async () => {
      const redFindings = state.findings.filter(f => f.severity === 'RED').length;
      const yellowFindings = state.findings.filter(f => f.severity === 'YELLOW').length;
      const greenFindings = state.findings.filter(f => f.severity === 'GREEN').length;
      const unresolvedChallenges = state.challenges.filter(c => !c.resolved).length;
      const avgConfidence = state.findings.length > 0
        ? state.findings.reduce((sum, f) => sum + f.confidence, 0) / state.findings.length
        : 0;

      const summary = `
## Debate Board Summary

**Findings**: ${state.findings.length} total (RED: ${redFindings}, YELLOW: ${yellowFindings}, GREEN: ${greenFindings})
**Average Confidence**: ${(avgConfidence * 100).toFixed(0)}%
**Challenges**: ${state.challenges.length} total (${unresolvedChallenges} unresolved)
**Responses**: ${state.responses.length} total
**Formal Resolutions**: ${state.resolutions.length}

### All Findings
${state.findings.map(f => `- ${f.id} [${f.severity}] (${f.agentRole}) [${(f.confidence * 100).toFixed(0)}%]: ${f.content}`).join('\n')}

### Formal Debate Resolutions
${state.resolutions.map(r => `- ${r.id}: "${r.debateTopic}" \u2192 ${r.winningPosition} (${(r.confidence * 100).toFixed(0)}% confidence)${r.escalationNeeded ? ' \u26a0\ufe0f ESCALATION' : ''}`).join('\n') || '(none yet \u2014 orchestrator must call resolve_debate)'}

### Unresolved Challenges
${state.challenges.filter(c => !c.resolved).map(c => `- ${c.id}: ${c.challengeText}`).join('\n') || '(none)'}
`.trim();

      return {
        content: [{ type: 'text' as const, text: summary }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [
    postFinding,
    declineToFind,
    postChallenge,
    postResponse,
    resolveDebate,
    getFindings,
    getChallenges,
    getUnresolvedDebates,
    getDebateSummary,
    auditDebateCoherence,
  ];
}
