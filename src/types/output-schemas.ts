/**
 * Structured JSON Output Schemas — Guarantees valid, parseable agent output.
 *
 * The "biggest single win" of v2. Uses the SDK's outputFormat feature:
 * { type: 'json_schema', schema: ... }
 *
 * Every agent returns validated JSON matching its schema. This enables:
 * - Downstream integration (dashboard, API, database)
 * - Automated quality checks (programmatic, not prompt-dependent)
 * - Reliable audit trail (structured, not free-form text)
 *
 * Uses Zod v4's built-in toJSONSchema() to convert Zod schemas → JSON Schema.
 */

import { z, toJSONSchema } from 'zod';

// ── Helper: Convert Zod schema to SDK outputFormat ──────────────────────

export function zodToOutputFormat(schema: z.ZodType): { type: 'json_schema'; schema: Record<string, unknown> } {
  return {
    type: 'json_schema' as const,
    schema: toJSONSchema(schema) as Record<string, unknown>,
  };
}

// ── Shared Sub-schemas ─────────────────────────────────────────────────

const SeveritySchema = z.enum(['RED', 'YELLOW', 'GREEN']);
const RiskLevelSchema = z.enum(['Low', 'REVIEW', 'CRITICAL']);

const DimensionScoreSchema = z.object({
  dimension: z.enum(['readability', 'findability', 'clarity', 'visual-design', 'ethics']),
  score: z.number().min(0).max(4),
  classification: SeveritySchema,
  evidence: z.array(z.string()),
  notes: z.string(),
});

const ComplexityTaxSchema = z.object({
  wordCount: z.number(),
  fkGrade: z.number(),
  difficultyMultiplier: z.number(),
  rereadFactor: z.number(),
  minutesPerReader: z.number(),
});

const FindingSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.string(),
  severity: SeveritySchema,
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const ChangeLogEntrySchema = z.object({
  number: z.number(),
  section: z.string(),
  original: z.string(),
  transformed: z.string(),
  intent: z.string(),
  risk: RiskLevelSchema,
});

const AmbiguityFlagSchema = z.object({
  number: z.number(),
  section: z.string(),
  topic: z.string(),
  original: z.string(),
  transformed: z.string(),
  concern: z.string(),
  recommendation: z.string(),
});

const NonNegotiableCheckSchema = z.object({
  element: z.string(),
  category: z.string(),
  originalValue: z.string(),
  preserved: z.boolean(),
  notes: z.string(),
});

// ── Agent Output Schemas ───────────────────────────────────────────────

/**
 * Design Reviewer: Scores across 5 dimensions + Complexity Tax
 */
export const DesignReviewOutputSchema = z.object({
  agentRole: z.literal('design-reviewer'),
  dimensions: z.array(DimensionScoreSchema),
  overallScore: z.number().min(0).max(4),
  overallClassification: SeveritySchema,
  complexityTax: ComplexityTaxSchema,
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Ethics Auditor: Dark pattern detection + compliance mapping
 */
export const EthicsAuditOutputSchema = z.object({
  agentRole: z.literal('ethics-auditor'),
  findings: z.array(FindingSchema),
  darkPatterns: z.array(z.object({
    category: z.string(),
    severity: SeveritySchema,
    evidence: z.string(),
    regulatoryRisk: z.string(),
    proposedFix: z.string(),
  })),
  complianceTouchpoints: z.array(z.object({
    regulation: z.string(),
    requirement: z.string(),
    status: z.enum(['compliant', 'non-compliant', 'needs-review']),
    evidence: z.string(),
  })),
  overallRating: SeveritySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Transformation Specialist: Plain language rewrite with change log
 */
export const TransformationOutputSchema = z.object({
  agentRole: z.literal('transformation-specialist'),
  userFacingDocument: z.string(),
  changeLog: z.array(ChangeLogEntrySchema),
  nonNegotiables: z.array(NonNegotiableCheckSchema),
  ambiguityFlags: z.array(AmbiguityFlagSchema),
  metrics: z.object({
    originalWordCount: z.number(),
    transformedWordCount: z.number(),
    originalFkGrade: z.number(),
    transformedFkGrade: z.number(),
    sectionsModified: z.number(),
    criticalChanges: z.number(),
  }),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Meaning Guardian: Legal meaning preservation verification
 */
export const MeaningVerificationOutputSchema = z.object({
  agentRole: z.literal('meaning-guardian'),
  checkpoints: z.array(z.object({
    checkpoint: z.string(),
    passed: z.boolean(),
    evidence: z.string(),
    severity: SeveritySchema,
  })),
  nonNegotiables: z.array(NonNegotiableCheckSchema),
  comprehensionTests: z.array(z.object({
    question: z.string(),
    originalAnswer: z.string(),
    transformedAnswer: z.string(),
    meaningPreserved: z.boolean(),
  })),
  findings: z.array(FindingSchema),
  overallVerdict: z.enum(['preserved', 'minor-concerns', 'critical-issues']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Synthesis Editor: Final dual-artifact assembly
 */
export const SynthesisOutputSchema = z.object({
  agentRole: z.literal('synthesis-editor'),
  artifact1: z.object({
    title: z.string(),
    content: z.string(),
    designPatternsApplied: z.array(z.string()),
  }),
  artifact2: z.object({
    changeLog: z.array(ChangeLogEntrySchema),
    nonNegotiables: z.array(NonNegotiableCheckSchema),
    debateResolutionSummary: z.string(),
    verificationReport: z.string(),
    auditTrailSummary: z.string(),
    recommendedNextSteps: z.array(z.string()),
  }),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Service Designer: User journey analysis
 */
export const ServiceDesignerOutputSchema = z.object({
  agentRole: z.literal('service-designer'),
  journeyMap: z.object({
    moment: z.string(),
    userGoals: z.array(z.string()),
    barriers: z.array(z.string()),
    momentsOfTruth: z.array(z.string()),
  }),
  infoArchitecture: z.object({
    organizedByUserNeed: z.boolean(),
    relatedConceptsGrouped: z.boolean(),
    matchesMentalModel: z.boolean(),
    issues: z.array(z.string()),
  }),
  cognitiveLoad: z.object({
    workingMemoryDemand: z.enum(['low', 'medium', 'high', 'excessive']),
    unnecessaryCrossReferences: z.number(),
    eliminableSections: z.array(z.string()),
    technicalBarriers: z.array(z.string()),
  }),
  accessibilityIssues: z.array(z.string()),
  actionability: z.object({
    instructionsAreClear: z.boolean(),
    deadlinesVisible: z.boolean(),
    nextStepsClear: z.boolean(),
    issues: z.array(z.string()),
  }),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Plain Language Specialist: Linguistic analysis
 */
export const PlainLanguageOutputSchema = z.object({
  agentRole: z.literal('plain-language-specialist'),
  sentenceAnalysis: z.object({
    averageLength: z.number(),
    longestSentence: z.object({ text: z.string(), wordCount: z.number() }),
    passiveVoicePercentage: z.number(),
    nominalizationCount: z.number(),
  }),
  wordAnalysis: z.object({
    jargonTerms: z.array(z.object({ term: z.string(), plainAlternative: z.string() })),
    undefinedTerms: z.array(z.string()),
    doubleNegatives: z.array(z.string()),
  }),
  structureAnalysis: z.object({
    hasProgressiveDisclosure: z.boolean(),
    hasVisualHierarchy: z.boolean(),
    averageParagraphLength: z.number(),
    issues: z.array(z.string()),
  }),
  rewrites: z.array(z.object({
    original: z.string(),
    rewritten: z.string(),
    improvement: z.string(),
    confidenceOfPreservation: z.number(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

/**
 * Client Proxy: Reader experience simulation
 */
export const ClientProxyOutputSchema = z.object({
  agentRole: z.literal('client-proxy'),
  persona: z.object({
    type: z.enum(['consumer', 'smb-owner', 'enterprise-counsel', 'employee']),
    description: z.string(),
    patienceLevel: z.string(),
  }),
  firstImpression: z.object({
    reaction: z.string(),
    wouldContinueReading: z.boolean(),
    estimatedTimeToAbandon: z.string().optional(),
  }),
  taskCompletion: z.array(z.object({
    task: z.string(),
    completed: z.boolean(),
    timeEstimate: z.string(),
    frustrationPoints: z.array(z.string()),
  })),
  comprehension: z.object({
    mainRightsUnderstood: z.boolean(),
    mainObligationsUnderstood: z.boolean(),
    confusingParts: z.array(z.string()),
  }),
  emotionalResponse: z.array(z.object({
    section: z.string(),
    emotion: z.string(),
    trigger: z.string(),
  })),
  wouldRecommendTests: z.array(z.object({
    question: z.string(),
    answer: z.boolean(),
    reasoning: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v5: Evaluator Gate Output Schema ─────────────────────────────────

const EvaluatorDimensionSchema = z.object({
  dimension: z.enum([
    'factual_correctness',
    'citation_validity',
    'policy_compliance',
    'tool_consistency',
    'jurisdictional_accuracy',
    'internal_consistency',
    'completeness',
    'actionability',
  ]),
  score: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  issues: z.array(z.string()),
});

/**
 * Evaluator: 8-dimension quality rubric evaluation
 */
export const EvaluatorOutputSchema = z.object({
  agentRole: z.literal('evaluator'),
  passed: z.boolean(),
  overallScore: z.number().min(0).max(1),
  dimensions: z.array(EvaluatorDimensionSchema),
  failureReasons: z.array(z.string()),
  revisionSuggestions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v5: Contract Review Output Schema ────────────────────────────────

const ClauseAnalysisSchema = z.object({
  clauseNumber: z.number(),
  clauseType: z.string(),
  summary: z.string(),
  riskScore: z.number().min(1).max(5),
  standardPosition: z.string(),
  deviation: z.string(),
  recommendedChange: z.string(),
  evidence: z.array(z.string()),
});

const TopConcernSchema = z.object({
  rank: z.number(),
  clauseNumber: z.number(),
  concern: z.string(),
  recommendedRedline: z.string(),
  riskIfUnchanged: z.string(),
});

/**
 * Contract Reviewer: Clause-by-clause risk-scored analysis
 */
export const ContractReviewOutputSchema = z.object({
  agentRole: z.literal('contract-reviewer'),
  executiveSummary: z.string(),
  overallRiskScore: z.number().min(1).max(5),
  overallRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  clauseAnalysis: z.array(ClauseAnalysisSchema),
  topConcerns: z.array(TopConcernSchema),
  negotiationPriorities: z.array(z.string()),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v6: Legal Research Output Schema ──────────────────────────────────

const AuthoritySchema = z.object({
  source: z.string(),
  citation: z.string(),
  relevance: z.string(),
  strength: z.number().min(1).max(5),
});

/**
 * Legal Researcher: Structured research memo with citations and confidence
 */
export const LegalResearchOutputSchema = z.object({
  agentRole: z.literal('legal-researcher'),
  researchQuestion: z.string(),
  jurisdictions: z.array(z.string()),
  thesis: z.string(),
  confidenceLevel: z.enum(['high', 'medium', 'low', 'uncertain']),
  supportingAuthorities: z.array(AuthoritySchema),
  opposingAuthorities: z.array(AuthoritySchema),
  unresolvedQuestions: z.array(z.string()),
  practicalImplications: z.string(),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v6: Risk Pricing Output Schema ───────────────────────────────────

const RiskFactorSchema = z.object({
  factor: z.string(),
  weight: z.number().min(0).max(1),
  score: z.number().min(0).max(1),
  evidence: z.string(),
});

const MitigatingFactorSchema = z.object({
  factor: z.string(),
  impact: z.string(),
  evidence: z.string(),
});

/**
 * Risk Pricer: Error probability, loss magnitude, insurability
 */
export const RiskPricingOutputSchema = z.object({
  agentRole: z.literal('risk-pricer'),
  overallRiskScore: z.number().min(0).max(1),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  errorProbability: z.number().min(0).max(1),
  potentialLossMagnitude: z.object({
    currency: z.string(),
    low: z.number(),
    mid: z.number(),
    high: z.number(),
  }),
  riskFactors: z.array(RiskFactorSchema),
  mitigatingFactors: z.array(MitigatingFactorSchema),
  insurabilityAssessment: z.object({
    insurable: z.boolean(),
    premiumEstimate: z.string(),
    conditions: z.array(z.string()),
  }),
  recommendations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v6: Red Team Output Schema ───────────────────────────────────────

const VulnerabilitySchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  exploitation: z.string(),
  recommendedFix: z.string(),
  evidence: z.array(z.string()),
});

const EdgeCaseSchema = z.object({
  scenario: z.string(),
  risk: z.string(),
  likelihood: z.enum(['low', 'medium', 'high']),
  impact: z.string(),
});

const AmbiguityAssessmentSchema = z.object({
  clause: z.string(),
  interpretation1: z.string(),
  interpretation2: z.string(),
  recommendation: z.string(),
});

/**
 * Red Team: Adversarial vulnerability report
 */
export const RedTeamOutputSchema = z.object({
  agentRole: z.literal('red-team'),
  overallAssessment: z.enum(['PASS', 'CONCERNS', 'FAIL']),
  vulnerabilities: z.array(VulnerabilitySchema),
  edgeCases: z.array(EdgeCaseSchema),
  ambiguities: z.array(AmbiguityAssessmentSchema),
  strengthsNoted: z.array(z.string()),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Leadership Output Schema ────────────────────────────────────

/**
 * Leadership agents: Managing Partner, Supervising Partner, Of Counsel
 * Strategic oversight, quality review, mentoring output
 */
export const LeadershipOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  strategicAssessment: z.object({
    overallQuality: z.enum(['exceptional', 'acceptable', 'needs-revision', 'reject']),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    keyStrengths: z.array(z.string()),
    criticalIssues: z.array(z.string()),
    strategicRecommendations: z.array(z.string()),
  }),
  qualityGate: z.object({
    passed: z.boolean(),
    conditions: z.array(z.string()),
    requiredRevisions: z.array(z.string()),
  }),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Corporate Lawyer Output Schema ──────────────────────────────

/**
 * Corporate & Transactional agents: Corporate Generalist, M&A, Contract, Banking, Capital Markets
 */
export const CorporateLawyerOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  analysis: z.array(z.object({
    section: z.string(),
    assessment: z.string(),
    riskScore: z.number().min(1).max(5),
    issues: z.array(z.string()),
    recommendations: z.array(z.string()),
  })),
  overallRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  keyTerms: z.array(z.object({
    term: z.string(),
    currentPosition: z.string(),
    marketStandard: z.string(),
    recommendation: z.string(),
  })),
  negotiationPoints: z.array(z.object({
    priority: z.number().min(1).max(5),
    point: z.string(),
    rationale: z.string(),
    fallbackPosition: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Litigation Lawyer Output Schema ─────────────────────────────

/**
 * Disputes & Litigation agents: Litigation Partner, Associate, Arbitration, Dispute Resolution
 */
export const LitigationLawyerOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  caseAssessment: z.object({
    meritScore: z.number().min(1).max(10),
    keyStrengths: z.array(z.string()),
    keyWeaknesses: z.array(z.string()),
    likelyOutcome: z.string(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  }),
  arguments: z.array(z.object({
    position: z.string(),
    supportingEvidence: z.array(z.string()),
    counterarguments: z.array(z.string()),
    strengthScore: z.number().min(1).max(10),
  })),
  strategyRecommendation: z.object({
    primaryStrategy: z.string(),
    alternativeStrategies: z.array(z.string()),
    settlementConsiderations: z.string(),
    estimatedTimeline: z.string(),
  }),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Regulatory Lawyer Output Schema ─────────────────────────────

/**
 * Regulatory & Compliance agents: Regulatory Counsel, Compliance Officer, Antitrust, Sanctions
 */
export const RegulatoryLawyerOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  regulatoryMapping: z.array(z.object({
    regulation: z.string(),
    jurisdiction: z.string(),
    requirement: z.string(),
    status: z.enum(['compliant', 'non-compliant', 'partially-compliant', 'not-applicable']),
    evidence: z.string(),
    remediation: z.string(),
  })),
  complianceScore: z.number().min(0).max(1),
  criticalGaps: z.array(z.object({
    gap: z.string(),
    regulation: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    deadline: z.string().optional(),
    remediation: z.string(),
  })),
  actionItems: z.array(z.object({
    priority: z.number().min(1).max(5),
    action: z.string(),
    responsible: z.string(),
    deadline: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Specialist Lawyer Output Schema ─────────────────────────────

/**
 * Specialist Practice agents: Tax, IP, Privacy, Employment, Real Estate, Environmental
 *
 * Base schema shared by all 6 specialists. Optional domain-specific sections
 * allow each agent to provide structured data for their specialty without
 * breaking the shared contract. Agents populate the section matching their role.
 */
export const SpecialistLawyerOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  specialistAnalysis: z.array(z.object({
    topic: z.string(),
    analysis: z.string(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    recommendations: z.array(z.string()),
    authorities: z.array(z.string()),
  })),
  keyRisks: z.array(z.object({
    risk: z.string(),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high', 'severe']),
    mitigation: z.string(),
  })),
  actionItems: z.array(z.object({
    priority: z.number().min(1).max(5),
    action: z.string(),
    rationale: z.string(),
  })),
  // Domain-specific optional sections (populated by matching specialist)
  taxAnalysis: z.object({
    taxImplications: z.array(z.string()),
    filingRequirements: z.array(z.object({ jurisdiction: z.string(), deadline: z.string(), form: z.string() })),
    estimatedLiability: z.object({ currency: z.string(), low: z.number(), high: z.number() }),
  }).optional(),
  ipAnalysis: z.object({
    protectionStatus: z.array(z.object({ asset: z.string(), type: z.string(), status: z.string() })),
    registrations: z.array(z.object({ type: z.string(), jurisdiction: z.string(), status: z.string() })),
    infringementRisks: z.array(z.object({ risk: z.string(), severity: z.string(), evidence: z.string() })),
  }).optional(),
  privacyAnalysis: z.object({
    dataFlows: z.array(z.object({ source: z.string(), destination: z.string(), dataType: z.string(), lawfulBasis: z.string() })),
    consentMechanisms: z.array(z.object({ mechanism: z.string(), adequate: z.boolean(), issues: z.array(z.string()) })),
    dpiaConcerns: z.array(z.string()),
  }).optional(),
  employmentAnalysis: z.object({
    classificationIssues: z.array(z.object({ role: z.string(), currentClassification: z.string(), risk: z.string() })),
    compensationRisks: z.array(z.object({ area: z.string(), exposure: z.string(), recommendation: z.string() })),
    terminationExposure: z.object({ riskLevel: z.string(), potentialClaims: z.array(z.string()), mitigation: z.array(z.string()) }),
  }).optional(),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Junior Lawyer Output Schema ─────────────────────────────────

/**
 * Junior agents: Junior Associate, Paralegal, Legal Intern
 */
export const JuniorLawyerOutputSchema = z.object({
  agentRole: z.string(),
  taskSummary: z.string(),
  research: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    sources: z.array(z.string()),
    confidenceLevel: z.enum(['high', 'medium', 'low']),
  })),
  draftContent: z.string().optional(),
  issuesIdentified: z.array(z.object({
    issue: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    suggestedAction: z.string(),
  })),
  questionsForSupervisor: z.array(z.string()),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Design Expert Output Schema ─────────────────────────────────

/**
 * Design & Communication experts: UX Writer, Information Architect, Visual Designer
 */
export const DesignExpertOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  designAnalysis: z.array(z.object({
    element: z.string(),
    currentState: z.string(),
    recommendation: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
    effort: z.enum(['low', 'medium', 'high']),
  })),
  contentSuggestions: z.array(z.object({
    location: z.string(),
    current: z.string(),
    proposed: z.string(),
    rationale: z.string(),
  })),
  prioritizedImprovements: z.array(z.object({
    priority: z.number().min(1).max(5),
    improvement: z.string(),
    expectedBenefit: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Research Expert Output Schema ───────────────────────────────

/**
 * User Research & Testing experts: Accessibility Specialist, User Researcher, Behavioral Scientist
 */
export const ResearchExpertOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  researchFindings: z.array(z.object({
    finding: z.string(),
    evidence: z.string(),
    impact: z.enum(['low', 'medium', 'high', 'critical']),
    recommendation: z.string(),
  })),
  userInsights: z.array(z.object({
    insight: z.string(),
    segment: z.string(),
    implications: z.array(z.string()),
  })),
  recommendations: z.array(z.object({
    priority: z.number().min(1).max(5),
    recommendation: z.string(),
    rationale: z.string(),
    expectedOutcome: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Governance Expert Output Schema ─────────────────────────────

/**
 * Ethics & Governance experts: DEI Specialist, Sustainability Analyst
 */
export const GovernanceExpertOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  assessmentAreas: z.array(z.object({
    area: z.string(),
    currentState: z.string(),
    rating: z.enum(['strong', 'adequate', 'needs-improvement', 'critical-gap']),
    gaps: z.array(z.string()),
    recommendations: z.array(z.string()),
  })),
  impactAssessment: z.object({
    positiveImpacts: z.array(z.string()),
    negativeImpacts: z.array(z.string()),
    mitigationStrategies: z.array(z.string()),
  }),
  actionItems: z.array(z.object({
    priority: z.number().min(1).max(5),
    action: z.string(),
    timeline: z.string(),
    expectedOutcome: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Technology Expert Output Schema ─────────────────────────────

/**
 * Technology & Data experts: Legal Engineer, Data Analyst, Cybersecurity Advisor, AI Ethics
 */
export const TechExpertOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  technicalAnalysis: z.array(z.object({
    component: z.string(),
    assessment: z.string(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    recommendations: z.array(z.string()),
  })),
  dataPoints: z.array(z.object({
    metric: z.string(),
    value: z.string(),
    benchmark: z.string().optional(),
    trend: z.enum(['improving', 'stable', 'declining']).optional(),
  })),
  recommendations: z.array(z.object({
    priority: z.number().min(1).max(5),
    recommendation: z.string(),
    implementation: z.string(),
    estimatedImpact: z.string(),
  })),
  // Domain-specific optional sections (populated by matching specialist)
  securityAssessment: z.object({
    vulnerabilities: z.array(z.object({ type: z.string(), severity: z.string(), description: z.string(), remediation: z.string() })),
    threatModel: z.object({ attackSurface: z.array(z.string()), threatActors: z.array(z.string()), mitigations: z.array(z.string()) }),
    complianceGaps: z.array(z.object({ standard: z.string(), gap: z.string(), remediation: z.string() })),
  }).optional(),
  aiEthicsAssessment: z.object({
    biasRisks: z.array(z.object({ area: z.string(), risk: z.string(), mitigation: z.string() })),
    transparencyScore: z.number().min(0).max(1),
    humanOversightGaps: z.array(z.object({ process: z.string(), gap: z.string(), recommendation: z.string() })),
  }).optional(),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Industry Expert Output Schema ───────────────────────────────

/**
 * Industry Specialists: Fintech, Healthcare, Media, Energy
 */
export const IndustryExpertOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  industryContext: z.object({
    sector: z.string(),
    keyRegulations: z.array(z.string()),
    marketTrends: z.array(z.string()),
    relevantPrecedents: z.array(z.string()),
  }),
  sectorAnalysis: z.array(z.object({
    topic: z.string(),
    analysis: z.string(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    industryBenchmark: z.string(),
    recommendations: z.array(z.string()),
  })),
  regulatoryConsiderations: z.array(z.object({
    regulation: z.string(),
    applicability: z.string(),
    complianceStatus: z.enum(['compliant', 'non-compliant', 'needs-review']),
    action: z.string(),
  })),
  // Domain-specific optional section (populated by matching specialist)
  sectorSpecifics: z.object({
    licensingRequirements: z.array(z.object({ license: z.string(), jurisdiction: z.string(), status: z.string(), deadline: z.string().optional() })),
    sectorBenchmarks: z.array(z.object({ metric: z.string(), industryAverage: z.string(), currentValue: z.string(), assessment: z.string() })),
    emergingRisks: z.array(z.object({ risk: z.string(), timeframe: z.string(), impact: z.string(), preparedness: z.string() })),
  }).optional(),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── v8: Quality Expert Output Schema ────────────────────────────────

/**
 * Quality & Infrastructure experts: Project Manager, Knowledge Manager, QA Tester
 */
export const QualityExpertOutputSchema = z.object({
  agentRole: z.string(),
  executiveSummary: z.string(),
  qualityAssessment: z.object({
    overallScore: z.number().min(0).max(1),
    passed: z.boolean(),
    areas: z.array(z.object({
      area: z.string(),
      score: z.number().min(0).max(1),
      issues: z.array(z.string()),
      suggestions: z.array(z.string()),
    })),
  }),
  issuesFound: z.array(z.object({
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    description: z.string(),
    location: z.string(),
    suggestedFix: z.string(),
  })),
  trackingItems: z.array(z.object({
    item: z.string(),
    status: z.enum(['pending', 'in-progress', 'completed', 'blocked']),
    assignee: z.string().optional(),
    notes: z.string(),
  })),
  findings: z.array(FindingSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

// ── Export all output formats for agent definitions ─────────────────────

export const outputFormats = {
  'design-reviewer': zodToOutputFormat(DesignReviewOutputSchema),
  'ethics-auditor': zodToOutputFormat(EthicsAuditOutputSchema),
  'transformation-specialist': zodToOutputFormat(TransformationOutputSchema),
  'meaning-guardian': zodToOutputFormat(MeaningVerificationOutputSchema),
  'synthesis-editor': zodToOutputFormat(SynthesisOutputSchema),
  'service-designer': zodToOutputFormat(ServiceDesignerOutputSchema),
  'plain-language-specialist': zodToOutputFormat(PlainLanguageOutputSchema),
  'client-proxy': zodToOutputFormat(ClientProxyOutputSchema),
  // v5: New agent output formats
  'evaluator': zodToOutputFormat(EvaluatorOutputSchema),
  'contract-reviewer': zodToOutputFormat(ContractReviewOutputSchema),
  // v6: Legal core, risk, and adversarial agent output formats
  'legal-researcher': zodToOutputFormat(LegalResearchOutputSchema),
  'risk-pricer': zodToOutputFormat(RiskPricingOutputSchema),
  'red-team': zodToOutputFormat(RedTeamOutputSchema),
  // v8: Practice area group schemas
  'managing-partner': zodToOutputFormat(LeadershipOutputSchema),
  'corporate-lawyer': zodToOutputFormat(CorporateLawyerOutputSchema),
  'litigation-lawyer': zodToOutputFormat(LitigationLawyerOutputSchema),
  'regulatory-lawyer': zodToOutputFormat(RegulatoryLawyerOutputSchema),
  'specialist-lawyer': zodToOutputFormat(SpecialistLawyerOutputSchema),
  'junior-lawyer': zodToOutputFormat(JuniorLawyerOutputSchema),
  'design-expert': zodToOutputFormat(DesignExpertOutputSchema),
  'research-expert': zodToOutputFormat(ResearchExpertOutputSchema),
  'governance-expert': zodToOutputFormat(GovernanceExpertOutputSchema),
  'tech-expert': zodToOutputFormat(TechExpertOutputSchema),
  'industry-expert': zodToOutputFormat(IndustryExpertOutputSchema),
  'quality-expert': zodToOutputFormat(QualityExpertOutputSchema),
} as const;
