/**
 * Claw Mode — Legal Document Anonymization.
 *
 * Replaces PII-like entities (party names, monetary amounts, dates,
 * addresses, emails, phone numbers) with stable placeholders such as
 * `[PARTY_1]` and `[AMOUNT_3]`. The mapping table is returned so the
 * process can be reversed after analysis.
 *
 * All logic is local — regex only, no external dependencies, no LLM calls.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type EntityType = 'party' | 'amount' | 'date' | 'address' | 'email' | 'phone';

export interface EntityMapping {
  /** Stable placeholder, e.g. "[PARTY_1]", "[AMOUNT_3]" */
  placeholder: string;
  /** Original matched text, e.g. "Acme Corp", "$5,000,000" */
  original: string;
  /** Entity category */
  type: EntityType;
}

export interface AnonymizationResult {
  /** Text with all entities replaced by placeholders */
  anonymizedText: string;
  /** Complete mapping table for reversal */
  mappings: EntityMapping[];
  /** Per-category counts of unique entities found */
  stats: {
    parties: number;
    amounts: number;
    dates: number;
    addresses: number;
    emails: number;
    phones: number;
  };
}

// ── Constants ────────────────────────────────────────────────────────────

/** Common legal terms that should never be treated as party names. */
const SKIP_TERMS = new Set([
  'agreement',
  'services',
  'confidential information',
  'effective date',
  'term',
  'party',
  'parties',
]);

/** Labels used in placeholder names, keyed by EntityType. */
const TYPE_LABELS: Record<EntityType, string> = {
  party: 'PARTY',
  amount: 'AMOUNT',
  date: 'DATE',
  address: 'ADDRESS',
  email: 'EMAIL',
  phone: 'PHONE',
};

// ── Regex patterns ───────────────────────────────────────────────────────

/** Email addresses. */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Phone numbers — US and international formats.
 * Matches: +1 (555) 123-4567, +44 20 7946 0958, 555-123-4567, (555) 123 4567
 */
const PHONE_RE = /(?:\+\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g;

/**
 * Monetary amounts — symbol-prefixed and code-prefixed.
 * Matches: $1,000,000  €5.000  £100,000  USD 50,000  EUR 5,000
 */
const MONEY_SYMBOL_RE = /[$€£]\s?\d{1,3}(?:[,.\s]\d{3})*(?:\.\d{1,2})?/g;
const MONEY_CODE_RE = /\b(?:USD|EUR|GBP|CHF|JPY|CAD|AUD)\s?\d{1,3}(?:[,.\s]\d{3})*(?:\.\d{1,2})?\b/g;

/**
 * Monetary amounts — written form.
 * Matches: "10 million dollars", "five hundred thousand USD"
 */
const MONEY_WRITTEN_RE =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion)(?:\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion))*\s+(?:dollars?|euros?|pounds?|USD|EUR|GBP)\b/gi;

/**
 * Dates — multiple formats.
 */
const DATE_LONG_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi;
const DATE_ORDINAL_RE =
  /\b\d{1,2}(?:st|nd|rd|th)\s+day\s+of\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}\b/gi;
const DATE_MONTH_YEAR_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi;
const DATE_SLASH_RE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const DATE_ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

// ── Internal helpers ─────────────────────────────────────────────────────

interface FoundEntity {
  start: number;
  end: number;
  text: string;
  type: EntityType;
}

/**
 * Collect all regex matches for a given pattern and entity type.
 */
function collectMatches(text: string, re: RegExp, type: EntityType): FoundEntity[] {
  const results: FoundEntity[] = [];
  // Reset lastIndex for global regexes
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ start: m.index, end: m.index + m[0].length, text: m[0], type });
  }
  return results;
}

/**
 * Build a case-insensitive regex that matches a literal term at word boundaries.
 */
function termRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

/**
 * Check whether a span overlaps any already-claimed range.
 */
function overlaps(span: { start: number; end: number }, claimed: { start: number; end: number }[]): boolean {
  return claimed.some((c) => span.start < c.end && span.end > c.start);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Anonymize a legal document by replacing PII-like entities with stable
 * placeholders.
 *
 * Extraction order: party names, monetary amounts, dates, emails, phones.
 * Within each category, longest matches are processed first so that
 * overlapping shorter matches are skipped.
 *
 * @param text          The document text to anonymize.
 * @param definedTerms  Optional array of legal defined terms to treat as
 *                      party names (e.g. "Licensee", "Acme Corp").
 * @returns             The anonymized text, mapping table, and stats.
 */
export function anonymize(text: string, definedTerms?: string[]): AnonymizationResult {
  // Canonical key → placeholder tracking
  const knownEntities = new Map<string, string>();
  const counters: Record<EntityType, number> = {
    party: 0,
    amount: 0,
    date: 0,
    address: 0,
    email: 0,
    phone: 0,
  };
  const mappings: EntityMapping[] = [];

  /**
   * Register an entity and return its placeholder. If the same canonical
   * form was seen before, re-use the existing placeholder.
   */
  function register(original: string, type: EntityType): string {
    const key = `${type}::${original.toLowerCase().trim()}`;
    const existing = knownEntities.get(key);
    if (existing) return existing;

    counters[type] += 1;
    const placeholder = `[${TYPE_LABELS[type]}_${counters[type]}]`;
    knownEntities.set(key, placeholder);
    mappings.push({ placeholder, original, type });
    return placeholder;
  }

  // ── Step 1: Collect all entity spans ───────────────────────────────

  const allEntities: FoundEntity[] = [];

  // 1a. Party names from definedTerms (longest first)
  if (definedTerms && definedTerms.length > 0) {
    const sorted = [...definedTerms].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      if (SKIP_TERMS.has(term.toLowerCase())) continue;
      const re = termRegex(term);
      allEntities.push(...collectMatches(text, re, 'party'));
    }
  }

  // 1b. Monetary amounts
  allEntities.push(...collectMatches(text, MONEY_WRITTEN_RE, 'amount'));
  allEntities.push(...collectMatches(text, MONEY_SYMBOL_RE, 'amount'));
  allEntities.push(...collectMatches(text, MONEY_CODE_RE, 'amount'));

  // 1c. Dates (longest patterns first)
  allEntities.push(...collectMatches(text, DATE_ORDINAL_RE, 'date'));
  allEntities.push(...collectMatches(text, DATE_LONG_RE, 'date'));
  allEntities.push(...collectMatches(text, DATE_MONTH_YEAR_RE, 'date'));
  allEntities.push(...collectMatches(text, DATE_SLASH_RE, 'date'));
  allEntities.push(...collectMatches(text, DATE_ISO_RE, 'date'));

  // 1d. Emails
  allEntities.push(...collectMatches(text, EMAIL_RE, 'email'));

  // 1e. Phones
  allEntities.push(...collectMatches(text, PHONE_RE, 'phone'));

  // ── Step 2: Deduplicate overlapping spans (longest first) ──────────

  // Sort by length descending, then by position ascending
  allEntities.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);

  const claimed: { start: number; end: number; placeholder: string }[] = [];

  for (const entity of allEntities) {
    if (overlaps(entity, claimed)) continue;
    const placeholder = register(entity.text, entity.type);
    claimed.push({ start: entity.start, end: entity.end, placeholder });
  }

  // ── Step 3: Build anonymized text (process replacements back-to-front) ─

  // Sort claimed spans by start position descending so index shifting is safe
  claimed.sort((a, b) => b.start - a.start);

  let result = text;
  for (const span of claimed) {
    result = result.slice(0, span.start) + span.placeholder + result.slice(span.end);
  }

  return {
    anonymizedText: result,
    mappings,
    stats: {
      parties: counters.party,
      amounts: counters.amount,
      dates: counters.date,
      addresses: counters.address,
      emails: counters.email,
      phones: counters.phone,
    },
  };
}

/**
 * Reverse anonymization by replacing placeholders with their original values.
 *
 * Processes placeholders in reverse order of length to avoid partial
 * replacements (e.g. `[PARTY_10]` before `[PARTY_1]`).
 *
 * @param text     The anonymized text.
 * @param mappings The mapping table from a previous `anonymize()` call.
 * @returns        The restored original text.
 */
export function deanonymize(text: string, mappings: EntityMapping[]): string {
  // Sort by placeholder length descending to avoid partial matches
  const sorted = [...mappings].sort((a, b) => b.placeholder.length - a.placeholder.length);

  let result = text;
  for (const { placeholder, original } of sorted) {
    // Replace all occurrences of this placeholder
    while (result.includes(placeholder)) {
      result = result.replace(placeholder, original);
    }
  }
  return result;
}

/**
 * Apply deanonymization to an array of findings, restoring original
 * entities in both `content` and `evidence` fields.
 *
 * @param findings Array of findings with content and optional evidence.
 * @param mappings The mapping table from a previous `anonymize()` call.
 * @returns        New array with placeholders replaced by original values.
 */
export function deanonymizeFindings(
  findings: Array<{ content: string; evidence?: string }>,
  mappings: EntityMapping[],
): Array<{ content: string; evidence?: string }> {
  return findings.map((finding) => ({
    content: deanonymize(finding.content, mappings),
    evidence: finding.evidence !== undefined ? deanonymize(finding.evidence, mappings) : undefined,
  }));
}
