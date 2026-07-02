/**
 * Dissent Mode — an independent panel of DIFFERENT models answers the same hard
 * interpretive question, and we surface where they DISAGREE rather than
 * reconciling it silently. The collective's value is the disagreement: a
 * split decision on a load-bearing clause is the most legally honest artifact
 * the system can produce — no single model can generate it.
 *
 * v1 dispatches directly to the provider clients (bypassing the global-provider
 * crossProviderChat) so a mixed panel is possible. The DEFAULT panel stays
 * within the active provider's family (no surprise cross-vendor egress); a
 * caller may pass an explicit cross-vendor panel. Residency is respected: a
 * local/EU engagement never gets a US (Anthropic) panelist by default.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ensureApiKey } from '../utils/ensure-api-key.js';
import { mistralChat } from '../providers/mistral.js';
import { localChat } from '../providers/local.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DISSENT');

export interface PanelMember {
  key: string;
  label: string;
  provider: 'anthropic' | 'mistral' | 'local';
  model: string;
}

export interface DissentVerdict {
  member: string;
  provider: string;
  /** One of the caller's options, or 'other' / 'error'. */
  label: string;
  /** The exact clause text the model relied on (provenance). */
  quote: string;
  rationale: string;
  confidence: string;
  error?: string;
}

export interface DissentResult {
  question: string;
  options: string[];
  verdicts: DissentVerdict[];
  /** True when answering panelists landed on more than one label. */
  dissent: boolean;
  /** label → member labels that chose it. */
  positions: Record<string, string[]>;
  summary: string;
}

/** Same-provider panel for the active provider (no surprise cross-vendor egress). */
export function defaultPanel(): PanelMember[] {
  if (config.provider === 'mistral') {
    return [
      { key: 'mistral-large', label: 'Mistral Large', provider: 'mistral', model: 'mistral-large-latest' },
      { key: 'mistral-medium', label: 'Mistral Medium', provider: 'mistral', model: 'mistral-medium-latest' },
    ];
  }
  if (config.provider === 'local') {
    return [{ key: 'local', label: config.local.defaultModel, provider: 'local', model: config.local.defaultModel }];
  }
  return [
    { key: 'opus', label: 'Opus 4.8', provider: 'anthropic', model: 'claude-opus-4-8' },
    { key: 'sonnet', label: 'Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5' },
  ];
}

async function callModel(m: PanelMember, system: string, user: string): Promise<string> {
  if (m.provider === 'anthropic') {
    ensureApiKey();
    const client = new Anthropic();
    // No temperature: Opus 4.x rejects it, and panel independence comes from
    // model diversity, not sampling noise.
    const res = await client.messages.create(
      { model: m.model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] },
      { timeout: 60_000, maxRetries: 1 },
    );
    let text = '';
    for (const b of res.content) if (b.type === 'text') text += b.text;
    return text;
  }
  if (m.provider === 'mistral') {
    const res = await mistralChat({ model: m.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens: 1024, timeoutMs: 60_000 });
    return res.message.content ?? '';
  }
  const res = await localChat({ model: m.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens: 1024, timeoutMs: 120_000 });
  return res.message.content ?? '';
}

/** Parse a panelist's JSON reply, mapping its label onto the caller's options. */
function parseVerdict(raw: string, options: string[]): { label: string; quote: string; rationale: string; confidence: string } {
  let obj: Record<string, unknown> = {};
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch { /* tolerate malformed output */ }

  const rawLabel = String(obj.label ?? '').trim().toLowerCase();
  const matched = options.find(o => o.toLowerCase() === rawLabel)
    ?? options.find(o => rawLabel.includes(o.toLowerCase()) || o.toLowerCase().includes(rawLabel));
  const conf = String(obj.confidence ?? '').toLowerCase();

  return {
    label: matched ?? 'other',
    quote: String(obj.quote ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    rationale: String(obj.rationale ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    confidence: ['high', 'medium', 'low'].includes(conf) ? conf : 'unknown',
  };
}

/**
 * Run the dissent panel. `callFn` is injectable for tests. Every panelist runs
 * concurrently and failures degrade to an 'error' verdict (never throw).
 */
export async function runDissent(opts: {
  question: string;
  options: string[];
  context: string;
  panel?: PanelMember[];
  callFn?: (m: PanelMember, system: string, user: string) => Promise<string>;
}): Promise<DissentResult> {
  const panel = opts.panel ?? defaultPanel();
  const call = opts.callFn ?? callModel;

  const system =
    'You are one member of an independent panel of legal AI models reviewing a document. '
    + 'Answer ONLY from the provided text. Choose exactly one label from OPTIONS. '
    + 'Reply as compact JSON and nothing else: '
    + '{"label":"<one option, verbatim>","quote":"<exact text you relied on, verbatim>","rationale":"<one sentence>","confidence":"high|medium|low"}.';
  const user = `QUESTION: ${opts.question}\nOPTIONS: ${opts.options.join(' | ')}\n\nTEXT:\n${opts.context}`;

  const verdicts: DissentVerdict[] = await Promise.all(panel.map(async (m) => {
    try {
      const raw = await call(m, system, user);
      return { member: m.label, provider: m.provider, ...parseVerdict(raw, opts.options) };
    } catch (err) {
      logger.warn('panel member failed', { member: m.key, err: (err as Error).message });
      return { member: m.label, provider: m.provider, label: 'error', quote: '', rationale: '', confidence: 'unknown', error: (err as Error).message };
    }
  }));

  const positions: Record<string, string[]> = {};
  for (const v of verdicts) {
    if (v.error) continue;
    (positions[v.label] ??= []).push(v.member);
  }
  const labels = Object.keys(positions);
  const answered = verdicts.filter(v => !v.error).length;
  const dissent = labels.length > 1;
  const summary = answered < 2
    ? `Panel inconclusive — ${answered} of ${verdicts.length} models answered.`
    : dissent
      ? `Split decision — ${labels.map(l => `${l} (${positions[l].join(', ')})`).join(' vs ')}.`
      : `All ${answered} models agree: ${labels[0]}.`;

  return { question: opts.question, options: opts.options, verdicts, dissent, positions, summary };
}
