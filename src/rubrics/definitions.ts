import type { RubricDefinition } from '../types/rubric.js';
import { RubricDefinitionSchema } from '../types/rubric.js';

const definitions = [
  {
    id: 'review.specialist_analysis',
    name: 'Review Specialist Analysis',
    description: 'Specialist review findings must be evidence-backed, located, calibrated, and actionable.',
    defaultMaxIterations: 2,
    criteria: [
      {
        id: 'findings-present',
        name: 'Material findings are present',
        description: 'The review produces at least one material finding or concern for the evaluator to inspect.',
      },
      {
        id: 'quoted-evidence',
        name: 'Findings cite source text',
        description: 'Every material finding has quoted text or a precise section, clause, article, or location reference.',
      },
      {
        id: 'location-severity-confidence',
        name: 'Findings are calibrated',
        description: 'Every material finding has location evidence, severity, and confidence metadata.',
      },
      {
        id: 'business-action',
        name: 'Findings state an action',
        description: 'Every material finding explains what to do next, such as negotiate, revise, add, remove, or escalate.',
      },
    ],
  },
  {
    id: 'review.verification_pass',
    name: 'Review Verification Pass',
    description: 'The post-production verification pass must complete all quality passes and surface the verdict.',
    defaultMaxIterations: 2,
    criteria: [
      {
        id: 'ten-passes-recorded',
        name: 'All verification passes recorded',
        description: 'All 10 verification passes have recorded pass results.',
      },
      {
        id: 'verdict-present',
        name: 'Verification verdict is present',
        description: 'A PASS, CONDITIONAL_PASS, CONDITIONAL PASS, or FAIL verdict is present in session state or artifact text.',
      },
      {
        id: 'critical-findings-visible',
        name: 'Critical findings are not hidden',
        description: 'Any critical findings are visible in the artifact summary or artifact text.',
      },
    ],
  },
  {
    id: 'delivery.final',
    name: 'Final Delivery Package',
    description: 'The final package must include the deliverable and the audit context required by Lavern.',
    defaultMaxIterations: 2,
    criteria: [
      {
        id: 'deliverable-present',
        name: 'Deliverable is present',
        description: 'The final deliverable text is present.',
      },
      {
        id: 'audit-bundle-present',
        name: 'Audit bundle is present',
        description: 'The output or session contains audit material: findings, resolutions, verification, or audit entries.',
      },
      {
        id: 'verification-summary-present',
        name: 'Verification summary is present',
        description: 'A verification summary, verification report, or pass result set is available.',
      },
      {
        id: 'cost-log-present',
        name: 'Cost log is present',
        description: 'Session cost state is available for the audit bundle.',
      },
      {
        id: 'disclaimer-present',
        name: 'Disclaimer is present',
        description: 'The deliverable includes the legal-advice disclaimer.',
      },
      {
        id: 'open-issues-visible',
        name: 'Open issues are visible',
        description: 'Unresolved or outstanding issues are listed, or the output explicitly says there are none.',
      },
    ],
  },
  {
    id: 'legal-design.transformation',
    name: 'Legal Design Transformation Preservation',
    description: 'The redesigned text must preserve legal effect and non-negotiable categories.',
    defaultMaxIterations: 2,
    criteria: [
      {
        id: 'transformed-output-present',
        name: 'Transformed output is present',
        description: 'The transformed document text or change log is available.',
      },
      {
        id: 'non-negotiables-addressed',
        name: 'Non-negotiables addressed',
        description: 'The output or verification record addresses monetary, timing, jurisdiction, dispute, defined term, insurance, and regulatory preservation.',
      },
      {
        id: 'meaning-verification-clear',
        name: 'Meaning verification is clear',
        description: 'No failed meaning-preservation verification remains unresolved.',
      },
    ],
  },
  {
    id: 'counsel.answer',
    name: 'Counsel Answer',
    description: 'Direct counsel answers must stay grounded, explicit, and non-advisory.',
    defaultMaxIterations: 2,
    criteria: [
      {
        id: 'source-citations-when-documents-present',
        name: 'Source citations when documents are present',
        description: 'If uploaded documents exist, the answer cites source text or precise sections.',
      },
      {
        id: 'assumptions-stated',
        name: 'Assumptions are stated',
        description: 'The answer states assumptions or says no material assumptions are being made.',
      },
      {
        id: 'not-legal-advice',
        name: 'Legal-advice framing avoided',
        description: 'The answer avoids presenting itself as legal advice and includes appropriate cautionary language.',
      },
      {
        id: 'professional-review-flagged',
        name: 'Professional review is flagged',
        description: 'The answer flags when qualified counsel or a legal professional should review the issue.',
      },
    ],
  },
];

export const RUBRIC_DEFINITIONS: Record<string, RubricDefinition> = Object.fromEntries(
  definitions.map((definition) => {
    const parsed = RubricDefinitionSchema.parse(definition);
    return [parsed.id, parsed];
  }),
);

export function getRubricDefinition(id: string): RubricDefinition | undefined {
  return RUBRIC_DEFINITIONS[id];
}

export function listRubricDefinitions(): RubricDefinition[] {
  return Object.values(RUBRIC_DEFINITIONS);
}
