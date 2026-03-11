/**
 * Risk Pricing MCP Tools — Error probability and insurability assessment.
 *
 * v6: Two tools that bracket the risk-pricer agent invocation:
 *
 * 1. `request_risk_assessment` — Called by the orchestrator to REQUEST
 *    a risk assessment on a deliverable. Records the request and emits
 *    an event. The orchestrator then dispatches the risk-pricer subagent.
 *
 * 2. `record_risk_assessment` — Called after the risk-pricer subagent
 *    completes. Stores the risk assessment on the session and emits event.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

export interface RiskAssessment {
  step: string;
  specialistRole: string;
  overallRiskScore: number;
  riskLevel: string;
  errorProbability: number;
  insurable: boolean;
  premiumEstimate: string;
  recommendations: string[];
  timestamp: string;
}

export function createRiskPricingTools(session: SessionState) {

  const requestRiskAssessment = tool(
    'request_risk_assessment',
    'Request a risk assessment on a specialist deliverable. Call this BEFORE dispatching the risk-pricer subagent. Records the request and emits an event.',
    {
      specialist_role: z.string()
        .describe('The role of the specialist whose work is being assessed (e.g., "contract-reviewer")'),
      step: z.string()
        .describe('The current workflow step'),
      matter_value: z.string().optional()
        .describe('Estimated value of the matter (e.g., "$50,000", "high-value")'),
    },
    async (args) => {
      // Emit event
      session.events.emitEvent({
        type: 'risk_assessment_requested',
        step: args.step,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `RISK ASSESSMENT REQUESTED
**Specialist**: ${args.specialist_role}
**Step**: ${args.step}
${args.matter_value ? `**Matter Value**: ${args.matter_value}` : ''}

Now dispatch the risk-pricer subagent to assess the deliverable.
After the risk-pricer completes, call \`record_risk_assessment\` with the results.`,
        }],
      };
    },
  );

  const recordRiskAssessment = tool(
    'record_risk_assessment',
    'Record the result of a risk assessment. Call this AFTER the risk-pricer subagent has completed its assessment. Stores the assessment on the session.',
    {
      step: z.string()
        .describe('The workflow step this assessment is for'),
      specialist_role: z.string()
        .describe('The specialist whose work was assessed'),
      overall_risk_score: z.number().min(0).max(1)
        .describe('Overall risk score (0.0 - 1.0)'),
      risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
        .describe('Risk classification'),
      error_probability: z.number().min(0).max(1)
        .describe('Estimated probability of material error'),
      insurable: z.boolean()
        .describe('Whether this deliverable is insurable'),
      premium_estimate: z.string()
        .describe('Estimated insurance premium (e.g., "$50", "0.5% of matter value")'),
      recommendations: z.array(z.string()).optional()
        .describe('Recommendations to reduce risk'),
    },
    async (args) => {
      // Create risk assessment record
      const assessment: RiskAssessment = {
        step: args.step,
        specialistRole: args.specialist_role,
        overallRiskScore: args.overall_risk_score,
        riskLevel: args.risk_level,
        errorProbability: args.error_probability,
        insurable: args.insurable,
        premiumEstimate: args.premium_estimate,
        recommendations: args.recommendations ?? [],
        timestamp: eventTimestamp(),
      };

      // Store on session
      boundedPush(session.riskAssessments, assessment);

      // Emit event
      session.events.emitEvent({
        type: 'risk_assessment_completed',
        riskLevel: args.risk_level,
        score: args.overall_risk_score,
        step: args.step,
        timestamp: eventTimestamp(),
      });

      const icon = args.risk_level === 'LOW' ? '\u2705' :
                   args.risk_level === 'MEDIUM' ? '\u26a0\ufe0f' :
                   args.risk_level === 'HIGH' ? '\ud83d\udea8' : '\u274c';

      return {
        content: [{
          type: 'text' as const,
          text: `RISK ASSESSMENT COMPLETE ${icon}
**Risk Level**: ${args.risk_level}
**Risk Score**: ${args.overall_risk_score.toFixed(2)}
**Error Probability**: ${(args.error_probability * 100).toFixed(1)}%
**Insurable**: ${args.insurable ? 'Yes' : 'No'}
**Premium Estimate**: ${args.premium_estimate}
${args.recommendations && args.recommendations.length > 0 ?
  `\n**Recommendations**:\n${args.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}

Risk assessment recorded for step "${args.step}".`,
        }],
      };
    },
  );

  return [requestRiskAssessment, recordRiskAssessment];
}
