/**
 * Phase descriptions — narrative text + estimated duration per workflow phase.
 *
 * Replaces silent progress dots with proactive communication.
 * Like a partner saying "We're currently reviewing the analysis..."
 *
 * v17: Covers ALL workflow step names across every template
 *      (review, adversarial, counsel, roundtable, full-bench, pre-engagement, etc.)
 *      so the HeartbeatBand and NarrativeStatus never fall back to generic text.
 */

export interface PhaseInfo {
  label: string;
  description: string;
  estimatedMinutes: number;
  /** Present-tense verb phrase for the heartbeat narrative. */
  statusVerb: string;
  /** Rotating messages shown during long silences in this phase. */
  silenceMessages: string[];
}

/**
 * Keyed by step name (string). WorkflowStep is a free string type,
 * so unknown steps will miss the map — useNarrativeStatus has fallbacks.
 */
export const PHASE_DESCRIPTIONS: Record<string, PhaseInfo> = {

  // ── Common across most workflows ──────────────────────────────────────

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
  delivered: {
    label: 'Delivered',
    description: 'Your work is complete and ready for review',
    estimatedMinutes: 0,
    statusVerb: 'Complete',
    silenceMessages: [],
  },
  final_gate: {
    label: 'Final Approval',
    description: 'Senior partner is reviewing the complete work product',
    estimatedMinutes: 1,
    statusVerb: 'Final partner review...',
    silenceMessages: [
      'A final review ensures everything meets the firm\'s quality standards',
    ],
  },

  // ── Legal Design / Roundtable pipeline ────────────────────────────────

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

  // ── Review workflow ───────────────────────────────────────────────────

  specialist_analysis: {
    label: 'Specialist Analysis',
    description: 'Your specialist is conducting a deep, structured analysis',
    estimatedMinutes: 3,
    statusVerb: 'Specialist is analyzing...',
    silenceMessages: [
      'Your specialist is methodically examining every clause and provision',
      'Risk scoring, deviation flagging, and recommended changes in progress',
      'Thorough analysis takes time — your specialist is being careful',
    ],
  },
  evaluator_gate: {
    label: 'Quality Check',
    description: 'An independent evaluator is checking the analysis for errors',
    estimatedMinutes: 2,
    statusVerb: 'Independent quality check...',
    silenceMessages: [
      'A second pair of eyes catches what the first might miss',
      'Error decorrelation: different model checks for blind spots',
    ],
  },
  plain_language_review: {
    label: 'Plain Language',
    description: 'Translating findings into clear, actionable business language',
    estimatedMinutes: 2,
    statusVerb: 'Simplifying for clarity...',
    silenceMessages: [
      'Converting technical findings into executive-ready language',
      'Building your summary with top concerns and negotiation priorities',
    ],
  },
  contract_analysis: {
    label: 'Contract Analysis',
    description: 'Contract specialist is reviewing terms, risks, and obligations',
    estimatedMinutes: 3,
    statusVerb: 'Reviewing the contract...',
    silenceMessages: [
      'Every clause is being examined for risk, deviation, and enforceability',
      'Your specialist is comparing against market standards',
    ],
  },

  // ── Adversarial / Research workflow ────────────────────────────────────

  build: {
    label: 'Building Arguments',
    description: 'Your team is constructing the strongest possible arguments',
    estimatedMinutes: 3,
    statusVerb: 'Building arguments...',
    silenceMessages: [
      'Researching precedents and constructing logical arguments',
      'Every position is being supported with evidence and authority',
    ],
  },
  attack: {
    label: 'Stress Testing',
    description: 'Red team is attacking your arguments to find weaknesses',
    estimatedMinutes: 3,
    statusVerb: 'Red team is attacking...',
    silenceMessages: [
      'Your arguments are being tested by an adversarial team',
      'Finding weaknesses now prevents surprises later',
      'Every counterargument strengthens your final position',
    ],
  },
  synthesize: {
    label: 'Synthesis',
    description: 'Merging surviving arguments into a cohesive position',
    estimatedMinutes: 2,
    statusVerb: 'Synthesizing position...',
    silenceMessages: [
      'Combining the strongest arguments that survived testing',
      'Building a unified, defensible position from the debate',
    ],
  },
  research_execution: {
    label: 'Research',
    description: 'Legal researchers are investigating your question in depth',
    estimatedMinutes: 3,
    statusVerb: 'Researching...',
    silenceMessages: [
      'Your researchers are examining statutes, case law, and commentary',
      'Deep legal research takes time — thoroughness is the priority',
    ],
  },
  red_team_review: {
    label: 'Red Team Review',
    description: 'Red team is challenging the research findings',
    estimatedMinutes: 2,
    statusVerb: 'Red team reviewing...',
    silenceMessages: [
      'An adversarial reviewer is testing the research for gaps and bias',
      'This challenge ensures your research stands up to scrutiny',
    ],
  },

  // ── Counsel workflow ──────────────────────────────────────────────────

  specialist_execution: {
    label: 'Specialist Work',
    description: 'Your specialist is working through the problem',
    estimatedMinutes: 3,
    statusVerb: 'Specialist is working...',
    silenceMessages: [
      'Your specialist is applying domain expertise to your question',
      'Careful analysis ensures accurate, reliable advice',
    ],
  },

  // ── Roundtable workflow ───────────────────────────────────────────────

  debate: {
    label: 'Roundtable',
    description: 'Your team is debating the best approach',
    estimatedMinutes: 3,
    statusVerb: 'Team is debating...',
    silenceMessages: [
      'Multiple perspectives are being considered and challenged',
      'Constructive disagreement leads to better outcomes',
    ],
  },
  gate: {
    label: 'Gate Review',
    description: 'Quality gate reviewing the work before it progresses',
    estimatedMinutes: 1,
    statusVerb: 'Gate review in progress...',
    silenceMessages: [
      'Quality checks ensure the work meets standards before continuing',
    ],
  },

  // ── Full Bench workflow ───────────────────────────────────────────────

  decomposition: {
    label: 'Decomposition',
    description: 'Breaking the problem into parallel workstreams',
    estimatedMinutes: 2,
    statusVerb: 'Decomposing the problem...',
    silenceMessages: [
      'Complex problems are divided so specialists can work in parallel',
      'Each workstream targets a specific aspect of your matter',
    ],
  },
  workstream_execution: {
    label: 'Parallel Work',
    description: 'Multiple specialists are working on their assigned areas',
    estimatedMinutes: 4,
    statusVerb: 'Specialists working in parallel...',
    silenceMessages: [
      'Your full team is working simultaneously across multiple workstreams',
      'Each specialist brings deep expertise to their area',
      'Parallel execution means faster results without sacrificing depth',
    ],
  },
  senior_review: {
    label: 'Senior Review',
    description: 'Senior partner is reviewing all workstream outputs',
    estimatedMinutes: 2,
    statusVerb: 'Senior partner reviewing...',
    silenceMessages: [
      'A senior partner is checking consistency across all workstreams',
      'Final integration ensures a cohesive, unified work product',
    ],
  },

  // ── Pre-Engagement workflow ───────────────────────────────────────────

  conflict_check: {
    label: 'Conflict Check',
    description: 'Checking for conflicts of interest',
    estimatedMinutes: 1,
    statusVerb: 'Checking conflicts...',
    silenceMessages: [
      'Reviewing all parties for potential conflicts of interest',
    ],
  },
  kyc_screening: {
    label: 'KYC Screening',
    description: 'Know-your-client screening in progress',
    estimatedMinutes: 1,
    statusVerb: 'KYC screening...',
    silenceMessages: [
      'Client identity and risk assessment is being verified',
    ],
  },
  engagement_letter: {
    label: 'Engagement Letter',
    description: 'Drafting the engagement letter',
    estimatedMinutes: 2,
    statusVerb: 'Drafting engagement letter...',
    silenceMessages: [
      'Preparing the formal engagement terms for your review',
    ],
  },
  client_review_gate: {
    label: 'Client Review',
    description: 'Awaiting client review and approval',
    estimatedMinutes: 1,
    statusVerb: 'Awaiting your review...',
    silenceMessages: [],
  },
  team_staffing: {
    label: 'Team Staffing',
    description: 'Assembling the right team for your matter',
    estimatedMinutes: 1,
    statusVerb: 'Staffing the team...',
    silenceMessages: [
      'Matching specialists to your specific needs',
    ],
  },
  matter_opening: {
    label: 'Matter Opening',
    description: 'Opening the matter in the system',
    estimatedMinutes: 1,
    statusVerb: 'Opening the matter...',
    silenceMessages: [],
  },
  engaged: {
    label: 'Engaged',
    description: 'Engagement confirmed — your team is ready',
    estimatedMinutes: 0,
    statusVerb: 'Engagement confirmed',
    silenceMessages: [],
  },
};
