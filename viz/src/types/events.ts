/**
 * Shared event types — mirrors the backend ShemEvent union.
 * Used for WebSocket message parsing and event-to-visual mapping.
 */

// v11: WorkflowStep is now a string to support generic workflows with arbitrary step names.
// The legacy 11-step pipeline values are still valid strings.
export type WorkflowStep = string;

export type AgentRole =
  // Orchestrators
  | 'orchestrator'
  | 'orchestrator-conductor'
  | 'orchestrator-closer'
  | 'orchestrator-professor'
  | 'orchestrator-fixer'
  // Original specialists
  | 'design-reviewer'
  | 'ethics-auditor'
  | 'transformation-specialist'
  | 'meaning-guardian'
  | 'synthesis-editor'
  | 'service-designer'
  | 'plain-language-specialist'
  | 'client-proxy'
  // v5: Pipeline agents
  | 'evaluator'
  | 'contract-reviewer'
  // v6: Legal core, risk, adversarial
  | 'legal-researcher'
  | 'risk-pricer'
  | 'red-team'
  // v8: Leadership
  | 'managing-partner'
  | 'supervising-partner'
  | 'of-counsel'
  | 'innovation-partner'
  | 'client-relations-partner'
  | 'risk-partner'
  | 'transaction-partner'
  // v8: Corporate & Transactional
  | 'corporate-generalist'
  | 'ma-specialist'
  | 'contract-specialist'
  | 'banking-finance'
  | 'capital-markets'
  // v8: Disputes & Litigation
  | 'litigation-partner'
  | 'litigation-associate'
  | 'arbitration-specialist'
  | 'dispute-resolution'
  // v8: Regulatory & Compliance
  | 'regulatory-counsel'
  | 'compliance-officer'
  | 'antitrust-specialist'
  | 'sanctions-specialist'
  // v8: Specialist Practice
  | 'tax-counsel'
  | 'ip-specialist'
  | 'privacy-counsel'
  | 'employment-counsel'
  | 'real-estate-counsel'
  | 'environmental-counsel'
  | 'international-counsel'
  | 'restructuring-specialist'
  | 'startup-counsel'
  | 'public-law-counsel'
  | 'tech-transactions'
  // v8: Junior Lawyers
  | 'junior-associate'
  | 'paralegal'
  | 'legal-intern'
  // v8: Design & Communication
  // v8: User Research & Testing
  | 'accessibility-specialist'
  | 'user-researcher'
  | 'behavioral-scientist'
  // v8: Ethics & Governance
  // v8: Technology & Data
  | 'legal-engineer'
  | 'cybersecurity-advisor'
  | 'ai-ethics-specialist'
  // v8: Industry Specialists
  | 'fintech-specialist'
  | 'healthcare-specialist'
  | 'media-specialist'
  | 'energy-specialist'
  // v8: Quality & Infrastructure
  | 'project-manager';

export type Severity = 'RED' | 'YELLOW' | 'GREEN';

export type ShemEvent =
  | { type: 'session_start'; sessionId: string; document: string; timestamp: string }
  | { type: 'session_end'; sessionId: string; totalCost: number; duration: number; timestamp: string }
  | { type: 'workflow_step'; step: WorkflowStep; previousStep: WorkflowStep; timestamp: string }
  | { type: 'agent_start'; agentId: string; role: string; task: string; timestamp: string }
  | { type: 'agent_stop'; agentId: string; role: string; durationMs: number; timestamp: string }
  // v11: enriched with substantive text
  | { type: 'finding_posted'; findingId: string; agent: string; category: string; severity: Severity; confidence: number; content: string; evidence: string[]; timestamp: string }
  | { type: 'challenge_posted'; challengeId: string; challenger: string; targetFindingId: string; challengeText: string; evidence: string[]; timestamp: string }
  | { type: 'response_posted'; responseId: string; responder: string; challengeId: string; accepted: boolean; responseText: string; revisedPosition?: string; timestamp: string }
  | { type: 'debate_resolved'; resolutionId: string; topic: string; resolution: string; confidence: number; winningPosition: string; evidenceWeight: string; escalationNeeded: boolean; timestamp: string }
  | { type: 'gate_requested'; gateType: string; summary: string; details: string; timestamp: string }
  | { type: 'gate_decided'; gateType: string; decision: string; notes?: string; timestamp: string }
  | { type: 'verification_run'; verificationId: string; verificationType: string; passed: boolean; confidence: number; timestamp: string }
  | { type: 'tool_used'; tool: string; agent?: string; timestamp: string }
  | { type: 'cost_update'; totalUsd: number; budgetUsd: number; timestamp: string }
  | { type: 'memory_saved'; memoryType: string; key: string; timestamp: string }
  | { type: 'error'; message: string; source?: string; timestamp: string }
  // v5: Evaluator events
  | { type: 'evaluator_gate_result'; passed: boolean; score: number; step: string; failureReasons: string[]; timestamp: string }
  // v11: Quality check events
  | { type: 'quality_check_result'; step: string; passed: boolean; score: number; iteration: number; failureReasons: string[]; revisionGuidance: string[]; timestamp: string }
  // v16: Verification Pipeline events
  | { type: 'verification_pass_started'; pass: string; passIndex: number; totalPasses: number; timestamp: string }
  | { type: 'verification_pass_completed'; pass: string; passIndex: number; score: number; criticalCount: number; majorCount: number; minorCount: number; timestamp: string }
  | { type: 'verification_finding'; findingId: string; pass: string; severity: string; location: string; description: string; autoFixable: boolean; timestamp: string }
  | { type: 'verification_report_compiled'; verdict: string; overallScore: number; totalFindings: number; timestamp: string }
  // v0.13: Claw Mode events — daemon-scoped (not session-scoped)
  | { type: 'claw_scan_started'; watchPaths: string[]; timestamp: string }
  | { type: 'claw_scan_completed'; newDocs: number; changedDocs: number; totalDocs: number; timestamp: string }
  | { type: 'claw_job_started'; documentPath: string; documentHash: string; documentType: string; trigger: string; timestamp: string }
  | { type: 'claw_job_completed'; documentPath: string; documentHash: string; costUsd: number; durationMs: number; findings: { critical: number; major: number; minor: number }; timestamp: string }
  | { type: 'claw_job_failed'; documentPath: string; documentHash: string; error: string; timestamp: string }
  | { type: 'claw_precedent_indexed'; precedentId: string; patternName: string; documentType: string; timestamp: string }
  | { type: 'claw_paused'; pausedAt: string; timestamp: string }
  | { type: 'claw_resumed'; resumedAt: string; pendingRescan: boolean; timestamp: string }
  | { type: 'claw_budget_warning'; percentUsed: number; remainingUsd: number; timestamp: string };

/**
 * WebSocket message wrapper types.
 */
export type WsMessage =
  | { type: 'connected'; sessionId: string; eventCount: number; replayFrom: number; timestamp: string }
  | { type: 'live'; event: ShemEvent; index: number }
  | { type: 'replay'; event: ShemEvent }
  | { type: 'replay_complete'; count: number }
  | { type: 'replay_start'; totalEvents: number; speed: number; timestamp: string }
  | { type: 'replay_end'; totalEvents: number }
  | { type: 'pong'; timestamp: string }
  | { type: 'speed_changed'; speed: number }
  | { type: 'paused'; index: number }
  | { type: 'resumed'; index: number }
  | { type: 'seeked'; index: number }
  | { type: 'error'; message?: string };

/**
 * Workflow step metadata.
 */
/**
 * Legacy 11-step pipeline. Used as fallback when the actual workflow
 * steps are not yet known from server events.
 */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  'intake', 'parallel_analysis', 'debate_1', 'ethics_gate',
  'transformation', 'parallel_verification', 'debate_2',
  'meaning_gate', 'synthesis',
  'final_gate', 'delivered',
];

/**
 * Known step sequences per workflow template.
 * HeartbeatBand uses these to show the correct progress dots.
 */
export const WORKFLOW_STEP_MAP: Record<string, WorkflowStep[]> = {
  // Legal design / roundtable (legacy 11-step)
  'roundtable': WORKFLOW_STEPS,
  'legal-design': WORKFLOW_STEPS,
  // Review (6-step)
  'review': ['intake', 'specialist_analysis', 'evaluator_gate', 'plain_language_review', 'final_gate', 'delivered'],
  // Adversarial / research (6-step)
  'adversarial': ['intake', 'build', 'attack', 'synthesize', 'final_gate', 'delivered'],
  // Counsel (4-step)
  'counsel': ['intake', 'specialist_execution', 'final_gate', 'delivered'],
  // Full bench (6-step)
  'full-bench': ['intake', 'decomposition', 'workstream_execution', 'senior_review', 'final_gate', 'delivered'],
  // Pre-engagement (8-step)
  'pre-engagement': ['intake', 'conflict_check', 'kyc_screening', 'engagement_letter', 'client_review_gate', 'team_staffing', 'matter_opening', 'engaged'],
  // Verification (5-step)
  'verification': ['intake', 'verification_pipeline', 'report_compilation', 'final_gate', 'delivered'],
};

/** Human-readable labels for every known step. */
export const STEP_LABELS: Record<string, string> = {
  // Common
  intake: 'Intake',
  final_gate: 'Final Approval',
  delivered: 'Delivered',
  // Legal design / roundtable
  parallel_analysis: 'Analysis',
  debate_1: 'First Review',
  ethics_gate: 'Ethics Check',
  transformation: 'Transformation',
  parallel_verification: 'Verification',
  debate_2: 'Second Review',
  meaning_gate: 'Meaning Check',
  synthesis: 'Synthesis',
  // Review
  specialist_analysis: 'Specialist Analysis',
  evaluator_gate: 'Quality Check',
  plain_language_review: 'Plain Language',
  contract_analysis: 'Contract Analysis',
  // Adversarial / research
  build: 'Build Arguments',
  attack: 'Stress Test',
  synthesize: 'Synthesize',
  research_execution: 'Research',
  red_team_review: 'Red Team',
  // Counsel
  specialist_execution: 'Specialist Work',
  // Roundtable generic
  debate: 'Roundtable',
  gate: 'Gate Review',
  // Full bench
  decomposition: 'Decompose',
  workstream_execution: 'Parallel Work',
  senior_review: 'Senior Review',
  // Pre-engagement
  conflict_check: 'Conflict Check',
  kyc_screening: 'KYC',
  engagement_letter: 'Engagement Letter',
  client_review_gate: 'Client Review',
  team_staffing: 'Staffing',
  matter_opening: 'Matter Opening',
  engaged: 'Engaged',
  // Verification pipeline
  verification_pipeline: 'Verification',
  report_compilation: 'Report',
};

/**
 * @deprecated Use categoryColor() from tokens.ts with AgentProfile data instead.
 * Kept for backward compatibility with the Phaser engine.
 */
export const AGENT_COLORS: Record<string, number> = {
  'orchestrator': 0xFFD700,
  'design-reviewer': 0x4FC3F7,
  'ethics-auditor': 0xEF5350,
  'transformation-specialist': 0x66BB6A,
  'meaning-guardian': 0xAB47BC,
  'synthesis-editor': 0xFF7043,
  'service-designer': 0x26C6DA,
  'plain-language-specialist': 0xFFA726,
  'client-proxy': 0xEC407A,
};

/**
 * @deprecated Use AgentProfile.displayName from demoProfiles.ts instead.
 * Kept for backward compatibility with the Phaser engine.
 */
export const AGENT_LABELS: Record<string, string> = {
  'orchestrator': 'Orchestrator',
  'design-reviewer': 'Design Reviewer',
  'ethics-auditor': 'Ethics Auditor',
  'transformation-specialist': 'Transformer',
  'meaning-guardian': 'Meaning Guardian',
  'synthesis-editor': 'Synthesis Editor',
  'service-designer': 'Service Designer',
  'plain-language-specialist': 'Plain Language',
  'client-proxy': 'Client Proxy',
};
