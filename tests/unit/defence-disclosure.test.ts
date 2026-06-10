import { describe, expect, it } from 'vitest';
import { agentDefinitions } from '../../src/agents/definitions.js';
import { agentProfiles, teamPresets } from '../../src/agents/profiles.js';
import { classifyRequest } from '../../src/router/router.js';
import {
  DefenceDisclosureOutputSchema,
  outputFormats,
} from '../../src/types/output-schemas.js';
import { workflowRegistry } from '../../src/workflows/registry.js';
import '../../src/workflows/index.js';

const requiredAgents = [
  'criminal-defence-counsel',
  'disclosure-analyst',
  'forensic-accounting-analyst',
  'motion-factum-analyst',
] as const;

describe('defence-disclosure workflow', () => {
  it('routes explicit defence_disclosure requests to the defence disclosure workflow', () => {
    const result = classifyRequest({
      type: 'defence_disclosure' as any,
      documentPath: '/disclosure/brief.pdf',
      requestText: 'Review criminal disclosure for fraud charges and a forensic accounting report.',
      context: { jurisdiction: 'CA' as any },
    });

    expect(result.selectedWorkflow).toBe('defence-disclosure');
    expect(result.riskLevel).toBe('high');
    for (const role of requiredAgents) {
      expect(result.selectedSpecialists).toContain(role);
    }
    expect(result.selectedSpecialists).toContain('red-team');
  });

  it('routes fraud, criminal disclosure, and forensic accounting general requests to defence disclosure', () => {
    const result = classifyRequest({
      type: 'general',
      documentPath: '/case/disclosure.pdf',
      requestText: 'Help understand Crown disclosure, fraud charges, OSC materials, and the forensic accounting report.',
    });

    expect(result.selectedWorkflow).toBe('defence-disclosure');
  });

  it('registers a workflow template with the required defence agents and gate', () => {
    const template = workflowRegistry.get('defence-disclosure');

    expect(template).toBeDefined();
    expect(template?.steps).toEqual([
      'intake',
      'document_inventory',
      'procedural_frame',
      'disclosure_review',
      'element_proof_matrix',
      'forensic_accounting_review',
      'contradiction_gap_analysis',
      'crown_osc_red_team',
      'counsel_ready_synthesis',
      'final_gate',
      'delivered',
    ]);
    for (const role of requiredAgents) {
      expect(template?.requiredAgents).toContain(role);
    }
    expect(template?.requiredAgents).toContain('evaluator');
    expect(template?.stepDefinitions.final_gate.requiresGateApproval).toBe(true);
  });

  it('defines defence agents with safety prompts, profiles, and output formats', () => {
    for (const role of requiredAgents) {
      const definition = agentDefinitions[role];
      expect(definition).toBeDefined();
      expect(agentProfiles[role]).toBeDefined();
      expect(outputFormats[role]).toBeDefined();
      expect(definition.prompt).toContain('Ontario/Canada');
      expect(definition.prompt).toContain('Never advise evidence destruction');
      expect(definition.prompt).toContain('[K] known');
      expect(definition.prompt).toContain('not legal advice');
      expect(definition.tools).toContain('mcp__shem__post_finding');
      expect(definition.tools).toContain('mcp__shem__decline_to_find');
    }
  });

  it('exposes a defence disclosure team preset', () => {
    const preset = teamPresets.find(p => p.id === 'defence-disclosure');
    expect(preset).toBeDefined();
    for (const role of requiredAgents) {
      expect(preset?.roles).toContain(role);
    }
  });

  it('rejects defence findings without cited evidence', () => {
    const result = DefenceDisclosureOutputSchema.safeParse({
      agentRole: 'criminal-defence-counsel',
      executiveSummary: 'Fraud disclosure review.',
      disclosureInventory: [],
      chronology: [],
      proofMatrix: [],
      contradictions: [],
      disclosureGaps: [],
      forensicAccountingCritique: [],
      motionFactumIssues: [],
      counselQuestions: [],
      findings: [
        {
          id: 'F-001',
          type: 'element-gap',
          content: 'The Crown has not proven mens rea.',
          severity: 'RED',
          evidence: [],
          confidence: 0.8,
        },
      ],
      confidence: 0.8,
      summary: 'Missing evidence.',
    });

    expect(result.success).toBe(false);
  });
});
