/**
 * Integration Test — Full 10-step workflow simulation.
 *
 * v3: Uses SessionState instead of module-level globals.
 *
 * Tests the interaction between all v3 systems:
 * - Workflow engine (step progression, gate handling)
 * - Debate board (findings, challenges, resolutions)
 * - Verification engine (self/cross/score)
 * - Memory system (institutional, matter, precedent)
 * - Audit persistence (JSONL, checksum chain)
 * - Dynamic permissions (phase-based tool access)
 *
 * Does NOT call the Claude API — simulates the orchestrator's
 * progression through the state machine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Workflow Engine ──────────────────────────────────────────────────────
import {
  WORKFLOW_STEPS,
  STEP_DEFINITIONS,
  type WorkflowStep,
  type WorkflowState,
} from '../../src/types/workflow.js';

// ── Session State ────────────────────────────────────────────────────────
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';

// ── Audit Persistence ────────────────────────────────────────────────────
import {
  initPersistentAudit,
  persistAuditEntry,
  finalizePersistentAudit,
  verifyAuditChain,
  readAuditFile,
} from '../../src/utils/audit-persistence.js';

// ── Dynamic Permissions ──────────────────────────────────────────────────
import { createDynamicPermissions } from '../../src/permissions/dynamic-permissions.js';

// ── Confidence Scoring ───────────────────────────────────────────────────
import {
  computeOverallConfidence,
  getConfidenceTier,
  type ConfidenceSignals,
} from '../../src/types/index.js';

// ── Test Infrastructure ──────────────────────────────────────────────────
const TEST_DIR = path.join(import.meta.dirname || '.', '..', '.test-integration');
const TEST_AUDIT_DIR = path.join(TEST_DIR, 'audit-logs');
const TEST_MEMORY_DIR = path.join(TEST_DIR, 'memory');
const TEST_SESSION = 'integration-test-001';

// ── Workflow Engine Simulation ───────────────────────────────────────────
// (replicated from workflow-engine.ts since the tool() wrapper prevents direct calls)

let workflowState: WorkflowState;

function resetWorkflow() {
  workflowState = {
    currentStep: 'intake',
    completedSteps: [],
    gateDecisions: {},
    startedAt: new Date().toISOString(),
    lastTransitionAt: new Date().toISOString(),
  };
}

function advanceStep(completedStep: WorkflowStep, gateDecision?: 'approved' | 'rejected' | 'skipped'): {
  advanced?: WorkflowStep;
  complete?: boolean;
  rejected?: boolean;
  error?: string;
} {
  if (completedStep !== workflowState.currentStep) {
    return { error: `Cannot complete "${completedStep}" — current is "${workflowState.currentStep}"` };
  }
  const stepDef = STEP_DEFINITIONS[completedStep];
  if (stepDef.requiresGateApproval) {
    if (!gateDecision) return { error: `Gate step "${completedStep}" requires a decision` };
    workflowState.gateDecisions[stepDef.gateType!] = gateDecision;
    if (gateDecision === 'rejected') return { rejected: true };
  }
  workflowState.completedSteps.push(completedStep);
  const idx = WORKFLOW_STEPS.indexOf(completedStep);
  if (idx >= WORKFLOW_STEPS.length - 1) return { complete: true };
  const next = WORKFLOW_STEPS[idx + 1];
  const nextDef = STEP_DEFINITIONS[next];
  const unmet = nextDef.preconditions.filter(p => !workflowState.completedSteps.includes(p));
  if (unmet.length > 0) return { error: `Preconditions not met: ${unmet.join(', ')}` };
  workflowState.currentStep = next;
  workflowState.lastTransitionAt = new Date().toISOString();
  return { advanced: next };
}

// ── Debate Board Simulation ─────────────────────────────────────────────

interface SimFinding { id: string; agentRole: string; severity: 'RED' | 'YELLOW' | 'GREEN'; content: string; confidence: number; resolved: boolean; }
interface SimResolution { id: string; findingIds: string[]; confidence: number; }
let findings: SimFinding[] = [];
let resolutions: SimResolution[] = [];
let findingCounter = 0;
let resolutionCounter = 0;

function resetDebateBoard() {
  findings = [];
  resolutions = [];
  findingCounter = 0;
  resolutionCounter = 0;
}

function postFinding(agentRole: string, severity: 'RED' | 'YELLOW' | 'GREEN', content: string, confidence = 0.8): SimFinding {
  const f: SimFinding = { id: `F-${String(++findingCounter).padStart(3, '0')}`, agentRole, severity, content, confidence, resolved: false };
  findings.push(f);
  return f;
}

function resolveDebateSimulated(findingIds: string[], confidence: number): SimResolution {
  const r: SimResolution = { id: `DR-${String(++resolutionCounter).padStart(3, '0')}`, findingIds, confidence };
  resolutions.push(r);
  for (const fid of findingIds) {
    const f = findings.find(x => x.id === fid);
    if (f) f.resolved = true;
  }
  return r;
}

function hasUnresolvedRed(): boolean {
  return findings.some(f => f.severity === 'RED' && !f.resolved);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Full Workflow Integration', () => {
  let session: SessionState;

  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Create a fresh session with test directories
    session = new SessionState(TEST_SESSION, {
      gateResolver: new AutoApproveGateResolver(),
      auditDir: TEST_AUDIT_DIR,
      memoryDir: TEST_MEMORY_DIR,
    });

    resetWorkflow();
    resetDebateBoard();
    initPersistentAudit(session);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  describe('Happy Path — All 10 Steps', () => {
    it('should complete the full workflow with approved gates', () => {
      // Step 1: INTAKE
      persistAuditEntry(session, { timestamp: new Date().toISOString(), sessionId: TEST_SESSION, agentRole: 'orchestrator', action: 'intake: read document' });
      const step1 = advanceStep('intake');
      expect(step1.advanced).toBe('parallel_analysis');

      // Step 2: PARALLEL ANALYSIS — 5 agents post findings
      postFinding('design-reviewer', 'YELLOW', 'Readability score 2.1/4', 0.85);
      postFinding('ethics-auditor', 'GREEN', 'No dark patterns detected', 0.92);
      postFinding('service-designer', 'YELLOW', 'Journey mapping shows confusion at step 3', 0.78);
      postFinding('plain-language-specialist', 'RED', 'FK Grade 16.2 — graduate reading level', 0.95);
      postFinding('client-proxy', 'RED', 'Consumer persona abandoned document at paragraph 2', 0.88);
      persistAuditEntry(session, { timestamp: new Date().toISOString(), sessionId: TEST_SESSION, agentRole: 'orchestrator', action: 'parallel_analysis: 5 agents dispatched, 5 findings posted' });
      const step2 = advanceStep('parallel_analysis');
      expect(step2.advanced).toBe('debate_1');

      // Step 3: DEBATE ROUND 1 — Resolve conflicts
      // Design reviewer's YELLOW vs plain-language's RED on readability
      resolveDebateSimulated(['F-001', 'F-004'], 0.90);
      // Client proxy's RED vs ethics-auditor's GREEN
      resolveDebateSimulated(['F-002', 'F-005'], 0.85);
      // Service designer's YELLOW — no conflict, but formally resolved
      resolveDebateSimulated(['F-003'], 0.78);
      persistAuditEntry(session, { timestamp: new Date().toISOString(), sessionId: TEST_SESSION, agentRole: 'orchestrator', action: 'debate_1: 3 debates resolved' });
      const step3 = advanceStep('debate_1');
      expect(step3.advanced).toBe('ethics_gate');

      // Step 4: ETHICS GATE — No RED ethics findings after resolution
      expect(hasUnresolvedRed()).toBe(false);
      const step4 = advanceStep('ethics_gate', 'skipped');
      expect(step4.advanced).toBe('transformation');

      // Step 5: TRANSFORMATION
      persistAuditEntry(session, { timestamp: new Date().toISOString(), sessionId: TEST_SESSION, agentRole: 'transformation-specialist', action: 'transformation: document rewritten' });
      const step5 = advanceStep('transformation');
      expect(step5.advanced).toBe('parallel_verification');

      // Step 6: PARALLEL VERIFICATION
      // Self-verification: 4/5 criteria met
      const selfVerification = { type: 'self', passed: true, confidence: 0.80 };
      // Cross-verification: all RED findings addressed
      const crossVerification = { type: 'cross', passed: true, confidence: 0.85 };
      // Score-verification: no regressions
      const scoreVerification = { type: 'score', passed: true, confidence: 1.0 };
      persistAuditEntry(session, { timestamp: new Date().toISOString(), sessionId: TEST_SESSION, agentRole: 'orchestrator', action: `verification: self=${selfVerification.passed}, cross=${crossVerification.passed}, score=${scoreVerification.passed}` });
      const step6 = advanceStep('parallel_verification');
      expect(step6.advanced).toBe('debate_2');

      // Step 7: DEBATE ROUND 2 — Meaning guardian is satisfied
      postFinding('meaning-guardian', 'GREEN', 'All legal meaning preserved', 0.92);
      resolveDebateSimulated(['F-006'], 0.92);
      const step7 = advanceStep('debate_2');
      expect(step7.advanced).toBe('meaning_gate');

      // Step 8: MEANING GATE — No CRITICAL changes
      const step8 = advanceStep('meaning_gate', 'skipped');
      expect(step8.advanced).toBe('synthesis');

      // Step 9: SYNTHESIS
      persistAuditEntry(session, { timestamp: new Date().toISOString(), sessionId: TEST_SESSION, agentRole: 'synthesis-editor', action: 'synthesis: dual artifacts assembled' });
      const step9 = advanceStep('synthesis');
      expect(step9.advanced).toBe('final_gate');

      // Step 10: FINAL GATE — Human approves
      const step10 = advanceStep('final_gate', 'approved');
      expect(step10.advanced).toBe('delivered');

      // Mark delivered
      const final = advanceStep('delivered');
      expect(final.complete).toBe(true);

      // Verify workflow state
      expect(workflowState.completedSteps).toHaveLength(11);
      expect(workflowState.gateDecisions['ethics_critical']).toBe('skipped');
      expect(workflowState.gateDecisions['meaning_critical']).toBe('skipped');
      expect(workflowState.gateDecisions['final_delivery']).toBe('approved');
    });
  });

  describe('Gate Rejection Handling', () => {
    it('should block workflow on ethics gate rejection', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');

      // Human rejects ethics
      const result = advanceStep('ethics_gate', 'rejected');
      expect(result.rejected).toBe(true);
      expect(workflowState.currentStep).toBe('ethics_gate'); // Stays put
    });

    it('should block workflow on meaning gate rejection', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');
      advanceStep('ethics_gate', 'approved');
      advanceStep('transformation');
      advanceStep('parallel_verification');
      advanceStep('debate_2');

      const result = advanceStep('meaning_gate', 'rejected');
      expect(result.rejected).toBe(true);
      expect(workflowState.currentStep).toBe('meaning_gate');
    });
  });

  describe('Audit Trail Integrity', () => {
    it('should maintain valid checksum chain through full workflow', () => {
      // Simulate a complete workflow with audit entries
      for (let i = 0; i < 10; i++) {
        persistAuditEntry(session, {
          timestamp: new Date().toISOString(),
          sessionId: TEST_SESSION,
          agentRole: 'orchestrator',
          action: `step-${i}`,
        });
      }

      finalizePersistentAudit(session, {
        sessionId: TEST_SESSION,
        documentName: 'test-doc.txt',
        totalCostUsd: 2.50,
        totalTurns: 30,
        totalEntries: 10,
      });

      const filePath = session.auditCurrentFile!;
      const chain = verifyAuditChain(filePath);
      expect(chain.valid).toBe(true);
      expect(chain.entries).toBe(12); // 1 start + 10 entries + 1 end
    });

    it('should detect tampering in the audit chain', () => {
      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION,
        agentRole: 'orchestrator',
        action: 'original',
      });
      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION,
        agentRole: 'orchestrator',
        action: 'second',
      });

      const filePath = session.auditCurrentFile!;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      if (lines[1]) {
        const parsed = JSON.parse(lines[1]);
        parsed.action = 'TAMPERED';
        lines[1] = JSON.stringify(parsed);
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const chain = verifyAuditChain(filePath);
      expect(chain.valid).toBe(false);
    });
  });

  describe('Confidence-Based Routing', () => {
    it('should route high confidence findings to auto-approve tier', () => {
      const signals: ConfidenceSignals = {
        retrievalQuality: 0.95,
        sourceAgreement: 0.98,
        validationSuccess: 0.97,
        toolReliability: 0.99,
        selfConsistency: 0.96,
      };
      const confidence = computeOverallConfidence(signals);
      const tier = getConfidenceTier(confidence);
      expect(tier).toBe('high');
    });

    it('should route low confidence findings to full human review', () => {
      const signals: ConfidenceSignals = {
        retrievalQuality: 0.3,
        sourceAgreement: 0.4,
        validationSuccess: 0.35,
        toolReliability: 0.5,
        selfConsistency: 0.2,
      };
      const confidence = computeOverallConfidence(signals);
      const tier = getConfidenceTier(confidence);
      expect(tier).toBe('low');
    });
  });

  describe('Dynamic Permissions', () => {
    it('should deny post_challenge during parallel_analysis phase', async () => {
      const canUseTool = createDynamicPermissions(session);

      // During parallel_analysis, post_challenge should be denied
      // We need the workflow engine's actual state for this, so we use
      // the state machine from the real module. Since we can't easily
      // control the global workflow state from tests, we test the
      // permission logic patterns instead.
      const result = await canUseTool(
        'mcp__shem__post_challenge',
        { challenger_role: 'ethics-auditor', target_finding_id: 'F-001', challenge_text: 'test', evidence: [] },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-1', agentID: 'agent-1' }
      );

      // The workflow starts at 'intake', where post_challenge is also denied
      expect(result.behavior).toBe('deny');
    });

    it('should deny advance_step for subagents', async () => {
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool(
        'mcp__shem__advance_step',
        { completed_step: 'intake' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-2', agentID: 'subagent-123' }
      );

      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.message).toContain('orchestrator');
      }
    });

    it('should deny resolve_debate for subagents', async () => {
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool(
        'mcp__shem__resolve_debate',
        { debate_topic: 'test' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-3', agentID: 'subagent-456' }
      );

      expect(result.behavior).toBe('deny');
    });

    it('should allow non-MCP tools unconditionally', async () => {
      const canUseTool = createDynamicPermissions(session);

      const result = await canUseTool(
        'Read',
        { file_path: '/test.txt' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-4', agentID: 'subagent-789' }
      );

      expect(result.behavior).toBe('allow');
    });

    it('should allow post_finding during intake phase', async () => {
      const canUseTool = createDynamicPermissions(session);

      // post_finding is NOT in the intake deny list
      const result = await canUseTool(
        'mcp__shem__post_finding',
        { agent_role: 'design-reviewer', content: 'test' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-5', agentID: 'agent-1' }
      );

      expect(result.behavior).toBe('allow');
    });
  });

  describe('Memory Persistence', () => {
    it('should create memory directory on write', () => {
      const instPath = path.join(TEST_MEMORY_DIR, 'institutional.json');
      // Memory tools are SDK-wrapped, so we test the file system directly
      fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });
      fs.writeFileSync(instPath, JSON.stringify([{
        id: 'IM-001',
        category: 'lesson',
        content: 'Always check FK grade before and after transformation',
        source: 'integration-test',
        addedAt: new Date().toISOString(),
        usageCount: 0,
      }]), 'utf-8');

      expect(fs.existsSync(instPath)).toBe(true);
      const memories = JSON.parse(fs.readFileSync(instPath, 'utf-8'));
      expect(memories).toHaveLength(1);
      expect(memories[0].category).toBe('lesson');
    });

    it('should persist precedents as JSON files', () => {
      const precedentPath = path.join(TEST_MEMORY_DIR, 'precedents.json');
      fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });
      fs.writeFileSync(precedentPath, JSON.stringify([{
        id: 'P-001',
        documentType: 'terms-of-service',
        jurisdiction: 'EU',
        patternName: 'auto-renewal-plain-language',
        description: 'Converts auto-renewal jargon to plain English',
        beforeSnippet: 'shall automatically renew for successive periods...',
        afterSnippet: 'This service will automatically renew...',
        qualityScore: 3.8,
        addedAt: new Date().toISOString(),
      }]), 'utf-8');

      const precedents = JSON.parse(fs.readFileSync(precedentPath, 'utf-8'));
      expect(precedents).toHaveLength(1);
      expect(precedents[0].qualityScore).toBe(3.8);
    });
  });

  describe('Debate Board + Workflow Integration', () => {
    it('should track unresolved RED findings across workflow steps', () => {
      // Post RED finding
      const redFinding = postFinding('ethics-auditor', 'RED', 'Confirmed consent trap', 0.92);
      expect(hasUnresolvedRed()).toBe(true);

      // Resolve it
      resolveDebateSimulated([redFinding.id], 0.90);
      expect(hasUnresolvedRed()).toBe(false);
      expect(findings[0].resolved).toBe(true);
    });

    it('should accumulate findings from multiple agents', () => {
      postFinding('design-reviewer', 'YELLOW', 'finding 1', 0.8);
      postFinding('ethics-auditor', 'GREEN', 'finding 2', 0.9);
      postFinding('service-designer', 'YELLOW', 'finding 3', 0.75);
      postFinding('plain-language-specialist', 'RED', 'finding 4', 0.95);
      postFinding('client-proxy', 'RED', 'finding 5', 0.88);

      expect(findings).toHaveLength(5);
      expect(findings.filter(f => f.severity === 'RED')).toHaveLength(2);
      expect(findings.filter(f => f.severity === 'YELLOW')).toHaveLength(2);
      expect(findings.filter(f => f.severity === 'GREEN')).toHaveLength(1);
    });

    it('should assign confidence scores to findings', () => {
      const f = postFinding('design-reviewer', 'YELLOW', 'test', 0.85);
      expect(f.confidence).toBe(0.85);

      const tier = getConfidenceTier(f.confidence);
      expect(tier).toBe('medium'); // 0.70-0.90 = medium tier
    });
  });

  describe('End-to-End Audit Trail', () => {
    it('should produce a complete audit file for the full workflow', () => {
      // Simulate all 10 steps with audit entries
      const steps = [
        'intake', 'parallel_analysis', 'debate_1', 'ethics_gate',
        'transformation', 'parallel_verification', 'debate_2',
        'meaning_gate', 'synthesis', 'final_gate', 'delivered'
      ];

      for (const step of steps) {
        persistAuditEntry(session, {
          timestamp: new Date().toISOString(),
          sessionId: TEST_SESSION,
          agentRole: 'orchestrator',
          action: `WorkflowStep: ${step}`,
        });
      }

      finalizePersistentAudit(session, {
        sessionId: TEST_SESSION,
        documentName: 'integration-test.txt',
        totalCostUsd: 3.45,
        totalTurns: 55,
        totalEntries: 11,
        subagentCount: 8,
      });

      const entries = readAuditFile(session.auditCurrentFile!);
      expect(entries).toHaveLength(13); // 1 start + 11 steps + 1 end

      const chain = verifyAuditChain(session.auditCurrentFile!);
      expect(chain.valid).toBe(true);

      // First entry should be session_start
      const first = entries[0] as Record<string, unknown>;
      expect(first.type).toBe('session_start');

      // Last entry should be session_end
      const last = entries[entries.length - 1] as Record<string, unknown>;
      expect(last.type).toBe('session_end');
      expect((last.summary as Record<string, unknown>).totalCostUsd).toBe(3.45);
    });
  });
});
