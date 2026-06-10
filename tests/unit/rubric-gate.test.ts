import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { createRubricGateTools } from '../../src/mcp/tools/rubric-gate.js';
import { createGenericWorkflowTools } from '../../src/mcp/tools/generic-workflow-engine.js';
import { buildShemTools } from '../../src/mcp/server.js';
import { reviewTemplate } from '../../src/workflows/templates/review.js';
import { RubricDefinitionSchema, RubricEvaluationStatusSchema } from '../../src/types/rubric.js';

function toolByName(tools: any[], name: string): any {
  const found = tools.find((t: any) => t.name === name);
  expect(found).toBeDefined();
  return found;
}

function addPassingReviewFinding(session: SessionState): void {
  session.debate.findings.push({
    id: 'F-001',
    agentRole: 'contract-reviewer',
    findingType: 'contract-risk',
    content: 'Recommend revising the liability cap to carve out confidentiality breaches.',
    severity: 'RED',
    evidence: ['Section 8.1 states "liability is limited to fees paid in the prior month".'],
    confidence: 0.9,
    timestamp: new Date().toISOString(),
    resolved: false,
  });
}

describe('Rubric Gate', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-rubric');
  });

  it('validates rubric schemas and statuses', () => {
    expect(RubricEvaluationStatusSchema.safeParse('satisfied').success).toBe(true);
    expect(RubricEvaluationStatusSchema.safeParse('almost_there').success).toBe(false);

    const valid = RubricDefinitionSchema.safeParse({
      id: 'x.y',
      name: 'Test Rubric',
      description: 'A test rubric.',
      defaultMaxIterations: 2,
      criteria: [{ id: 'criterion', name: 'Criterion', description: 'Must pass.' }],
    });
    expect(valid.success).toBe(true);

    const malformed = RubricDefinitionSchema.safeParse({
      id: 'x.y',
      name: 'Missing criteria',
      description: 'Invalid rubric.',
      criteria: [],
    });
    expect(malformed.success).toBe(false);
  });

  it('returns failed for an unknown rubric id', async () => {
    const evaluate = toolByName(createRubricGateTools(session, reviewTemplate), 'evaluate_rubric');

    const result = await evaluate.handler({
      step: 'specialist_analysis',
      rubric_id: 'missing.rubric',
      artifact_summary: 'No such rubric',
    });

    expect(result.content[0].text).toContain('RUBRIC EVALUATION FAILED');
    expect(session.rubricEvaluations).toHaveLength(1);
    expect(session.rubricEvaluations[0].status).toBe('failed');
  });

  it('records needs_revision with per-criterion gaps', async () => {
    const evaluate = toolByName(createRubricGateTools(session, reviewTemplate), 'evaluate_rubric');
    const events: any[] = [];
    session.events.on('rubric_evaluation_end', (event: any) => events.push(event));

    await evaluate.handler({
      step: 'specialist_analysis',
      rubric_id: 'review.specialist_analysis',
      artifact_summary: 'Draft review with no findings',
    });

    expect(session.rubricEvaluations).toHaveLength(1);
    expect(session.rubricEvaluations[0].status).toBe('needs_revision');
    expect(session.rubricEvaluations[0].criteria.some(c => !c.passed)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].result).toBe('needs_revision');
  });

  it('records satisfied when the review analysis rubric passes', async () => {
    addPassingReviewFinding(session);
    const evaluate = toolByName(createRubricGateTools(session, reviewTemplate), 'evaluate_rubric');

    const result = await evaluate.handler({
      step: 'specialist_analysis',
      rubric_id: 'review.specialist_analysis',
      artifact_summary: 'Contract review findings',
    });

    expect(result.content[0].text).toContain('satisfied');
    expect(session.rubricEvaluations[0].status).toBe('satisfied');
    expect(session.rubricEvaluations[0].score).toBe(1);
  });

  it('blocks rubric-required workflow advancement until the rubric is satisfied', async () => {
    const workflowTools = createGenericWorkflowTools(session, reviewTemplate);
    const advance = toolByName(workflowTools, 'advance_step');

    await advance.handler({ completed_step: 'intake' });
    const blocked = await advance.handler({ completed_step: 'specialist_analysis' });
    expect(blocked.content[0].text).toContain('requires rubric "review.specialist_analysis"');

    addPassingReviewFinding(session);
    const evaluate = toolByName(createRubricGateTools(session, reviewTemplate), 'evaluate_rubric');
    await evaluate.handler({
      step: 'specialist_analysis',
      rubric_id: 'review.specialist_analysis',
      artifact_summary: 'Contract review findings',
    });

    const advanced = await advance.handler({ completed_step: 'specialist_analysis' });
    expect(advanced.content[0].text).toContain('ADVANCED: specialist_analysis');
    expect(session.genericWorkflow!.currentStep).toBe('evaluator_gate');
  });

  it('requires rubric_override approval after max iterations are reached', async () => {
    const workflowTools = createGenericWorkflowTools(session, reviewTemplate);
    const advance = toolByName(workflowTools, 'advance_step');
    const evaluate = toolByName(createRubricGateTools(session, reviewTemplate), 'evaluate_rubric');

    await advance.handler({ completed_step: 'intake' });
    await evaluate.handler({
      step: 'specialist_analysis',
      rubric_id: 'review.specialist_analysis',
      artifact_summary: 'First failing draft',
    });
    await evaluate.handler({
      step: 'specialist_analysis',
      rubric_id: 'review.specialist_analysis',
      artifact_summary: 'Second failing draft',
    });

    const capped = session.rubricEvaluations.at(-1)!;
    expect(capped.status).toBe('max_iterations_reached');

    const blocked = await advance.handler({ completed_step: 'specialist_analysis' });
    expect(blocked.content[0].text).toContain('human override is required');

    session.gateDecisions.push({
      gateType: 'rubric_override',
      timestamp: new Date(Date.parse(capped.timestamp) + 1).toISOString(),
      summary: 'Approve specialist_analysis override for review.specialist_analysis after capped rubric gap',
      decision: 'approve',
    });

    const advanced = await advance.handler({ completed_step: 'specialist_analysis' });
    expect(advanced.content[0].text).toContain('ADVANCED: specialist_analysis');
  });

  it('registers rubric and grounding tools in the Shem MCP tool list', () => {
    const names = buildShemTools(session, reviewTemplate).map((t: any) => t.name);
    expect(names).toContain('evaluate_rubric');
    expect(names).toContain('list_rubrics');
    expect(names).toContain('verify_finding_grounding');
    expect(names).toContain('verify_all_findings_grounding');
  });
});
