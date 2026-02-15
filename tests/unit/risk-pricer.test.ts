/**
 * Unit tests for the Risk Pricing Agent (v6).
 *
 * Tests: Agent definition, output schema, MCP tools, session state, events.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { agentDefinitions } from '../../src/agents/definitions.js';
import { RiskPricingOutputSchema } from '../../src/types/output-schemas.js';
import { createRiskPricingTools } from '../../src/mcp/tools/risk-pricing.js';

describe('Risk Pricing Agent', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-risk');
  });

  describe('Agent Definition', () => {
    it('should exist in agent definitions', () => {
      expect(agentDefinitions['risk-pricer']).toBeDefined();
    });

    it('should use Sonnet model (fast — runs on every deliverable)', () => {
      expect(agentDefinitions['risk-pricer'].model).toBe('sonnet');
    });

    it('should have maxTurns of 6', () => {
      expect(agentDefinitions['risk-pricer'].maxTurns).toBe(6);
    });

    it('should have read-only tools', () => {
      const tools = agentDefinitions['risk-pricer'].tools;
      expect(tools).toContain('Read');
    });

    it('should have workflow history tool', () => {
      const tools = agentDefinitions['risk-pricer'].tools;
      expect(tools).toContain('mcp__shem__get_workflow_history');
    });

    it('should have anti-patterns tool', () => {
      const tools = agentDefinitions['risk-pricer'].tools;
      expect(tools).toContain('mcp__shem__query_anti_patterns');
    });

    it('should have an output format defined', () => {
      expect(agentDefinitions['risk-pricer'].outputFormat).toBeDefined();
    });
  });

  describe('Output Schema', () => {
    it('should validate a valid risk assessment', () => {
      const validAssessment = {
        agentRole: 'risk-pricer',
        overallRiskScore: 0.35,
        riskLevel: 'MEDIUM',
        errorProbability: 0.12,
        potentialLossMagnitude: {
          currency: 'USD',
          low: 5000,
          mid: 25000,
          high: 100000,
        },
        riskFactors: [{
          factor: 'Jurisdictional complexity',
          weight: 0.15,
          score: 0.4,
          evidence: 'Multi-state agreement with California provisions',
        }],
        mitigatingFactors: [{
          factor: 'Evaluator gate passed on first attempt',
          impact: 'Reduces error probability by ~20%',
          evidence: 'Score: 0.89',
        }],
        insurabilityAssessment: {
          insurable: true,
          premiumEstimate: '$250',
          conditions: ['Standard professional indemnity coverage'],
        },
        recommendations: ['Consider additional review for California-specific provisions'],
        confidence: 0.78,
        summary: 'Medium risk, insurable with standard coverage.',
      };

      const result = RiskPricingOutputSchema.safeParse(validAssessment);
      expect(result.success).toBe(true);
    });

    it('should reject risk score out of range', () => {
      const invalidAssessment = {
        agentRole: 'risk-pricer',
        overallRiskScore: 1.5, // Invalid — max is 1.0
        riskLevel: 'HIGH',
        errorProbability: 0.5,
        potentialLossMagnitude: { currency: 'USD', low: 0, mid: 0, high: 0 },
        riskFactors: [],
        mitigatingFactors: [],
        insurabilityAssessment: { insurable: true, premiumEstimate: '$0', conditions: [] },
        recommendations: [],
        confidence: 0.5,
        summary: 'Test',
      };

      const result = RiskPricingOutputSchema.safeParse(invalidAssessment);
      expect(result.success).toBe(false);
    });
  });

  describe('MCP Tools', () => {
    it('should return exactly 2 tools', () => {
      const tools = createRiskPricingTools(session);
      expect(tools).toHaveLength(2);
    });

    it('should have request_risk_assessment and record_risk_assessment', () => {
      const tools = createRiskPricingTools(session);
      const names = tools.map((t: any) => t.name);
      expect(names).toContain('request_risk_assessment');
      expect(names).toContain('record_risk_assessment');
    });

    it('request_risk_assessment should emit event', async () => {
      const tools = createRiskPricingTools(session);
      const requestTool = tools.find((t: any) => t.name === 'request_risk_assessment') as any;

      const events: any[] = [];
      session.events.on('risk_assessment_requested', (e: any) => events.push(e));

      await requestTool.handler({ specialist_role: 'contract-reviewer', step: 'evaluator_gate' });

      expect(events).toHaveLength(1);
      expect(events[0].step).toBe('evaluator_gate');
    });

    it('record_risk_assessment should store on session', async () => {
      const tools = createRiskPricingTools(session);
      const recordTool = tools.find((t: any) => t.name === 'record_risk_assessment') as any;

      await recordTool.handler({
        step: 'evaluator_gate',
        specialist_role: 'contract-reviewer',
        overall_risk_score: 0.35,
        risk_level: 'MEDIUM',
        error_probability: 0.12,
        insurable: true,
        premium_estimate: '$250',
        recommendations: ['Review California provisions'],
      });

      expect(session.riskAssessments).toHaveLength(1);
      expect(session.riskAssessments[0].riskLevel).toBe('MEDIUM');
      expect(session.riskAssessments[0].overallRiskScore).toBe(0.35);
    });

    it('record_risk_assessment should emit event', async () => {
      const tools = createRiskPricingTools(session);
      const recordTool = tools.find((t: any) => t.name === 'record_risk_assessment') as any;

      const events: any[] = [];
      session.events.on('risk_assessment_completed', (e: any) => events.push(e));

      await recordTool.handler({
        step: 'evaluator_gate',
        specialist_role: 'contract-reviewer',
        overall_risk_score: 0.7,
        risk_level: 'HIGH',
        error_probability: 0.3,
        insurable: true,
        premium_estimate: '$500',
      });

      expect(events).toHaveLength(1);
      expect(events[0].riskLevel).toBe('HIGH');
      expect(events[0].score).toBe(0.7);
    });
  });

  describe('Session State', () => {
    it('should initialize with empty riskAssessments array', () => {
      const s = new SessionState('test');
      expect(s.riskAssessments).toEqual([]);
    });
  });
});
