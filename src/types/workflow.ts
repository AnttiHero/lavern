/**
 * Workflow types — Defines the 10-step orchestration workflow
 * as a state machine with preconditions and transition rules.
 */

export const WORKFLOW_STEPS = [
  'intake',
  'parallel_analysis',
  'debate_1',
  'ethics_gate',
  'transformation',
  'parallel_verification',
  'debate_2',
  'meaning_gate',
  'synthesis',
  'final_gate',
  'delivered',
] as const;

export type WorkflowStep = typeof WORKFLOW_STEPS[number];

export interface StepDefinition {
  name: WorkflowStep;
  description: string;
  preconditions: WorkflowStep[];
  requiresGateApproval?: boolean;
  gateType?: 'ethics_critical' | 'meaning_critical' | 'final_delivery';
}

export const STEP_DEFINITIONS: Record<WorkflowStep, StepDefinition> = {
  intake: {
    name: 'intake',
    description: 'Accept document and gather context (moment, audience, jurisdiction)',
    preconditions: [],
  },
  parallel_analysis: {
    name: 'parallel_analysis',
    description: 'Dispatch design-reviewer AND ethics-auditor simultaneously',
    preconditions: ['intake'],
  },
  debate_1: {
    name: 'debate_1',
    description: 'Read debate board, identify conflicts, manage challenge/response exchanges',
    preconditions: ['parallel_analysis'],
  },
  ethics_gate: {
    name: 'ethics_gate',
    description: 'Human approval gate if RED ethics findings exist',
    preconditions: ['debate_1'],
    requiresGateApproval: true,
    gateType: 'ethics_critical',
  },
  transformation: {
    name: 'transformation',
    description: 'Dispatch transformation-specialist with findings and approved approach',
    preconditions: ['ethics_gate'],
  },
  parallel_verification: {
    name: 'parallel_verification',
    description: 'Dispatch meaning-guardian AND ethics-auditor (re-check) on transformed document',
    preconditions: ['transformation'],
  },
  debate_2: {
    name: 'debate_2',
    description: 'Resolve transformation challenges between meaning-guardian and transformation-specialist',
    preconditions: ['parallel_verification'],
  },
  meaning_gate: {
    name: 'meaning_gate',
    description: 'Human approval gate if CRITICAL meaning changes flagged',
    preconditions: ['debate_2'],
    requiresGateApproval: true,
    gateType: 'meaning_critical',
  },
  synthesis: {
    name: 'synthesis',
    description: 'Dispatch synthesis-editor to assemble final dual-artifact output',
    preconditions: ['meaning_gate'],
  },
  final_gate: {
    name: 'final_gate',
    description: 'Human approval before delivering final output',
    preconditions: ['synthesis'],
    requiresGateApproval: true,
    gateType: 'final_delivery',
  },
  delivered: {
    name: 'delivered',
    description: 'Final output delivered to user',
    preconditions: ['final_gate'],
  },
};

export interface WorkflowState {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  gateDecisions: Record<string, 'approved' | 'rejected' | 'skipped'>;
  startedAt: string;
  lastTransitionAt: string;
}

// ══════════════════════════════════════════════════════════════════════════
// v5: Generic Workflow Template System
// ══════════════════════════════════════════════════════════════════════════

/**
 * A generic step definition — works for any workflow template.
 * Unlike StepDefinition, the name is a free string, not a WorkflowStep literal.
 */
export interface GenericStepDefinition {
  name: string;
  description: string;
  preconditions: string[];
  requiresGateApproval?: boolean;
  gateType?: string;
  /** If true, the evaluator gate runs automatically after this step */
  requiresEvaluatorGate?: boolean;
  /** Max revision loops for evaluator gate failures (default: 2) */
  maxRevisionLoops?: number;
  /** v11: Max quality check iterations for this step (default: 2). 0 = no quality check. */
  maxIterations?: number;
  /** v11: What kind of quality check — self (orchestrator re-evaluates), peer (another agent checks), evaluator (formal evaluator agent) */
  qualityCheckType?: 'self' | 'peer' | 'evaluator';
  /** v11: Which agent performs the quality check (required if qualityCheckType is 'peer' or 'evaluator') */
  qualityCheckerRole?: string;
}

/**
 * A workflow template — a reusable pipeline definition.
 * The legal-design pipeline is one template; contract-review is another.
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  /** Ordered step names */
  steps: string[];
  /** Step definitions keyed by step name */
  stepDefinitions: Record<string, GenericStepDefinition>;
  /** MCP tools available to the orchestrator in this workflow */
  availableTools: string[];
  /** Agent definitions required by this workflow */
  requiredAgents: string[];
  /** System prompt for the orchestrator within this workflow */
  orchestratorPrompt: string;
  /** Phase-based permission deny rules (optional — uses template-specific rules) */
  phasePermissions?: Record<string, { denyTools: string[]; reason: string }>;
  /** Maximum team size for this workflow (default: 14). Patterns like full-bench need more agents. */
  maxTeamSize?: number;
  /** Orchestrator archetype key — maps to an orchestrator profile for personality injection */
  orchestratorArchetype?: string;
}

/**
 * Generic workflow state — used by non-legal-design templates.
 * Mirrors WorkflowState but with string steps instead of WorkflowStep literals.
 */
// ══════════════════════════════════════════════════════════════════════════
// Handoff Templates — structured phase-transition summaries
// ══════════════════════════════════════════════════════════════════════════

export type HandoffType = 'standard' | 'qa_pass' | 'qa_fail' | 'escalation' | 'gate_approval' | 'gate_rejection';

export interface HandoffSummary {
  /** Sequenced ID: H-001, H-002, etc. */
  id: string;
  /** Step being completed */
  fromStep: string;
  /** Step being transitioned to */
  toStep: string;
  /** Role of the primary agent in the completing step */
  fromAgent: string;
  /** Type of handoff */
  type: HandoffType;
  /** Human-readable summary of what was accomplished */
  summary: string;
  /** What was produced in this step */
  deliverables: string[];
  /** Unresolved issues for the next phase */
  openItems: string[];
  /** Confidence in the work product (0–1) */
  confidenceScore: number;
  /** ISO timestamp */
  timestamp: string;
}

export interface GenericWorkflowState {
  templateId: string;
  currentStep: string;
  completedSteps: string[];
  gateDecisions: Record<string, 'approved' | 'rejected' | 'skipped'>;
  evaluatorResults: EvaluatorResult[];
  revisionCount: number;
  /** v11: Quality check results across all steps */
  qualityChecks: QualityCheckResult[];
  /** v11: Per-step iteration counts (keyed by step name) */
  stepIterationCounts: Record<string, number>;
  /** Structured handoff summaries recorded at each phase transition */
  handoffs: HandoffSummary[];
  startedAt: string;
  lastTransitionAt: string;
}

/**
 * Result from an evaluator gate check.
 */
export interface EvaluatorResult {
  step: string;
  passed: boolean;
  failureReasons: string[];
  score: number;
  revisionNumber: number;
  timestamp: string;
}

/**
 * v11: Result from a quality check iteration.
 * Generalized version of EvaluatorResult — works at any step, not just evaluator gates.
 */
export interface QualityCheckResult {
  step: string;
  checkType: 'self' | 'peer' | 'evaluator';
  checkerRole?: string;
  iteration: number;
  passed: boolean;
  score: number;
  failureReasons: string[];
  revisionGuidance: string[];
  timestamp: string;
}
