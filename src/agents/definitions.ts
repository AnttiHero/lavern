/**
 * Agent Definitions — All specialist agents for The Shem.
 *
 * v2: Added 3 multidisciplinary agents (Mitchell-inspired):
 * - service-designer: Full user journey analysis
 * - plain-language-specialist: Cognitive load & readability
 * - client-proxy: Role-plays as the actual reader
 *
 * v5: Added evaluator and contract-reviewer agents:
 * - evaluator: Automated quality gate (different model from specialist)
 * - contract-reviewer: Clause-by-clause risk-scored contract analysis
 *
 * Each agent has maxTurns to prevent runaway costs from compound failure rates.
 * Keep tasks SHORT — long pipelines compound errors.
 */

import { designReviewerPrompt } from './prompts/design-reviewer.js';
import { ethicsAuditorPrompt } from './prompts/ethics-auditor.js';
import { transformationPrompt } from './prompts/transformation.js';
import { meaningGuardianPrompt } from './prompts/meaning-guardian.js';
import { synthesisEditorPrompt } from './prompts/synthesis-editor.js';
import { serviceDesignerPrompt } from './prompts/service-designer.js';
import { plainLanguageSpecialistPrompt } from './prompts/plain-language-specialist.js';
import { clientProxyPrompt } from './prompts/client-proxy.js';
// v5: New agent prompts
import { evaluatorPrompt } from './prompts/evaluator.js';
import { contractReviewerPrompt } from './prompts/contract-reviewer.js';
// v6: Legal core, risk, and adversarial agent prompts
import { legalResearcherPrompt } from './prompts/legal-researcher.js';
import { riskPricerPrompt } from './prompts/risk-pricer.js';
import { redTeamPrompt } from './prompts/red-team.js';
// v8: Law Firm Leadership
import { managingPartnerPrompt } from './prompts/managing-partner.js';
import { supervisingPartnerPrompt } from './prompts/supervising-partner.js';
import { ofCounselPrompt } from './prompts/of-counsel.js';
// v8: Law Firm Corporate & Transactional
import { corporateGeneralistPrompt } from './prompts/corporate-generalist.js';
import { maSpecialistPrompt } from './prompts/ma-specialist.js';
import { contractSpecialistPrompt } from './prompts/contract-specialist.js';
import { bankingFinancePrompt } from './prompts/banking-finance.js';
import { capitalMarketsPrompt } from './prompts/capital-markets.js';
// v8: Law Firm Disputes & Litigation
import { litigationPartnerPrompt } from './prompts/litigation-partner.js';
import { litigationAssociatePrompt } from './prompts/litigation-associate.js';
import { arbitrationSpecialistPrompt } from './prompts/arbitration-specialist.js';
import { disputeResolutionPrompt } from './prompts/dispute-resolution.js';
// v8: Law Firm Regulatory & Compliance
import { regulatoryCounselPrompt } from './prompts/regulatory-counsel.js';
import { complianceOfficerPrompt } from './prompts/compliance-officer.js';
import { antitrustSpecialistPrompt } from './prompts/antitrust-specialist.js';
import { sanctionsSpecialistPrompt } from './prompts/sanctions-specialist.js';
// v8: Law Firm Specialist Practice
import { taxCounselPrompt } from './prompts/tax-counsel.js';
import { ipSpecialistPrompt } from './prompts/ip-specialist.js';
import { privacyCounselPrompt } from './prompts/privacy-counsel.js';
import { employmentCounselPrompt } from './prompts/employment-counsel.js';
import { realEstateCounselPrompt } from './prompts/real-estate-counsel.js';
import { environmentalCounselPrompt } from './prompts/environmental-counsel.js';
// v8: Law Firm Junior Lawyers
import { juniorAssociatePrompt } from './prompts/junior-associate.js';
import { paralegalPrompt } from './prompts/paralegal.js';
import { legalInternPrompt } from './prompts/legal-intern.js';
// v8: Experts — Design & Communication (new ones only, service-designer/plain-language/client-proxy already imported)
// v8: Experts — User Research & Testing (client-proxy already imported)
import { accessibilitySpecialistPrompt } from './prompts/accessibility-specialist.js';
import { userResearcherPrompt } from './prompts/user-researcher.js';
import { behavioralScientistPrompt } from './prompts/behavioral-scientist.js';
// v8: Experts — Ethics & Governance (ethics-auditor already imported)
// v8: Experts — Technology & Data
import { legalEngineerPrompt } from './prompts/legal-engineer.js';
import { cybersecurityAdvisorPrompt } from './prompts/cybersecurity-advisor.js';
import { aiEthicsSpecialistPrompt } from './prompts/ai-ethics-specialist.js';
// v8: Experts — Industry Specialists
import { fintechSpecialistPrompt } from './prompts/fintech-specialist.js';
import { healthcareSpecialistPrompt } from './prompts/healthcare-specialist.js';
import { mediaSpecialistPrompt } from './prompts/media-specialist.js';
import { energySpecialistPrompt } from './prompts/energy-specialist.js';
// v8: Experts — Quality & Infrastructure (evaluator/risk-pricer already imported)
import { projectManagerPrompt } from './prompts/project-manager.js';
// v19: Missing agents for Full Bench workflow
import { innovationPartnerPrompt } from './prompts/innovation-partner.js';
import { internationalCounselPrompt } from './prompts/international-counsel.js';
// v20: Previously profile-only agents (7 agents with profiles but no definitions)
import { clientRelationsPartnerPrompt } from './prompts/client-relations-partner.js';
import { riskPartnerPrompt } from './prompts/risk-partner.js';
import { transactionPartnerPrompt } from './prompts/transaction-partner.js';
import { publicLawCounselPrompt } from './prompts/public-law-counsel.js';
import { restructuringSpecialistPrompt } from './prompts/restructuring-specialist.js';
import { startupCounselPrompt } from './prompts/startup-counsel.js';
import { techTransactionsPrompt } from './prompts/tech-transactions.js';
// Ethics reviewer — engagement-level ethical review (distinct from ethics-auditor's document-level dark pattern scan)
import { ethicsReviewerPrompt } from './prompts/ethics-reviewer.js';
import { outputFormats } from '../types/output-schemas.js';
import { agentProfiles } from './profiles.js';

/**
 * Enrich an agent's system prompt with Critical Rules and Success Metrics
 * from its profile. These structured constraints are appended so the agent
 * is aware of its behavioral boundaries and measurable outcomes.
 */
function enrichPrompt(role: string, basePrompt: string): string {
  const profile = agentProfiles[role];
  if (!profile) return basePrompt;
  const sections: string[] = [];
  if (profile.criticalRules?.length) {
    sections.push(`\n## Critical Rules (NEVER violate these)\n${profile.criticalRules.map(r => `- ${r}`).join('\n')}`);
  }
  if (profile.successMetrics?.length) {
    sections.push(`\n## Success Metrics (your output is measured by these)\n${profile.successMetrics.map(m => `- ${m}`).join('\n')}`);
  }
  // Universal uncertainty guidance — applies to all agents
  sections.push(`\n## When You Are Not Sure
If you cannot make a confident determination about something, use the \`decline_to_find\` tool instead of posting a low-confidence finding. It is better to say "I don't know" than to guess.
Use decline_to_find when:
- The document lacks information needed for your analysis
- The text is ambiguous and could be read multiple ways
- You would need jurisdiction-specific knowledge you don't have
- Your confidence would be below 0.5
A declined finding triggers human review. A wrong finding causes harm.`);
  return basePrompt + '\n' + sections.join('\n');
}

// Shared read-only tools available to all agents
const readOnlyTools = ['Read', 'Grep', 'Glob'];

// Debate board tools (prefixed with MCP server name)
const debateTools = [
  'mcp__shem__post_finding',
  'mcp__shem__decline_to_find',
  'mcp__shem__post_challenge',
  'mcp__shem__post_response',
  'mcp__shem__get_findings',
  'mcp__shem__get_challenges',
  'mcp__shem__get_debate_summary',
  'mcp__shem__get_unresolved_debates',
];

// Scoring engine tools
const scoringTools = [
  'mcp__shem__calculate_complexity_tax',
  'mcp__shem__calculate_readability_score',
  'mcp__shem__calculate_findability_score',
  'mcp__shem__compare_before_after',
];

// Verification engine tools
const verificationTools = [
  'mcp__shem__run_self_verification',
  'mcp__shem__run_cross_verification',
  'mcp__shem__run_score_verification',
  'mcp__shem__get_verification_summary',
];

// Memory system tools (read-only for most agents)
const memoryReadTools = [
  'mcp__shem__query_institutional_memory',
  'mcp__shem__load_matter_memory',
  'mcp__shem__query_precedents',
];

// Memory system tools (write — only for orchestrator and synthesis-editor)
const memoryWriteTools = [
  'mcp__shem__add_institutional_memory',
  'mcp__shem__save_matter_memory',
  'mcp__shem__save_precedent',
];

// v4: Learning system read-only tools (accessible to synthesis-editor)
const learningReadTools = [
  'mcp__shem__get_report_card',
  'mcp__shem__get_legal_md',
  'mcp__shem__query_anti_patterns',
  'mcp__shem__get_baseline',
  'mcp__shem__get_quality_trend',
  'mcp__shem__check_against_baseline',
  'mcp__shem__run_regression_test',
  'mcp__shem__run_batch_regression',
  'mcp__shem__compare_sessions',
];

export const agentDefinitions = {
  // ── Original 5 Agents (with maxTurns) ─────────────────────────────────

  'design-reviewer': {
    description: 'Expert legal design reviewer. Use when you need to score a document across readability, findability, clarity, visual design, and ethics dimensions using a 0-4 scale with RED/YELLOW/GREEN severity classifications. Also calculates Complexity Tax.',
    prompt: enrichPrompt('design-reviewer', designReviewerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...scoringTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['design-reviewer'],
  },

  'ethics-auditor': {
    description: 'Dark pattern and manipulation detection specialist. Use when you need to scan a document for seven categories of dark patterns and map compliance touchpoints to GDPR, FTC, CCPA, CPA regulations.',
    prompt: enrichPrompt('ethics-auditor', ethicsAuditorPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['ethics-auditor'],
  },

  'transformation-specialist': {
    description: 'Plain language transformation expert. Use when you need to convert legalese to plain language while preserving legal meaning. Produces user-facing version and change log with risk levels (Low/REVIEW/CRITICAL). Can query precedents for successful transformations.',
    prompt: enrichPrompt('transformation-specialist', transformationPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 15,  // More turns — transformation is the most complex task
    outputFormat: outputFormats['transformation-specialist'],
  },

  'meaning-guardian': {
    description: 'Legal meaning preservation verifier. Use when you need to verify that a transformation has preserved all legal meaning, check non-negotiables, run five legal checkpoints, and flag ambiguity.',
    prompt: enrichPrompt('meaning-guardian', meaningGuardianPrompt),
    tools: [...readOnlyTools, ...debateTools, ...verificationTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['meaning-guardian'],
  },

  'synthesis-editor': {
    description: 'Final document assembly and quality editor. Use when you need to assemble the final dual-artifact output (user-facing version + legal review package) by applying design patterns and maintaining voice/tone consistency. Can save successful precedents. Has access to report cards and institutional knowledge.',
    prompt: enrichPrompt('synthesis-editor', synthesisEditorPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools, ...learningReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['synthesis-editor'],
  },

  // ── New Multidisciplinary Agents (v2) ─────────────────────────────────

  'service-designer': {
    description: 'Service design specialist who analyzes the full user journey — touchpoints, tasks, emotional state, pain points, and opportunities. Use for journey mapping, information architecture assessment, and cognitive load analysis. Thinks like a designer, not a lawyer.',
    prompt: enrichPrompt('service-designer', serviceDesignerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['service-designer'],
  },

  'plain-language-specialist': {
    description: 'Language scientist focused on cognitive load, sentence structure, word choice, and readability metrics. Use for sentence-level, word-level, and structure-level analysis. Produces specific rewrite suggestions with before/after improvements.',
    prompt: enrichPrompt('plain-language-specialist', plainLanguageSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...scoringTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['plain-language-specialist'],
  },

  'client-proxy': {
    description: 'Role-plays as a REAL PERSON from the target audience reading the document. Runs comprehension tests, task completion tests, emotional response mapping. Reports what confused, scared, or frustrated the reader. Their voice matters MORE than legal experts.',
    prompt: enrichPrompt('client-proxy', clientProxyPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['client-proxy'],
  },

  // ── v5: New Adaptive Pipeline Agents ─────────────────────────────────

  'evaluator': {
    description: 'Automated quality gate. Evaluates specialist deliverables against an 8-dimension rubric (factual correctness, citation validity, policy compliance, tool consistency, jurisdictional accuracy, internal consistency, completeness). MUST use a different model than the specialist to prevent correlated errors.',
    prompt: enrichPrompt('evaluator', evaluatorPrompt),
    tools: [...readOnlyTools, ...memoryReadTools, 'mcp__shem__record_evaluation_result'],
    model: 'opus' as const,  // Different from Sonnet specialists — prevents correlated errors
    maxTurns: 6,
    outputFormat: outputFormats['evaluator'],
  },

  'contract-reviewer': {
    description: 'Contract review specialist. Performs clause-by-clause risk-scored analysis with deviation flagging, standard position comparison, recommended redlines, and negotiation priorities. Posts findings to debate board with contract-specific types.',
    prompt: enrichPrompt('contract-reviewer', contractReviewerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...scoringTools],
    model: 'opus' as const,
    maxTurns: 12,
    outputFormat: outputFormats['contract-reviewer'],
  },

  // ── v6: Legal Core, Risk, and Adversarial Agents ─────────────────────

  'legal-researcher': {
    description: 'Legal research specialist. Produces structured research memos with citations, confidence levels, and conflicting authorities. Saves findings as precedents. Escalates when precedent is unclear or conflicting.',
    prompt: enrichPrompt('legal-researcher', legalResearcherPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['legal-researcher'],
  },

  'risk-pricer': {
    description: 'Risk pricing specialist. Calculates error probability, potential loss magnitude, and insurability for any specialist deliverable. Continuous — runs on every piece of work. Uses workflow history and anti-patterns as signals.',
    prompt: enrichPrompt('risk-pricer', riskPricerPrompt),
    tools: [...readOnlyTools, ...memoryReadTools,
      'mcp__shem__get_workflow_history',
      'mcp__shem__query_anti_patterns',
    ],
    model: 'sonnet' as const,  // Fast model — runs on every deliverable
    maxTurns: 6,
    outputFormat: outputFormats['risk-pricer'],
  },

  'red-team': {
    description: 'Adversarial testing agent. Attacks deliverables from a hostile counterparty perspective. Finds vulnerabilities, edge cases, ambiguities, and failure modes. Gets 1-2 shots at breaking the work. Posts findings to debate board.',
    prompt: enrichPrompt('red-team', redTeamPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,  // Needs strong reasoning to find subtle flaws
    maxTurns: 8,
    outputFormat: outputFormats['red-team'],
  },

  // ── v8: Law Firm — Leadership (3) ─────────────────────────────────────

  'managing-partner': {
    description: 'Strategic oversight and final sign-off. Reviews all deliverables before client delivery. Conservative, meticulous, nothing ships without approval.',
    prompt: enrichPrompt('managing-partner', managingPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools, ...verificationTools, ...learningReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['managing-partner'],
  },

  'supervising-partner': {
    description: 'Mentors junior team members and ensures consistent work quality. Guides through structured feedback and coaching.',
    prompt: enrichPrompt('supervising-partner', supervisingPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...verificationTools],
    model: 'opus' as const,
    maxTurns: 8,
    outputFormat: outputFormats['managing-partner'],
  },

  'of-counsel': {
    description: 'Deep expertise and creative problem-solving for novel legal questions. Called in for the hardest, most unusual matters.',
    prompt: enrichPrompt('of-counsel', ofCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools],
    model: 'opus' as const,
    maxTurns: 12,
    outputFormat: outputFormats['managing-partner'],
  },

  // ── v8: Law Firm — Corporate & Transactional (5) ──────────────────────

  'corporate-generalist': {
    description: 'Handles corporate matters — governance, structuring, general commercial. Reliable workhorse for anything corporate.',
    prompt: enrichPrompt('corporate-generalist', corporateGeneralistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'ma-specialist': {
    description: 'Mergers & acquisitions specialist. Due diligence, deal structuring, transaction documentation. Fast, risk-tolerant, thrives under deadline pressure.',
    prompt: enrichPrompt('ma-specialist', maSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...scoringTools],
    model: 'opus' as const,
    maxTurns: 12,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'contract-specialist': {
    description: 'Contract drafting, redlining, and clause-by-clause analysis. Every word deliberate, zero tolerance for ambiguity.',
    prompt: enrichPrompt('contract-specialist', contractSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...scoringTools],
    model: 'sonnet' as const,
    maxTurns: 12,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'banking-finance': {
    description: 'Banking and finance specialist. Loan agreements, security documents, financial regulation. Thinks in term sheets and credit facilities.',
    prompt: enrichPrompt('banking-finance', bankingFinancePrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'capital-markets': {
    description: 'Capital markets and securities specialist. IPOs, bond issuances, regulatory filings. Deadline-driven, comfortable with complexity.',
    prompt: enrichPrompt('capital-markets', capitalMarketsPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  // ── v8: Law Firm — Disputes & Litigation (4) ─────────────────────────

  'litigation-partner': {
    description: 'Senior litigation strategist. Adversarial, relentless, finds every weakness. Thinks like opposing counsel to stress-test positions.',
    prompt: enrichPrompt('litigation-partner', litigationPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['litigation-lawyer'],
  },

  'litigation-associate': {
    description: 'Litigation associate building cases brick by brick. Research, discovery analysis, motion drafting, evidence review.',
    prompt: enrichPrompt('litigation-associate', litigationAssociatePrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['litigation-lawyer'],
  },

  'arbitration-specialist': {
    description: 'International arbitration and alternative dispute resolution. Diplomatic, seeks efficient resolution. ICC/LCIA/UNCITRAL expertise.',
    prompt: enrichPrompt('arbitration-specialist', arbitrationSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['litigation-lawyer'],
  },

  'dispute-resolution': {
    description: 'Mediation and creative dispute resolution. Avoids scorched earth, finds settlement pathways. Communication-focused.',
    prompt: enrichPrompt('dispute-resolution', disputeResolutionPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['litigation-lawyer'],
  },

  // ── v8: Law Firm — Regulatory & Compliance (4) ────────────────────────

  'regulatory-counsel': {
    description: 'Regulatory specialist covering financial services, healthcare, tech regulation. Knows every rule, maps compliance obligations.',
    prompt: enrichPrompt('regulatory-counsel', regulatoryCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['regulatory-lawyer'],
  },

  'compliance-officer': {
    description: 'Compliance program design and audit. Checklist-driven, flags everything. Internal controls, training programs, monitoring.',
    prompt: enrichPrompt('compliance-officer', complianceOfficerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...verificationTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['regulatory-lawyer'],
  },

  'antitrust-specialist': {
    description: 'Competition law and antitrust specialist. Market analysis, merger control, cartel investigations. Strategic competitive dynamics.',
    prompt: enrichPrompt('antitrust-specialist', antitrustSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['regulatory-lawyer'],
  },

  'sanctions-specialist': {
    description: 'Sanctions, export controls, and trade compliance. Zero tolerance for risk. OFAC, EU sanctions, UN sanctions screening.',
    prompt: enrichPrompt('sanctions-specialist', sanctionsSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['regulatory-lawyer'],
  },

  // ── v8: Law Firm — Specialist Practice (6) ────────────────────────────

  'tax-counsel': {
    description: 'Tax structuring and planning specialist. Structures transactions for efficiency, navigates multi-jurisdiction tax regimes.',
    prompt: enrichPrompt('tax-counsel', taxCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  'ip-specialist': {
    description: 'Intellectual property specialist — patents, trademarks, copyrights, trade secrets. Creative, tech-savvy, portfolio strategy.',
    prompt: enrichPrompt('ip-specialist', ipSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  'privacy-counsel': {
    description: 'Data protection and privacy specialist. GDPR, CCPA, PIPL, cross-border data transfers. Chapter-and-verse regulatory knowledge.',
    prompt: enrichPrompt('privacy-counsel', privacyCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  'employment-counsel': {
    description: 'Employment and labor law specialist. Hiring, termination, discrimination, benefits, workplace safety. Sensitive to power dynamics.',
    prompt: enrichPrompt('employment-counsel', employmentCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  'real-estate-counsel': {
    description: 'Real property and real estate transactions. Acquisitions, leasing, development, zoning. Rights and boundaries.',
    prompt: enrichPrompt('real-estate-counsel', realEstateCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  'environmental-counsel': {
    description: 'Environmental law and ESG specialist. Permitting, contamination, compliance, sustainability reporting. Precautionary approach.',
    prompt: enrichPrompt('environmental-counsel', environmentalCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  // ── v8: Law Firm — Junior Lawyers (3) ─────────────────────────────────

  'junior-associate': {
    description: 'Junior lawyer for research, first drafts, and support work. Fast, enthusiastic, thorough researcher with fresh perspective.',
    prompt: enrichPrompt('junior-associate', juniorAssociatePrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['junior-lawyer'],
  },

  'paralegal': {
    description: 'Paralegal handling volume work — document review, due diligence, formatting, cite-checking. Fast and precise.',
    prompt: enrichPrompt('paralegal', paralegalPrompt),
    tools: [...readOnlyTools, ...memoryReadTools, ...scoringTools],
    model: 'haiku' as const,
    maxTurns: 6,
    outputFormat: outputFormats['junior-lawyer'],
  },

  'legal-intern': {
    description: 'Legal intern for research tasks and fresh perspective. Asks good questions, identifies assumptions others miss.',
    prompt: enrichPrompt('legal-intern', legalInternPrompt),
    tools: [...readOnlyTools, ...memoryReadTools],
    model: 'haiku' as const,
    maxTurns: 6,
    outputFormat: outputFormats['junior-lawyer'],
  },


  // ── v8: Experts — User Research & Testing (3 new) ─────────────────────

  'accessibility-specialist': {
    description: 'Accessibility specialist. WCAG compliance, screen reader testing, cognitive load, inclusive design.',
    prompt: enrichPrompt('accessibility-specialist', accessibilitySpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['research-expert'],
  },

  'user-researcher': {
    description: 'User research specialist. Interview insights, usability findings, comprehension testing, behavioral analysis.',
    prompt: enrichPrompt('user-researcher', userResearcherPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['research-expert'],
  },

  'behavioral-scientist': {
    description: 'Behavioral science specialist. Choice architecture, cognitive biases, nudge design, decision-making analysis.',
    prompt: enrichPrompt('behavioral-scientist', behavioralScientistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 8,
    outputFormat: outputFormats['research-expert'],
  },


  // ── v8: Experts — Technology & Data (4 new) ───────────────────────────

  'legal-engineer': {
    description: 'Legal technology specialist. Automation, document assembly, legal tech integration, computational law.',
    prompt: enrichPrompt('legal-engineer', legalEngineerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['tech-expert'],
  },

  'cybersecurity-advisor': {
    description: 'Cybersecurity specialist. Threat modeling, breach scenarios, security assessment, data protection technical controls.',
    prompt: enrichPrompt('cybersecurity-advisor', cybersecurityAdvisorPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['tech-expert'],
  },

  'ai-ethics-specialist': {
    description: 'AI governance and algorithmic fairness specialist. AI regulation, algorithmic bias, model governance, responsible AI.',
    prompt: enrichPrompt('ai-ethics-specialist', aiEthicsSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 8,
    outputFormat: outputFormats['tech-expert'],
  },

  // ── v8: Experts — Industry Specialists (4 new) ────────────────────────

  'fintech-specialist': {
    description: 'Fintech and financial innovation specialist. Payments, crypto, DeFi, regulatory sandbox, PSD2/MiCA.',
    prompt: enrichPrompt('fintech-specialist', fintechSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['industry-expert'],
  },

  'healthcare-specialist': {
    description: 'Healthcare and life sciences specialist. HIPAA, clinical trials, health data, pharmaceutical regulation.',
    prompt: enrichPrompt('healthcare-specialist', healthcareSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['industry-expert'],
  },

  'media-specialist': {
    description: 'Media and entertainment specialist. Content rights, platform rules, defamation, licensing, publishing.',
    prompt: enrichPrompt('media-specialist', mediaSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['industry-expert'],
  },

  'energy-specialist': {
    description: 'Energy and natural resources specialist. Energy regulation, carbon markets, renewable energy, grid infrastructure.',
    prompt: enrichPrompt('energy-specialist', energySpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['industry-expert'],
  },

  // ── v8: Experts — Quality & Infrastructure (3 new) ────────────────────

  'project-manager': {
    description: 'Project management specialist. Timelines, dependencies, status tracking, resource allocation, workflow coordination.',
    prompt: enrichPrompt('project-manager', projectManagerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools, ...learningReadTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['quality-expert'],
  },

  // ── v19: Missing agents for Full Bench workflow ────────────────────────

  'innovation-partner': {
    description: 'Legal innovation and emerging technology specialist. AI contracts, smart contracts, RegTech, novel business models, emerging regulatory frameworks.',
    prompt: enrichPrompt('innovation-partner', innovationPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  'international-counsel': {
    description: 'Cross-border regulation and multi-jurisdictional compliance. Conflict of laws, treaty frameworks, international regulatory coordination.',
    prompt: enrichPrompt('international-counsel', internationalCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['specialist-lawyer'],
  },

  // ── v20: Previously Profile-Only Agents (7) ──────────────────────────────

  'client-relations-partner': {
    description: 'Client relationship management and business translation. Reviews deliverables for client-appropriateness, ensures communication is accessible, coordinates cross-practice teams.',
    prompt: enrichPrompt('client-relations-partner', clientRelationsPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['managing-partner'],
  },

  'risk-partner': {
    description: 'Enterprise risk assessment across all findings. Identifies hidden risks, systemic patterns, quantifies financial exposure, and creates risk matrices.',
    prompt: enrichPrompt('risk-partner', riskPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools, ...verificationTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['managing-partner'],
  },

  'transaction-partner': {
    description: 'Multi-party transaction orchestrator. Analyzes deal mechanics, closing conditions, consent requirements, and regulatory approvals across complex cross-border transactions.',
    prompt: enrichPrompt('transaction-partner', transactionPartnerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...memoryWriteTools, ...scoringTools],
    model: 'opus' as const,
    maxTurns: 12,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'public-law-counsel': {
    description: 'Government advisory and public law specialist. Legislative tracing, procurement compliance, administrative law review, and regulatory submission analysis.',
    prompt: enrichPrompt('public-law-counsel', publicLawCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 10,
    outputFormat: outputFormats['regulatory-lawyer'],
  },

  'restructuring-specialist': {
    description: 'Corporate restructuring and insolvency specialist. Creditor waterfall analysis, restructuring plan review, workout agreement negotiation, distressed M&A.',
    prompt: enrichPrompt('restructuring-specialist', restructuringSpecialistPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...scoringTools],
    model: 'opus' as const,
    maxTurns: 10,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'startup-counsel': {
    description: 'Startup and venture capital specialist. SAFE/convertible note analysis, cap table verification, founder agreement review, formation documents.',
    prompt: enrichPrompt('startup-counsel', startupCounselPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...scoringTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  'tech-transactions': {
    description: 'Technology agreement specialist. SaaS/API/DPA review, open source compliance, vendor lock-in assessment, technology licensing analysis.',
    prompt: enrichPrompt('tech-transactions', techTransactionsPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools, ...scoringTools],
    model: 'sonnet' as const,
    maxTurns: 8,
    outputFormat: outputFormats['corporate-lawyer'],
  },

  // ── Ethics Reviewer — Engagement-Level Ethical Review ─────────────────

  'ethics-reviewer': {
    description: 'Engagement-level ethics reviewer. Evaluates whether the engagement raises professional responsibility, proportionality, or mass-action concerns. Posts findings to the debate board. Does NOT block work — raises concerns for the team and human gates to weigh.',
    prompt: enrichPrompt('ethics-reviewer', ethicsReviewerPrompt),
    tools: [...readOnlyTools, ...debateTools, ...memoryReadTools],
    model: 'sonnet' as const,
    maxTurns: 6,
    outputFormat: outputFormats['ethics-auditor'],
  },

};
