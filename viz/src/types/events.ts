/**
 * Shared event types — mirrors the backend ShemEvent union.
 * Used for WebSocket message parsing and event-to-visual mapping.
 */

export type WorkflowStep =
  | 'intake'
  | 'parallel_analysis'
  | 'debate_1'
  | 'ethics_gate'
  | 'transformation'
  | 'parallel_verification'
  | 'debate_2'
  | 'meaning_gate'
  | 'synthesis'
  | 'final_gate'
  | 'delivered';

export type AgentRole =
  | 'orchestrator'
  | 'design-reviewer'
  | 'ethics-auditor'
  | 'transformation-specialist'
  | 'meaning-guardian'
  | 'synthesis-editor'
  | 'service-designer'
  | 'plain-language-specialist'
  | 'client-proxy';

export type Severity = 'RED' | 'YELLOW' | 'GREEN';

export type ShemEvent =
  | { type: 'session_start'; sessionId: string; document: string; timestamp: string }
  | { type: 'session_end'; sessionId: string; totalCost: number; duration: number; timestamp: string }
  | { type: 'workflow_step'; step: WorkflowStep; previousStep: WorkflowStep; timestamp: string }
  | { type: 'agent_start'; agentId: string; role: string; task: string; timestamp: string }
  | { type: 'agent_stop'; agentId: string; role: string; durationMs: number; timestamp: string }
  | { type: 'finding_posted'; findingId: string; agent: string; category: string; severity: Severity; confidence: number; timestamp: string }
  | { type: 'challenge_posted'; challengeId: string; challenger: string; targetFindingId: string; timestamp: string }
  | { type: 'response_posted'; responseId: string; responder: string; challengeId: string; accepted: boolean; timestamp: string }
  | { type: 'debate_resolved'; resolutionId: string; topic: string; resolution: string; confidence: number; timestamp: string }
  | { type: 'gate_requested'; gateType: string; summary: string; details: string; timestamp: string }
  | { type: 'gate_decided'; gateType: string; decision: string; notes?: string; timestamp: string }
  | { type: 'verification_run'; verificationId: string; verificationType: string; passed: boolean; confidence: number; timestamp: string }
  | { type: 'tool_used'; tool: string; agent?: string; timestamp: string }
  | { type: 'cost_update'; totalUsd: number; budgetUsd: number; timestamp: string }
  | { type: 'memory_saved'; memoryType: string; key: string; timestamp: string }
  | { type: 'error'; message: string; source?: string; timestamp: string };

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
export const WORKFLOW_STEPS: WorkflowStep[] = [
  'intake', 'parallel_analysis', 'debate_1', 'ethics_gate',
  'transformation', 'parallel_verification', 'debate_2',
  'meaning_gate', 'synthesis', 'final_gate', 'delivered',
];

export const STEP_LABELS: Record<WorkflowStep, string> = {
  intake: 'Intake',
  parallel_analysis: 'Analysis',
  debate_1: 'First Review',
  ethics_gate: 'Ethics Check',
  transformation: 'Transformation',
  parallel_verification: 'Verification',
  debate_2: 'Second Review',
  meaning_gate: 'Meaning Check',
  synthesis: 'Synthesis',
  final_gate: 'Final Approval',
  delivered: 'Delivered',
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
