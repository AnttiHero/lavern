/**
 * Hivemind — quorum verification (Layer 1).
 *
 * A CRITICAL finding shipped on one model's say-so is a guess wearing a badge.
 * Every CRITICAL verification finding is put to an independent panel of
 * different models: does the cited evidence support the finding as stated?
 *
 * Fail-safe direction: the outcome is an ANNOTATION — severity is never
 * silently lowered. Hiding a true CRITICAL is worse than double-checking a
 * false one, so an unconfirmed finding stays CRITICAL and is flagged for the
 * reader instead of being dropped.
 */

import { runDissent } from './dissent.js';
import type { DissentVerdict, PanelMember } from './dissent.js';

export type QuorumOutcome = 'confirmed' | 'unconfirmed' | 'inconclusive';

export interface QuorumRecord {
  /** Verification pass the finding came from (accuracy, risk, ...). */
  pass: string;
  finding: string;
  location: string;
  verdicts: DissentVerdict[];
  /** confirmed = majority of answering panelists say the evidence supports it. */
  outcome: QuorumOutcome;
  /** e.g. "2/2 supported" — display string for the report + tab. */
  votes: string;
  checkedAt: string;
}

const QUORUM_OPTIONS = ['supported', 'not supported', 'overstated'];

/**
 * Put one CRITICAL finding to the panel. Reuses the dissent machinery: each
 * panelist answers independently from the finding + its cited evidence only.
 * Never throws on panel failure — degrades to 'inconclusive'.
 */
export async function runQuorumCheck(opts: {
  pass: string;
  description: string;
  evidence: string;
  location: string;
  panel?: PanelMember[];
  callFn?: (m: PanelMember, system: string, user: string) => Promise<string>;
}): Promise<QuorumRecord> {
  const question = 'Does the cited evidence support this CRITICAL finding as stated?';
  const context =
    `FINDING (claimed CRITICAL): ${opts.description}\n`
    + `LOCATION: ${opts.location}\n`
    + `CITED EVIDENCE:\n${opts.evidence}`;

  const res = await runDissent({
    question,
    options: QUORUM_OPTIONS,
    context,
    panel: opts.panel,
    callFn: opts.callFn,
  });

  const answered = res.verdicts.filter(v => !v.error);
  const supporters = answered.filter(v => v.label === 'supported').length;
  // Strict majority of ANSWERING panelists. Fewer than 2 answers proves
  // nothing either way — inconclusive, and the finding ships unannotated
  // rather than falsely blessed or falsely doubted.
  const outcome: QuorumOutcome = answered.length < 2
    ? 'inconclusive'
    : supporters * 2 > answered.length ? 'confirmed' : 'unconfirmed';

  return {
    pass: opts.pass,
    finding: opts.description.slice(0, 300),
    location: opts.location.slice(0, 200),
    verdicts: res.verdicts,
    outcome,
    votes: `${supporters}/${answered.length} supported`,
    checkedAt: new Date().toISOString(),
  };
}
