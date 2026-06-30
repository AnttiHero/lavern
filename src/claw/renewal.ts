/**
 * Renewal Watcher — deterministic extraction of contract renewal/termination
 * deadlines from parsed text, plus a deadline checker the Clawern heartbeat
 * uses to alert before a contract auto-renews or a cancellation window closes.
 *
 * Deliberately CONSERVATIVE. It computes a concrete calendar deadline only when
 * the text supplies one without guessing — an explicit expiration or renewal
 * date. When it can't, it records what it found (auto-renewal flag, notice
 * period) at low confidence and does NOT fabricate a date: a wrong cancel-by
 * date is more dangerous than no date. Relative-only terms ("renews for
 * successive 1-year terms from the Effective Date") are intentionally NOT
 * resolved to a calendar date in v1.
 */

import type { DocumentRegistry } from './registry.js';
import type { RenewalTerms } from './types.js';

const MS_PER_DAY = 86_400_000;

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const WORD_NOTICE: Array<[RegExp, number]> = [
  [/thirty\s*(?:\(30\)\s*)?days/i, 30],
  [/forty[\s-]?five\s*(?:\(45\)\s*)?days/i, 45],
  [/sixty\s*(?:\(60\)\s*)?days/i, 60],
  [/ninety\s*(?:\(90\)\s*)?days/i, 90],
  [/one\s+hundred\s+(?:and\s+)?eighty\s*(?:\(180\)\s*)?days/i, 180],
];

/** Parse the first calendar date found in a text window into ISO yyyy-mm-dd. */
function parseDateToISO(s: string): string | undefined {
  // Build an ISO date only if the components round-trip — rejects rollover like
  // Feb 30 → Mar 2 or June 31, which would otherwise fabricate a wrong deadline.
  const valid = (year: number, mo: number, day: number): string | undefined => {
    const d = new Date(Date.UTC(year, mo, day));
    if (isNaN(d.getTime()) || d.getUTCFullYear() !== year || d.getUTCMonth() !== mo || d.getUTCDate() !== day) return undefined;
    return d.toISOString().slice(0, 10);
  };

  let m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/); // December 31, 2026
  if (m) { const mo = MONTHS[m[1].toLowerCase()]; if (mo != null) { const iso = valid(+m[3], mo, +m[2]); if (iso) return iso; } }
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?([A-Za-z]{3,9}),?\s+(\d{4})/); // 31 December 2026 / 31st day of December, 2026
  if (m) { const mo = MONTHS[m[2].toLowerCase()]; if (mo != null) { const iso = valid(+m[3], mo, +m[1]); if (iso) return iso; } }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/); // 2026-12-31
  if (m) return valid(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); // numeric slash date
  if (m) {
    const a = +m[1], b = +m[2];
    // Disambiguate m/d/y vs d/m/y. If a component is > 12 it must be the day;
    // if BOTH are <= 12 the date is genuinely ambiguous, so skip it rather than
    // guess — a wrong cancellation deadline is more dangerous than none.
    if (a > 12 && b <= 12) return valid(+m[3], b - 1, a); // d/m/y
    if (b > 12 && a <= 12) return valid(+m[3], a - 1, b); // m/d/y
    return undefined;                                     // ambiguous or invalid
  }
  return undefined;
}

/** Notice period in days, if stated near the word "notice". */
function parseNoticeDays(text: string): number | undefined {
  const numeric = text.match(/(\d{1,4})\s*days?[’'\s-]*(?:of\s+)?(?:at\s+least\s+)?(?:prior\s+)?(?:written\s+)?notice/i)
    // Require the day count to belong to the notice clause ("notice [period] [of]
    // N days"), not just any "N days" loosely near the word — avoids capturing a
    // cure/grace/payment period that happens to sit nearby.
    || text.match(/notice\s+(?:period\s+)?(?:of\s+)?(?:at\s+least\s+)?(\d{1,4})\s*days?/i);
  if (numeric) { const n = parseInt(numeric[1], 10); if (n > 0 && n <= 1000) return n; }
  for (const [re, val] of WORD_NOTICE) {
    if (re.test(text) && /notice/i.test(text)) return val;
  }
  return undefined;
}

/** Find the first occurrence of a keyword pattern that has a parseable date nearby. */
function findDatedClause(text: string, pattern: string): { date: string; clause: string } | undefined {
  const re = new RegExp(pattern, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    // Stop at a sentence boundary so a date from a LATER sentence can't be
    // mis-attached to this keyword. ("Dec." abbreviations don't trigger it —
    // the boundary requires a capital letter after the period.)
    const raw = text.slice(match.index, match.index + 220);
    const boundary = raw.search(/[.;]\s+[A-Z]/);
    const window = boundary > 0 ? raw.slice(0, boundary + 1) : raw.slice(0, 160);
    const iso = parseDateToISO(window);
    if (iso) return { date: iso, clause: window.replace(/\s+/g, ' ').trim().slice(0, 200) };
    if (re.lastIndex === match.index) re.lastIndex++; // guard against zero-width loops
  }
  return undefined;
}

const AUTO_RENEW =
  /automatically\s+renew|auto-?renew|evergreen|renew\s+for\s+successive|successive\s+(?:one|two|three|\d+)[\s-]*(?:year|month)|shall\s+(?:automatically\s+)?renew\s+unless|renews?\s+automatically/i;

/**
 * Extract renewal terms from contract text. Returns null if the text shows no
 * renewal/termination signal at all (so non-contract docs are skipped).
 */
export function extractRenewalTerms(text: string): RenewalTerms | null {
  if (!text || text.length < 50) return null;

  const autoRenew = AUTO_RENEW.test(text);
  const noticePeriodDays = parseNoticeDays(text);

  // Prefer an explicit renewal date; fall back to an explicit expiration date.
  const ren = findDatedClause(text, '(?:renewal\\s+date|renews?\\s+on|next\\s+renewal)');
  const exp = findDatedClause(text, '(?:expire[sd]?|expiration|terminat(?:es|ion)\\s+(?:on|date)|valid\\s+(?:until|through))');

  let anchorDate: string | undefined;
  let anchorKind: RenewalTerms['anchorKind'];
  let clause: string | undefined;
  if (ren) { anchorDate = ren.date; anchorKind = 'renewal'; clause = ren.clause; }
  else if (exp) { anchorDate = exp.date; anchorKind = 'expiration'; clause = exp.clause; }

  // No renewal signal whatsoever — not a renewal-bearing document.
  if (!autoRenew && noticePeriodDays === undefined && !anchorDate) return null;

  let cancelByDate: string | undefined;
  if (anchorDate && noticePeriodDays !== undefined) {
    const d = new Date(`${anchorDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - noticePeriodDays);
    cancelByDate = d.toISOString().slice(0, 10);
  }

  const confidence: RenewalTerms['confidence'] = anchorDate ? (cancelByDate ? 'high' : 'medium') : 'low';

  return { autoRenew, noticePeriodDays, anchorDate, anchorKind, cancelByDate, confidence, clause };
}

export interface RenewalAlert {
  hash: string;
  name: string;
  deadlineDate: string;
  daysLeft: number;
  kind: 'cancel-by' | 'renewal' | 'expiration';
  autoRenew: boolean;
  noticePeriodDays?: number;
  clause?: string;
  /** Auto-renewer whose last known anchor has passed — flagged for human review
   *  (the next window can't be computed without the term length). */
  needsReview?: boolean;
}

/**
 * Scan the registry for documents whose renewal/cancellation deadline falls
 * within `leadDays` of `now`. Only documents with a concrete anchor date are
 * considered (low-confidence relative-only terms produce no alert). A future
 * deadline in-window alerts normally; an AUTO-renewing contract whose anchor
 * has passed within the last ~year is flagged for human review (needsReview)
 * rather than silently dropped; older/non-renewing past deadlines are skipped.
 */
export function checkRenewalDeadlines(
  registry: DocumentRegistry,
  leadDays: number,
  now: Date = new Date(),
): RenewalAlert[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: RenewalAlert[] = [];

  for (const [hash, doc] of Object.entries(registry.getState().documents)) {
    const t = doc.renewalTerms;
    if (!t) continue;
    const deadlineDate = t.cancelByDate ?? t.anchorDate;
    if (!deadlineDate) continue;
    const dl = Date.parse(`${deadlineDate}T00:00:00Z`);
    if (isNaN(dl)) continue;
    const daysLeft = Math.ceil((dl - today) / MS_PER_DAY);
    const kind: RenewalAlert['kind'] = t.cancelByDate ? 'cancel-by' : (t.anchorKind === 'renewal' ? 'renewal' : 'expiration');
    if (daysLeft >= 0 && daysLeft <= leadDays) {
      out.push({ hash, name: doc.name, deadlineDate, daysLeft, kind, autoRenew: t.autoRenew, noticePeriodDays: t.noticePeriodDays, clause: t.clause });
    } else if (t.autoRenew && daysLeft < 0 && daysLeft > -370) {
      // Auto-renewing contract whose last known anchor has already passed: the
      // next window can't be computed reliably (term length isn't extracted), so
      // flag it for human review within ~a year rather than never alerting.
      out.push({ hash, name: doc.name, deadlineDate, daysLeft, kind, autoRenew: true, noticePeriodDays: t.noticePeriodDays, clause: t.clause, needsReview: true });
    }
  }

  out.sort((a, b) => a.daysLeft - b.daysLeft);
  return out;
}
