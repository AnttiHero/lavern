/**
 * Phase descriptions — 1-line explanation + estimated duration per workflow phase.
 *
 * Replaces silent progress dots with proactive communication.
 * Like a partner saying "We're currently reviewing the analysis..."
 */

import type { WorkflowStep } from '../../types/events.js';

export interface PhaseInfo {
  label: string;
  description: string;
  estimatedMinutes: number;
}

export const PHASE_DESCRIPTIONS: Record<WorkflowStep, PhaseInfo> = {
  intake: {
    label: 'Intake',
    description: 'Agents are reading and understanding your briefing',
    estimatedMinutes: 1,
  },
  parallel_analysis: {
    label: 'Analysis',
    description: 'Agents are examining your document from multiple angles',
    estimatedMinutes: 3,
  },
  debate_1: {
    label: 'First Review',
    description: 'Specialists are challenging each other\'s findings',
    estimatedMinutes: 2,
  },
  ethics_gate: {
    label: 'Ethics Check',
    description: 'Ethics auditor is reviewing all recommendations for compliance',
    estimatedMinutes: 1,
  },
  transformation: {
    label: 'Transformation',
    description: 'Design and language specialists are rebuilding the document',
    estimatedMinutes: 3,
  },
  parallel_verification: {
    label: 'Verification',
    description: 'Independent reviewers are checking the transformed work',
    estimatedMinutes: 2,
  },
  debate_2: {
    label: 'Second Review',
    description: 'Final debate on quality, accuracy, and completeness',
    estimatedMinutes: 2,
  },
  meaning_gate: {
    label: 'Meaning Check',
    description: 'Meaning guardian is verifying no legal substance was lost',
    estimatedMinutes: 1,
  },
  synthesis: {
    label: 'Synthesis',
    description: 'Synthesis editor is assembling the final deliverable',
    estimatedMinutes: 2,
  },
  final_gate: {
    label: 'Final Gate',
    description: 'Managing partner is reviewing the complete work product',
    estimatedMinutes: 1,
  },
  delivered: {
    label: 'Delivered',
    description: 'Your work is complete and ready for review',
    estimatedMinutes: 0,
  },
};
