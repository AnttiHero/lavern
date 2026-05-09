/**
 * Reader templates — per-document-type per-clause prompts.
 *
 * The generic Reader prompt asks "what could go wrong for the client
 * under this clause?" That's fine for any contract, but it's blunt.
 * A JV review wants questions about operator dynamics and cash calls.
 * A SaaS review wants questions about SLAs and data ownership. A
 * privacy policy wants plain-language and consumer-law enforceability.
 *
 * Phase 6 (lighthouse): the Watchman picks the documentType; the
 * Reader uses the matching template. Local Gemma + a focused template
 * is the difference between "competent generic review" and "specialist
 * pass on this document type."
 *
 * All templates produce the same JSON output shape (concerns array,
 * favoursWhom, etc.) so the synthesis step doesn't care which
 * template ran.
 */

import type { WatchmanDocumentType } from './types.js';

// ── Common output schema (every template produces this) ──────────────

const OUTPUT_SCHEMA = `Output ONLY a JSON object with this exact structure:
{
  "clauseRiskSummary": "string (1-2 sentences specific to THIS clause, not generic)",
  "operative_text": "string (verbatim excerpt, 1-3 sentences, from this clause)",
  "concerns": [
    {
      "text": "string (specific concern referencing defined term / party / number)",
      "severity": "info" | "minor" | "major" | "critical",
      "references": ["string"]
    }
  ],
  "favoursWhom": "operator" | "non-operator" | "neutral"
}`;

const COMMON_RULES = `Rules — failure to follow makes your output unusable:

1. Every "concern" must reference at least ONE of:
     (a) a specific defined term from this contract
     (b) a specific party by name
     (c) a specific dollar amount, percentage, or time period from the clause text

   Concerns that say only "ensure clarity" or "verify terms are clear" are GENERIC and FORBIDDEN.

2. Severity rules — use the full scale, do not default to "info":
     - "critical" → potential loss > 10% of project value, or unrecoverable rights forfeiture
     - "major"    → recoverable but materially adverse outcome, or onerous mechanic
     - "minor"    → mild drafting risk, ambiguity worth flagging
     - "info"     → background / definitional only (use sparingly)

3. If the clause is purely definitional or boilerplate, output an empty concerns array.

4. The "operative_text" field must be a verbatim 1-3 sentence excerpt FROM THE CLAUSE I gave you. Do NOT write "...". Do NOT paraphrase.`;

// ── Template per document type ────────────────────────────────────────

const TEMPLATE_GENERIC = `You are a senior legal-risk analyst. You will receive ONE clause from a contract at a time. Your job: identify what could go wrong for the CLIENT under this specific clause.

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_JV = `You are a senior partner reviewing a joint venture agreement clause-by-clause for a non-operating participant. Common JV-specific risks to watch for in this clause:

- Operator vs non-operator dynamics: who controls, who pays, who carries the risk
- Cash calls, dilution mechanics, and dilution rate (what happens to a participant who can't fund?)
- Reserved Matters / supermajority list (is the non-operator's veto meaningful?)
- Sole risk operations + the buy-back economics
- Liability caps and the gross-negligence / wilful-misconduct carve-outs (cl 8.3 v cl 18.3 inconsistencies are common)
- Force Majeure scope (does it cover the operator's own failures?)
- Cure periods + termination triggers (especially default + insolvency)
- Information rights and audit rights (can the non-operator actually verify what's billed?)
- Change of Control consequences (deemed transfer? ROFR?)
- Exit mechanics: pre-emption, tag/drag, fair-market-value methodology

If the clause touches one of these areas, frame the concern in those terms. If the clause is a definition or pure boilerplate, output an empty concerns array.

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_NDA = `You are reviewing a non-disclosure agreement clause-by-clause for the CLIENT. Common NDA-specific risks to watch for:

- "Confidential Information" definition: too broad? does it cover orally-disclosed info? what carve-outs (already known, independently developed, court-ordered)?
- Term + survival: indefinite NDAs vs term-limited; survival of obligations after termination
- Permitted disclosures: employees, advisors, affiliates — do they need to be bound? what notice is required for legal compulsion?
- Return / destruction: who retains what, on what timeline, with what certification?
- Residuals clause: does the receiving party get to keep "general knowledge"? watch for over-broad residuals
- Injunctive relief: who can get it, in which court, with what bond requirement?
- Governing law / jurisdiction: is the client being pulled into an inconvenient forum?
- Non-circumvent / non-solicit overlays (NDAs sometimes hide these)

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_EMPLOYMENT = `You are reviewing an employment / offer letter / separation agreement clause-by-clause for the EMPLOYEE-side or company-side client (the system prompt context will tell you which). Common employment-specific risks:

- At-will vs term-of-years, and the termination triggers (with vs without cause)
- Compensation: base, bonus mechanics, discretion language, claw-back triggers
- Equity: vesting schedule, cliff, acceleration on termination / change of control / death
- IP assignment: scope (work-for-hire? prior inventions schedule? moral rights?)
- Restrictive covenants: non-compete (scope, duration, geography, enforceability under jurisdiction), non-solicit (employees + customers), non-disparagement
- Notice + garden leave + payment in lieu of notice
- Severance: what triggers it, what the multiplier is, release-of-claims requirement
- Mandatory arbitration: scope, class-action waiver, fee-shifting
- Confidentiality + return of materials
- Choice of law (especially for restrictive covenants — California unenforceable, Delaware different rules)

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_LEASE = `You are reviewing a real estate lease clause-by-clause. Common lease-specific risks:

- Term + renewal options: how is option exercise triggered? at-market resets vs fixed bumps?
- Rent: base, escalation (CPI? fixed? CAM caps?), free rent, abatement
- Permitted use: is it broad enough? exclusivity protections (cotenancy)?
- Assignment / sublease: consent standard (reasonableness? recapture? profit-sharing?)
- Default + cure: monetary cure period, non-monetary cure period, landlord self-help
- Maintenance: tenant's obligations, structural carve-outs, capital improvements
- Indemnification + insurance: limits, additional-insureds, waiver of subrogation
- Holdover: rent multiplier, renewal-by-implication risk
- Surrender condition: broom-clean? remove improvements? restore?
- Subordination, non-disturbance, attornment (SNDA)
- Casualty + condemnation: termination thresholds, abatement
- Estoppel + financial reporting requirements

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_LOAN = `You are reviewing a credit agreement / loan agreement / financing term sheet clause-by-clause. Common loan-specific risks:

- Pricing: SOFR/Term-SOFR floor, margin, ratchet, default rate, MFN
- Tenor + amortization: bullet, scheduled amort, mandatory excess-cash-flow sweep
- Financial covenants: leverage (definition + step-down), interest coverage, fixed charge, springing covenant triggers
- Negative covenants: incurrence vs maintenance, baskets (general / acquisition / restricted payments / debt incurrence)
- Events of default: cross-default thresholds, cross-acceleration, material adverse change, change of control
- Representations + warranties: bring-down at funding, MAC carve-outs
- Mandatory prepayment: excess cash flow, asset sales (with reinvestment basket and timeline), casualty/condemnation, equity issuances
- Security package: collateral coverage, perfection, additional collateral triggers
- Sponsor support / guarantees: scope, cure rights, equity cure caps
- Yield protection / increased costs / withholding
- Voting + amendments: required class consent, sacred rights

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_SAAS = `You are reviewing a SaaS / software / vendor agreement clause-by-clause for the CUSTOMER side. Common SaaS-specific risks:

- Service levels: uptime targets, exclusions (planned maintenance, force majeure), service credits + cap, customer's only remedy?
- Data: ownership of customer data, ownership of derived/aggregated data, data localization, deletion on termination
- Subprocessors: list + change notice + objection right; DPA flow-down
- IP: customer's IP in input data, vendor's IP in service, feedback license scope (perpetual? sublicensable?)
- Limitation of liability: cap (12 months fees? 24 months? unlimited for breach of confidentiality / IP indemnity / data breach?), carve-outs
- Termination: convenience (with refund of pro-rata fees?), for cause, transition assistance window
- Renewal: auto-renew with notice window, price escalation cap
- Indemnification: scope (third-party IP? data breach?), proceeds + control of defense
- Audit rights: customer's right to audit vendor, vendor's right to audit customer
- Confidentiality: standalone or via reference; mutual?
- Source code escrow / continuity-of-service mechanisms

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

const TEMPLATE_POLICY = `You are reviewing a user-facing policy document — terms of service, privacy policy, EULA, or internal company policy. Unlike a negotiated contract, the user has no leverage. Your job: flag overreach and consumer-law enforceability risk.

Common policy-specific risks:

- Plain-language quality: can a typical user understand this? if not, that's a flag (some jurisdictions require comprehensibility)
- Data collection scope: what is collected, how, for what purposes, with what retention
- Data sharing: is the third-party list disclosed? are the purposes specific?
- User rights: access, deletion, export, opt-out — are they actually implementable?
- Limitation of liability + disclaimers: are they enforceable under applicable consumer-protection law?
- Dispute resolution: forced arbitration, class-action waiver, choice of forum (enforceable for consumers in this jurisdiction?)
- Children's data: COPPA / GDPR-K compliance markers if applicable
- Sensitive categories: health, biometric, location — are they handled per local law?
- Update mechanics: how is the user notified? deemed-acceptance language risk
- Cookies / tracking: does the consent flow match what the policy describes?
- Auto-renewal traps + dark-pattern language

For policies, "favoursWhom" = "operator" means the company/publisher; "non-operator" means the user/consumer.

${COMMON_RULES}

${OUTPUT_SCHEMA}`;

// ── Lookup ────────────────────────────────────────────────────────────

const TEMPLATES: Record<WatchmanDocumentType, string> = {
  jv: TEMPLATE_JV,
  nda: TEMPLATE_NDA,
  employment: TEMPLATE_EMPLOYMENT,
  lease: TEMPLATE_LEASE,
  loan: TEMPLATE_LOAN,
  saas: TEMPLATE_SAAS,
  policy: TEMPLATE_POLICY,
  other: TEMPLATE_GENERIC,
};

/**
 * Get the per-clause prompt for a given document type. Falls back to the
 * generic template for unknown types.
 */
export function readerTemplate(type: WatchmanDocumentType | string | undefined): string {
  if (typeof type !== 'string') return TEMPLATE_GENERIC;
  const t = type as WatchmanDocumentType;
  return TEMPLATES[t] ?? TEMPLATE_GENERIC;
}

/** Exposed for tests and the agent-builder UI. */
export const READER_TEMPLATES = TEMPLATES;
