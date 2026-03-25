/**
 * Types for the Debate Board — the shared state where agents
 * post findings, challenge each other, and resolve conflicts.
 *
 * v2: Added DebateResolution for formal debate closure.
 * Added confidence to findings. Resolution is a first-class auditable event.
 */

import type { AgentRole, Severity } from './index.js';

export interface Finding {
  id: string;
  agentRole: AgentRole;
  findingType: 'score' | 'dark-pattern' | 'transformation' | 'meaning-concern' | 'comprehension'
    // v5: Contract review finding types
    | 'contract-risk' | 'contract-deviation' | 'contract-standard'
    // v6: Research finding types
    | 'research-citation' | 'research-conflict' | 'research-gap'
    // v6: Adversarial finding types
    | 'adversarial-vulnerability' | 'adversarial-edge-case' | 'adversarial-ambiguity'
    // v11: Counsel pattern
    | 'direct-answer' | 'caveat'
    // v11: Roundtable pattern
    | 'panel-insight' | 'cross-domain-connection' | 'dissenting-view'
    // v11: Full Bench pattern
    | 'workstream-output' | 'synthesis-gap' | 'integration-risk'
    // v14: Ethics reviewer
    | 'ETHICAL_CONCERN'
    // v14: Uncertainty — agent declines to make a determination
    | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE' | 'AMBIGUOUS_DOCUMENT';
  content: string;
  severity: Severity;
  evidence: string[];
  confidence: number;  // 0.0-1.0 — operational confidence in this finding
  groundingScore?: number;  // 0.0-1.0 — mechanical evidence grounding (computed post-hoc)
  timestamp: string;
  resolved: boolean;
}

export interface Challenge {
  id: string;
  challengerRole: AgentRole;
  targetFindingId: string;
  challengeText: string;
  evidence: string[];
  timestamp: string;
  resolved: boolean;
}

export interface Response {
  id: string;
  responderRole: AgentRole;
  challengeId: string;
  responseText: string;
  revisedPosition?: string;
  accepted: boolean;
  timestamp: string;
}

/**
 * Formal debate resolution — first-class auditable event.
 * Insurance reviewers can see: "Why did the system resolve this dispute this way?"
 */
export interface DebateResolution {
  id: string;
  debateTopic: string;
  findingIds: string[];
  resolution: string;
  winningPosition: string;
  evidenceWeight: string;
  confidence: number;
  escalationNeeded: boolean;
  resolvedBy: AgentRole;
  timestamp: string;
}

export interface DebateRound {
  roundNumber: number;
  findings: Finding[];
  challenges: Challenge[];
  responses: Response[];
  resolutions: DebateResolution[];
  escalatedToHuman: boolean;
}

export interface DebateState {
  findings: Finding[];
  challenges: Challenge[];
  responses: Response[];
  resolutions: DebateResolution[];
  rounds: DebateRound[];
}
