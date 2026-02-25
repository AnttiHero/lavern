/**
 * Phase descriptions — narrative text + estimated duration per workflow phase.
 *
 * Replaces silent progress dots with proactive communication.
 * Like a partner saying "We're currently reviewing the analysis..."
 *
 * v16: Added statusVerb (for heartbeat band) and silenceMessages
 *      (rotating reassurance during long silences).
 */

import type { WorkflowStep } from '../../types/events.js';

export interface PhaseInfo {
  label: string;
  description: string;
  estimatedMinutes: number;
  /** Present-tense verb phrase for the heartbeat narrative. */
  statusVerb: string;
  /** Rotating messages shown during long silences in this phase. */
  silenceMessages: string[];
}

export const PHASE_DESCRIPTIONS: Record<WorkflowStep, PhaseInfo> = {
  intake: {
    label: 'Intake',
    description: 'Agents are reading and understanding your briefing',
    estimatedMinutes: 1,
    statusVerb: 'Reading your briefing...',
    silenceMessages: [
      'Your team is carefully reading every clause in your document',
      'Building a complete understanding before analysis begins',
    ],
  },
  parallel_analysis: {
    label: 'Analysis',
    description: 'Your team is examining the document from multiple angles',
    estimatedMinutes: 3,
    statusVerb: 'Analyzing your document...',
    silenceMessages: [
      'Multiple specialists are examining your document simultaneously',
      'Each agent brings different expertise — compliance, ethics, readability, legal accuracy',
      'Complex clauses require careful reading — your team is being thorough',
    ],
  },
  debate_1: {
    label: 'First Review',
    description: 'Specialists are challenging each other\'s findings',
    estimatedMinutes: 2,
    statusVerb: 'Agents are debating findings...',
    silenceMessages: [
      'Your specialists are constructively challenging each other\'s analysis',
      'Adversarial debate ensures nothing is missed',
      'This deliberation strengthens the final recommendations',
    ],
  },
  ethics_gate: {
    label: 'Ethics Check',
    description: 'Ethics auditor is reviewing all recommendations for compliance',
    estimatedMinutes: 1,
    statusVerb: 'Reviewing ethical compliance...',
    silenceMessages: [
      'Every recommendation is checked against ethical standards and accessibility requirements',
    ],
  },
  transformation: {
    label: 'Transformation',
    description: 'Design and language specialists are rebuilding the document',
    estimatedMinutes: 3,
    statusVerb: 'Transforming your document...',
    silenceMessages: [
      'Your document is being restructured for clarity and accessibility',
      'Simplifying language while preserving every legal obligation',
      'Quality checks run in parallel to ensure nothing is lost',
    ],
  },
  parallel_verification: {
    label: 'Verification',
    description: 'Independent reviewers are checking the transformed work',
    estimatedMinutes: 2,
    statusVerb: 'Verifying the transformation...',
    silenceMessages: [
      'Multiple independent checks: readability, accessibility, legal accuracy',
      'Verification ensures the transformed document meets all quality targets',
    ],
  },
  debate_2: {
    label: 'Second Review',
    description: 'Final debate on quality, accuracy, and completeness',
    estimatedMinutes: 2,
    statusVerb: 'Final quality debate...',
    silenceMessages: [
      'Your team is conducting a final round of quality assurance',
      'Any remaining concerns are being raised and resolved',
    ],
  },
  meaning_gate: {
    label: 'Meaning Check',
    description: 'Meaning guardian is verifying no legal substance was lost',
    estimatedMinutes: 1,
    statusVerb: 'Checking legal meaning preservation...',
    silenceMessages: [
      'Every obligation, right, and condition compared clause-by-clause',
      'This critical check ensures legal meaning is perfectly preserved',
    ],
  },
  synthesis: {
    label: 'Synthesis',
    description: 'Assembling the final deliverable with all revisions',
    estimatedMinutes: 2,
    statusVerb: 'Assembling your final document...',
    silenceMessages: [
      'All revisions are being merged into a single, polished document',
      'Generating the change log that shows exactly what was improved',
    ],
  },
  final_gate: {
    label: 'Final Gate',
    description: 'Managing partner is reviewing the complete work product',
    estimatedMinutes: 1,
    statusVerb: 'Final partner review...',
    silenceMessages: [
      'A final review ensures everything meets the firm\'s quality standards',
    ],
  },
  delivered: {
    label: 'Delivered',
    description: 'Your work is complete and ready for review',
    estimatedMinutes: 0,
    statusVerb: 'Complete',
    silenceMessages: [],
  },
};
