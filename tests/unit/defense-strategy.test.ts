import { describe, expect, it } from 'vitest';
import { agentDefinitions } from '../../src/agents/definitions.js';
import { agentProfiles, teamPresets } from '../../src/agents/profiles.js';
import { classifyRequest } from '../../src/router/router.js';
import {
  AllegationMapOutputSchema,
  outputFormats,
} from '../../src/types/output-schemas.js';
import { workflowRegistry } from '../../src/workflows/registry.js';
import '../../src/workflows/index.js';

describe('defense-strategy workflow', () => {
  it('routes explicit defense_strategy requests to the defense strategy workflow', () => {
    const result = classifyRequest({
      type: 'defense_strategy',
      requestText: 'Prepare a defense for me.',
    });

    expect(result.selectedWorkflow).toBe('defense-strategy');
    expect(result.riskLevel).toBe('high');
    expect(result.selectedSpecialists).toContain('allegation-mapper');
    expect(result.selectedSpecialists).toContain('litigation-partner');
    expect(result.selectedSpecialists).toContain('criminal-defence-counsel');
    expect(result.selectedSpecialists).toContain('red-team');
  });

  it('routes civil allegation requests (motion records, lawsuits) to defense strategy', () => {
    const result = classifyRequest({
      type: 'general',
      requestText: 'I have a motion record and a responding motion record. The plaintiff alleges breach. Figure out who said what and help me prepare a defence.',
    });

    expect(result.selectedWorkflow).toBe('defense-strategy');
  });

  it('routes criminal charge defense prep to defense strategy', () => {
    const result = classifyRequest({
      type: 'general',
      requestText: 'I was charged with mischief and need help understanding the allegations and preparing a defense.',
    });

    expect(result.selectedWorkflow).toBe('defense-strategy');
  });

  it('routes by uploaded document names when the request text is generic', () => {
    const result = classifyRequest(
      {
        type: 'general',
        requestText: 'What do you think the chances of success are?',
      },
      'Responding Motion Record of Plaintiff with Cross-Motion-September 22-2025.pdf',
    );

    expect(result.selectedWorkflow).toBe('defense-strategy');
  });

  it('still routes criminal disclosure review to defence-disclosure (regression)', () => {
    const result = classifyRequest({
      type: 'general',
      documentPath: '/case/disclosure.pdf',
      requestText: 'Help understand Crown disclosure, fraud charges, OSC materials, and the forensic accounting report.',
    });

    expect(result.selectedWorkflow).toBe('defence-disclosure');
  });

  it('registers a workflow template with attribution, clarification round, and final gate', () => {
    const template = workflowRegistry.get('defense-strategy');

    expect(template).toBeDefined();
    expect(template?.steps).toEqual([
      'intake',
      'document_inventory',
      'party_attribution',
      'allegation_map',
      'clarification_round',
      'defense_theory',
      'red_team_challenge',
      'strategy_synthesis',
      'final_gate',
      'delivered',
    ]);
    expect(template?.requiredAgents).toContain('allegation-mapper');
    expect(template?.requiredAgents).toContain('litigation-partner');
    expect(template?.requiredAgents).toContain('criminal-defence-counsel');
    expect(template?.requiredAgents).toContain('red-team');
    expect(template?.requiredAgents).toContain('evaluator');
    expect(template?.availableTools).toContain('mcp__shem__ask_user');
    expect(template?.stepDefinitions.final_gate.requiresGateApproval).toBe(true);
    expect(template?.stepDefinitions.final_gate.gateType).toBe('final_delivery');
  });

  it('denies ask_user after the clarification window closes', () => {
    const template = workflowRegistry.get('defense-strategy');
    expect(template?.phasePermissions?.strategy_synthesis.denyTools).toContain('mcp__shem__ask_user');
    expect(template?.phasePermissions?.final_gate.denyTools).toContain('mcp__shem__ask_user');
    expect(template?.phasePermissions?.delivered.denyTools).toContain('mcp__shem__ask_user');
  });

  it('defines the allegation-mapper agent with safety prompt, profile, and output format', () => {
    const definition = agentDefinitions['allegation-mapper'];
    expect(definition).toBeDefined();
    expect(agentProfiles['allegation-mapper']).toBeDefined();
    expect(outputFormats['allegation-mapper']).toBeDefined();
    expect(definition.prompt).toContain('Ontario/Canada');
    expect(definition.prompt).toContain('Never advise evidence destruction');
    expect(definition.prompt).toContain('[K] known');
    expect(definition.prompt).toContain('not legal advice');
    expect(definition.tools).toContain('mcp__shem__post_finding');
    expect(definition.tools).toContain('mcp__shem__decline_to_find');
  });

  it('exposes a defense strategy team preset', () => {
    const preset = teamPresets.find(p => p.id === 'defense-strategy');
    expect(preset).toBeDefined();
    expect(preset?.roles).toContain('allegation-mapper');
    expect(preset?.roles).toContain('litigation-partner');
    expect(preset?.roles).toContain('red-team');
  });

  it('rejects attributions without cited evidence', () => {
    const result = AllegationMapOutputSchema.safeParse({
      agentRole: 'allegation-mapper',
      executiveSummary: 'Attribution review.',
      partyMap: [],
      attributions: [
        {
          statement: 'The defendant took the funds.',
          speaker: 'Plaintiff',
          statementKind: 'unsworn_allegation',
          factTag: '[K] known',
          citations: [],
        },
      ],
      allegationRegister: [],
      clarificationQuestions: [],
      findings: [],
      confidence: 0.8,
      summary: 'Test.',
    });

    expect(result.success).toBe(false);
  });
});
