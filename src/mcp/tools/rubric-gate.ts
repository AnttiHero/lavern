import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import type {
  RubricCriterion,
  RubricCriterionEvaluation,
  RubricDefinition,
  RubricEvaluation,
  RubricEvaluationStatus,
} from '../../types/rubric.js';
import type { WorkflowTemplate } from '../../types/workflow.js';
import { getRubricDefinition, listRubricDefinitions } from '../../rubrics/definitions.js';
import { eventTimestamp } from '../../events/event-bus.js';

const RUBRIC_GATE_TYPE = 'rubric_override' as const;

function hasSourceReference(text: string): boolean {
  return /"[^"]{8,}"|'[^']{8,}'|\b(?:Section|Clause|Article|Paragraph|Part)\s+\d+(?:\.\d+)*\b|Location:/i.test(text);
}

function hasBusinessAction(text: string): boolean {
  return /\b(recommend|consider|request|revise|redline|negotiate|add|remove|change|carve out|escalate|should|must)\b/i.test(text);
}

function includesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function pass(criterion: RubricCriterion, evidence: string): RubricCriterionEvaluation {
  return {
    criterionId: criterion.id,
    name: criterion.name,
    passed: true,
    evidence,
  };
}

function fail(criterion: RubricCriterion, evidence: string, gap: string): RubricCriterionEvaluation {
  return {
    criterionId: criterion.id,
    name: criterion.name,
    passed: false,
    evidence,
    gap,
  };
}

function findCriterion(definition: RubricDefinition, id: string): RubricCriterion {
  const criterion = definition.criteria.find(c => c.id === id);
  if (!criterion) throw new Error(`Rubric ${definition.id} is missing criterion ${id}`);
  return criterion;
}

function evaluateReviewSpecialistAnalysis(
  session: SessionState,
  definition: RubricDefinition,
  artifactText: string,
): RubricCriterionEvaluation[] {
  const materialFindings = session.debate.findings.filter(f => f.severity !== 'GREEN');
  const findings = materialFindings.length > 0 ? materialFindings : session.debate.findings;
  const artifact = artifactText.trim();
  const findingTexts = findings.map(f => [f.content, ...f.evidence].join('\n'));

  const present = findCriterion(definition, 'findings-present');
  const quoted = findCriterion(definition, 'quoted-evidence');
  const calibrated = findCriterion(definition, 'location-severity-confidence');
  const action = findCriterion(definition, 'business-action');

  return [
    findings.length > 0 || artifact.length > 0
      ? pass(present, `${findings.length} finding(s) in session; artifact text length ${artifact.length}.`)
      : fail(present, 'No findings or artifact text were available.', 'Post or include the material review findings before evaluating the rubric.'),
    findings.length === 0
      ? fail(quoted, 'No findings were available to inspect for citations.', 'Attach findings with quoted text or precise clause references.')
      : findingTexts.every(hasSourceReference)
      ? pass(quoted, 'Every inspected finding includes quoted text or a precise section/location reference.')
      : fail(quoted, 'At least one inspected finding lacks quoted text or a precise section/location reference.', 'Add verbatim evidence or a precise section/clause/location reference to every material finding.'),
    findings.length === 0
      ? fail(calibrated, 'No findings were available to inspect for calibration metadata.', 'Record findings with severity, confidence, and location evidence.')
      : findings.every(f => !!f.severity && Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 1 && f.evidence.some(hasSourceReference))
      ? pass(calibrated, 'Every inspected finding has severity, confidence, and location evidence.')
      : fail(calibrated, 'At least one inspected finding is missing severity, confidence, or location evidence.', 'Ensure each material finding includes severity, confidence, and source location evidence.'),
    findings.length === 0
      ? fail(action, 'No findings were available to inspect for business action.', 'Add a concrete next action to each material finding.')
      : findingTexts.every(hasBusinessAction)
      ? pass(action, 'Every inspected finding includes an actionable recommendation.')
      : fail(action, 'At least one inspected finding lacks a concrete next action.', 'State what to negotiate, revise, add, remove, or escalate for each finding.'),
  ];
}

function evaluateReviewVerificationPass(
  session: SessionState,
  definition: RubricDefinition,
  artifactText: string,
  artifactSummary: string,
): RubricCriterionEvaluation[] {
  const text = `${artifactSummary}\n${artifactText}`;
  const totalCritical = session.verificationPassResults.reduce((sum, p) => sum + p.criticalCount, 0);
  const passes = session.verificationPassResults.length;
  const verdictTextPresent = !!session.verification || /\b(PASS|CONDITIONAL_PASS|CONDITIONAL PASS|FAIL)\b/i.test(text);

  const tenPasses = findCriterion(definition, 'ten-passes-recorded');
  const verdict = findCriterion(definition, 'verdict-present');
  const criticalVisible = findCriterion(definition, 'critical-findings-visible');

  return [
    passes >= 10
      ? pass(tenPasses, `${passes}/10 verification passes recorded.`)
      : fail(tenPasses, `${passes}/10 verification passes recorded.`, 'Run and record all 10 verification passes before advancing.'),
    verdictTextPresent
      ? pass(verdict, 'Verification verdict is present in session state or artifact text.')
      : fail(verdict, 'No verification verdict found in session state or artifact text.', 'Compile or state the verification verdict before advancing.'),
    totalCritical === 0 || includesAny(text, ['critical', 'fail'])
      ? pass(criticalVisible, `${totalCritical} critical verification finding(s); visibility check passed.`)
      : fail(criticalVisible, `${totalCritical} critical verification finding(s), but the artifact does not surface them.`, 'Surface all critical verification findings in the report or gate summary.'),
  ];
}

function evaluateFinalDelivery(
  session: SessionState,
  definition: RubricDefinition,
  artifactText: string,
): RubricCriterionEvaluation[] {
  const text = artifactText || session.assembledDocument || session.finalOutput;
  const auditSignals = session.auditEntries.length + session.debate.findings.length + session.debate.resolutions.length + session.verificationPassResults.length;
  const unresolved = session.debate.findings.filter(f => !f.resolved && f.severity !== 'GREEN');

  const deliverable = findCriterion(definition, 'deliverable-present');
  const audit = findCriterion(definition, 'audit-bundle-present');
  const verification = findCriterion(definition, 'verification-summary-present');
  const cost = findCriterion(definition, 'cost-log-present');
  const disclaimer = findCriterion(definition, 'disclaimer-present');
  const openIssues = findCriterion(definition, 'open-issues-visible');

  return [
    text.trim().length > 0
      ? pass(deliverable, `Deliverable text length ${text.trim().length}.`)
      : fail(deliverable, 'No deliverable text was available.', 'Assemble or include the final deliverable before delivery.'),
    auditSignals > 0
      ? pass(audit, `${auditSignals} audit signal(s) present across findings, resolutions, verification, and audit entries.`)
      : fail(audit, 'No audit signals were present.', 'Include findings, resolutions, verification output, or audit entries in the bundle.'),
    !!session.verification || !!session.verificationSummary || session.verificationPassResults.length > 0
      ? pass(verification, 'Verification summary/report/pass results are available.')
      : fail(verification, 'No verification summary, report, or pass results found.', 'Run or compile verification before delivery.'),
    Number.isFinite(session.accumulatedCost)
      ? pass(cost, `Accumulated cost is available: ${session.accumulatedCost.toFixed(4)} USD.`)
      : fail(cost, 'Session cost state is not available.', 'Record cost state before delivery.'),
    /does not (provide|constitute) legal advice|not legal advice/i.test(text)
      ? pass(disclaimer, 'Legal-advice disclaimer found in deliverable text.')
      : fail(disclaimer, 'No legal-advice disclaimer found in deliverable text.', 'Add the Lavern disclaimer that the system does not provide legal advice.'),
    unresolved.length === 0 || includesAny(text, ['unresolved', 'outstanding', 'open issue', 'no outstanding'])
      ? pass(openIssues, `${unresolved.length} unresolved material finding(s); visibility check passed.`)
      : fail(openIssues, `${unresolved.length} unresolved material finding(s), but the deliverable does not surface open issues.`, 'List unresolved/open issues or explicitly state that none remain.'),
  ];
}

function evaluateLegalDesignTransformation(
  session: SessionState,
  definition: RubricDefinition,
  artifactText: string,
): RubricCriterionEvaluation[] {
  const text = artifactText || session.finalOutput;
  const failedMeaning = session.verificationResults.filter(v =>
    !v.passed && /meaning|transformation|parallel_verification/i.test(`${v.targetStep} ${v.verifierRole} ${v.findings.join(' ')}`),
  );

  const output = findCriterion(definition, 'transformed-output-present');
  const nonNegotiables = findCriterion(definition, 'non-negotiables-addressed');
  const meaning = findCriterion(definition, 'meaning-verification-clear');

  return [
    text.trim().length > 0
      ? pass(output, `Transformation artifact text length ${text.trim().length}.`)
      : fail(output, 'No transformation artifact text was available.', 'Include the transformed text or change log.'),
    includesAny(text, ['monetary', 'liability', 'deadline', 'jurisdiction', 'governing law', 'defined term', 'insurance', 'regulatory', 'non-negotiable'])
      ? pass(nonNegotiables, 'Artifact references non-negotiable preservation categories.')
      : fail(nonNegotiables, 'Artifact does not reference non-negotiable preservation categories.', 'Explicitly verify monetary, timing, jurisdiction, dispute, defined term, insurance, and regulatory preservation.'),
    failedMeaning.length === 0
      ? pass(meaning, 'No failed meaning-preservation verification remains in session state.')
      : fail(meaning, `${failedMeaning.length} failed meaning-related verification result(s) remain.`, 'Resolve failed meaning-preservation checks or escalate through a human gate.'),
  ];
}

function evaluateCounselAnswer(
  session: SessionState,
  definition: RubricDefinition,
  artifactText: string,
): RubricCriterionEvaluation[] {
  const text = artifactText || session.finalOutput;

  const citations = findCriterion(definition, 'source-citations-when-documents-present');
  const assumptions = findCriterion(definition, 'assumptions-stated');
  const advice = findCriterion(definition, 'not-legal-advice');
  const professional = findCriterion(definition, 'professional-review-flagged');

  return [
    session.documents.length === 0 || hasSourceReference(text)
      ? pass(citations, session.documents.length === 0 ? 'No uploaded documents; source citation criterion not applicable.' : 'Source text or section reference found.')
      : fail(citations, 'Uploaded documents exist, but no source quote or precise section reference was found.', 'Cite the uploaded document text or a precise section.'),
    /\bassum(ption|e|ing)|no material assumptions/i.test(text)
      ? pass(assumptions, 'Assumptions are stated or expressly disclaimed.')
      : fail(assumptions, 'No assumptions statement found.', 'State the assumptions behind the answer, or say no material assumptions are being made.'),
    !/\bthis is legal advice\b/i.test(text) && /legal advice|qualified legal|lawyer|counsel/i.test(text)
      ? pass(advice, 'Answer includes cautionary legal-advice framing without claiming to be legal advice.')
      : fail(advice, 'Answer does not include sufficient legal-advice cautionary language, or it claims to be legal advice.', 'Add a caution that Lavern does not provide legal advice and avoid definitive legal-advice framing.'),
    /qualified legal|lawyer|counsel|legal professional|attorney/i.test(text)
      ? pass(professional, 'Professional review is flagged.')
      : fail(professional, 'No qualified-professional review flag found.', 'Flag when a qualified legal professional should review the issue.'),
  ];
}

function evaluateCriteria(
  session: SessionState,
  definition: RubricDefinition,
  artifactSummary: string,
  artifactText: string,
): RubricCriterionEvaluation[] {
  switch (definition.id) {
    case 'review.specialist_analysis':
      return evaluateReviewSpecialistAnalysis(session, definition, artifactText);
    case 'review.verification_pass':
      return evaluateReviewVerificationPass(session, definition, artifactText, artifactSummary);
    case 'delivery.final':
      return evaluateFinalDelivery(session, definition, artifactText);
    case 'legal-design.transformation':
      return evaluateLegalDesignTransformation(session, definition, artifactText);
    case 'counsel.answer':
      return evaluateCounselAnswer(session, definition, artifactText);
    default:
      return definition.criteria.map(criterion => fail(
        criterion,
        `No deterministic evaluator is registered for rubric ${definition.id}.`,
        'Register an evaluator for this rubric before requiring it in a workflow.',
      ));
  }
}

export function getRubricIterationKey(step: string, rubricId: string): string {
  return `${step}::${rubricId}`;
}

export function getLatestRubricEvaluation(
  session: SessionState,
  step: string,
  rubricId: string,
): RubricEvaluation | undefined {
  return [...session.rubricEvaluations]
    .reverse()
    .find(ev => ev.step === step && ev.rubricId === rubricId);
}

export function createRubricGateTools(session: SessionState, template?: WorkflowTemplate) {
  const evaluateRubric = tool(
    'evaluate_rubric',
    'Evaluate a workflow artifact against a named Lavern rubric. Records per-criterion pass/fail, targeted revision feedback, and iteration status.',
    {
      step: z.string().describe('Workflow step being evaluated.'),
      rubric_id: z.string().describe('Rubric id, e.g. "review.specialist_analysis".'),
      artifact_summary: z.string().describe('Short description of the artifact being evaluated.'),
      artifact_text: z.string().optional().describe('Artifact text to evaluate when not already captured in session state.'),
    },
    async (args) => {
      const definition = getRubricDefinition(args.rubric_id);
      const stepDef = template?.stepDefinitions[args.step];
      const maxIterations = Math.max(1, Math.min(20, stepDef?.rubricMaxIterations ?? definition?.defaultMaxIterations ?? 2));
      const key = getRubricIterationKey(args.step, args.rubric_id);
      const iteration = (session.rubricIterationCounts[key] ?? 0) + 1;
      session.rubricIterationCounts[key] = iteration;
      if (session.genericWorkflow) {
        session.genericWorkflow.rubricIterationCounts ??= {};
        session.genericWorkflow.rubricIterationCounts[key] = iteration;
      }

      session.events.emitEvent({
        type: 'rubric_evaluation_start',
        rubricId: args.rubric_id,
        step: args.step,
        iteration,
        timestamp: eventTimestamp(),
      });

      try {
        if (!definition) {
          const evaluation: RubricEvaluation = {
            id: `R-${String(++session.rubricCounter).padStart(3, '0')}`,
            rubricId: args.rubric_id,
            step: args.step,
            iteration,
            maxIterations,
            status: 'failed',
            score: 0,
            artifactSummary: args.artifact_summary,
            explanation: `Rubric "${args.rubric_id}" is not registered.`,
            criteria: [],
            timestamp: new Date().toISOString(),
          };
          boundedPush(session.rubricEvaluations, evaluation);
          session.events.emitEvent({
            type: 'rubric_evaluation_end',
            rubricId: args.rubric_id,
            step: args.step,
            iteration,
            result: evaluation.status,
            score: evaluation.score,
            failedCriteria: [],
            timestamp: eventTimestamp(),
          });
          return {
            content: [{ type: 'text' as const, text: `RUBRIC EVALUATION FAILED\nRubric "${args.rubric_id}" is not registered.` }],
          };
        }

        const criteria = evaluateCriteria(session, definition, args.artifact_summary, args.artifact_text ?? '');
        const passed = criteria.filter(c => c.passed).length;
        const score = criteria.length > 0 ? passed / criteria.length : 0;
        const allPassed = criteria.length > 0 && criteria.every(c => c.passed);
        const status: RubricEvaluationStatus = allPassed
          ? 'satisfied'
          : iteration >= maxIterations
          ? 'max_iterations_reached'
          : 'needs_revision';
        const failedCriteria = criteria.filter(c => !c.passed);
        const explanation = allPassed
          ? `Rubric ${definition.id} satisfied.`
          : status === 'max_iterations_reached'
          ? `Rubric ${definition.id} still has ${failedCriteria.length} failing criterion/criteria after ${iteration}/${maxIterations} iterations. Human override is required to advance.`
          : `Rubric ${definition.id} needs revision: ${failedCriteria.length} criterion/criteria failed.`;

        const evaluation: RubricEvaluation = {
          id: `R-${String(++session.rubricCounter).padStart(3, '0')}`,
          rubricId: definition.id,
          step: args.step,
          iteration,
          maxIterations,
          status,
          score: Math.round(score * 100) / 100,
          artifactSummary: args.artifact_summary,
          explanation,
          criteria,
          timestamp: new Date().toISOString(),
        };
        boundedPush(session.rubricEvaluations, evaluation);

        session.events.emitEvent({
          type: 'rubric_evaluation_end',
          rubricId: definition.id,
          step: args.step,
          iteration,
          result: status,
          score: evaluation.score,
          failedCriteria: failedCriteria.map(c => c.criterionId),
          timestamp: eventTimestamp(),
        });

        const failedText = failedCriteria.length > 0
          ? `\n\nFailed criteria:\n${failedCriteria.map((c, i) => `${i + 1}. ${c.name}: ${c.gap ?? c.evidence}`).join('\n')}`
          : '';
        const overrideText = status === 'max_iterations_reached'
          ? `\n\nHuman override required: call request_approval with gate_type "${RUBRIC_GATE_TYPE}" and include the step name, rubric id, and gaps before advancing, or revise and evaluate again.`
          : '';

        return {
          content: [{
            type: 'text' as const,
            text: `RUBRIC EVALUATION ${evaluation.id}: ${status}
Rubric: ${definition.id}
Step: ${args.step}
Score: ${evaluation.score.toFixed(2)}
Iteration: ${iteration}/${maxIterations}
${explanation}${failedText}${overrideText}`,
          }],
        };
      } catch (error) {
        const evaluation: RubricEvaluation = {
          id: `R-${String(++session.rubricCounter).padStart(3, '0')}`,
          rubricId: args.rubric_id,
          step: args.step,
          iteration,
          maxIterations,
          status: 'grader_error',
          score: 0,
          artifactSummary: args.artifact_summary,
          explanation: error instanceof Error ? error.message : String(error),
          criteria: [],
          timestamp: new Date().toISOString(),
        };
        boundedPush(session.rubricEvaluations, evaluation);
        session.events.emitEvent({
          type: 'rubric_evaluation_end',
          rubricId: args.rubric_id,
          step: args.step,
          iteration,
          result: evaluation.status,
          score: evaluation.score,
          failedCriteria: [],
          timestamp: eventTimestamp(),
        });
        return {
          content: [{ type: 'text' as const, text: `RUBRIC GRADER ERROR: ${evaluation.explanation}` }],
        };
      }
    },
  );

  const listRubrics = tool(
    'list_rubrics',
    'List registered Lavern rubric definitions and their criteria.',
    {},
    async () => ({
      content: [{
        type: 'text' as const,
        text: listRubricDefinitions()
          .map(def => `## ${def.id}\n${def.criteria.map(c => `- ${c.name}: ${c.description}`).join('\n')}`)
          .join('\n\n'),
      }],
    }),
    { annotations: { readOnly: true } },
  );

  return [evaluateRubric, listRubrics];
}
