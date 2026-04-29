/**
 * Firm Analyzer — Turn scraped firm-site content into N agent profiles.
 *
 * Single Opus 4.7 call with JSON-structured output, validated by Zod.
 * The prompt requires every profile to carry a "seenOnSite" citation
 * so hallucinated roles don't slip past.
 */

import { z } from 'zod';
import { crossProviderChat } from '../../providers/cross-provider-chat.js';
import { createLogger } from '../../utils/logger.js';
import type { ScrapeResult } from './firm-scraper.js';

const logger = createLogger('FIRM-ANALYZER');
const MODEL = 'claude-opus-4-7';

// ── Zod mirror of viz/src/types/agent-profile.ts::AgentProfile ─────────

const SkillRatingsSchema = z.object({
  precision:     z.number().int().min(1).max(10),
  creativity:    z.number().int().min(1).max(10),
  speed:         z.number().int().min(1).max(10),
  depth:         z.number().int().min(1).max(10),
  negotiation:   z.number().int().min(1).max(10),
  communication: z.number().int().min(1).max(10),
  research:      z.number().int().min(1).max(10),
  risk:          z.number().int().min(1).max(10),
});

const PersonalityAxisEnum = z.enum([
  'conservative-vs-creative',
  'thorough-vs-fast',
  'risk-averse-vs-tolerant',
  'formal-vs-approachable',
  'adversarial-vs-collaborative',
]);

const PersonalityProfileSchema = z.object({
  archetype: z.string().min(1).max(60),
  traits: z.object({
    'conservative-vs-creative':      z.number().int().min(1).max(10),
    'thorough-vs-fast':              z.number().int().min(1).max(10),
    'risk-averse-vs-tolerant':       z.number().int().min(1).max(10),
    'formal-vs-approachable':        z.number().int().min(1).max(10),
    'adversarial-vs-collaborative':  z.number().int().min(1).max(10),
  }),
  workStyle: z.string().min(1).max(280),
});

export const GeneratedAgentSchema = z.object({
  displayName:    z.string().min(1).max(60),
  tagline:        z.string().min(1).max(140),
  category:       z.enum(['lawyer', 'specialist', 'infrastructure', 'orchestrator']),
  seniority:      z.enum(['partner', 'senior-associate', 'associate', 'junior', 'specialist', 'counsel']),
  costTier:       z.enum(['opus', 'sonnet', 'haiku']),
  billingRateUsd: z.number().int().min(100).max(5000),
  skills:         SkillRatingsSchema,
  personality:    PersonalityProfileSchema,
  practiceAreas:  z.array(z.string().min(1).max(40)).min(1).max(4),
  strengths:      z.array(z.string().min(4).max(140)).min(2).max(4),
  limitations:    z.array(z.string().min(4).max(140)).min(1).max(3),
  /** One-line evidence from the site that this archetype is plausible. */
  seenOnSite:     z.string().min(4).max(240),
});

export type GeneratedAgent = z.infer<typeof GeneratedAgentSchema>;

const FirmAnalysisSchema = z.object({
  firmName: z.string().min(1).max(120),
  firmTagline: z.string().min(1).max(200),
  agents: z.array(GeneratedAgentSchema).min(1).max(10),
});

export type FirmAnalysis = z.infer<typeof FirmAnalysisSchema>;

export { PersonalityAxisEnum };

/**
 * Extract the first balanced {...} object from arbitrary text. Handles:
 * - Markdown fenced blocks (```json ... ```)
 * - Leading prose / chatter
 * - Quoted braces inside strings (skipped via a minimal string-aware scan)
 * Returns the substring, or null if none found.
 */
function extractFirstJsonObject(text: string): string | null {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const haystack = fenceMatch ? fenceMatch[1] : text;

  const start = haystack.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }
  return null;
}

// ── Prompt builders ────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a firm analyst. Your job: given scraped content from a law/professional services firm's public website, identify the actual people on that firm's team and express them as agents in a multi-agent legal system (Lavern).

REQUIREMENTS

1. **Named individuals only. No exceptions.**
   Every agent MUST correspond to a real, NAMED person identified from the scraped content (team page, partners list, leadership bios, "About us" mentions, named author of an insight article). The "displayName" field MUST be that person's actual name from the site (e.g. "Daniel Stranius, Managing Partner"). The "seenOnSite" field MUST cite the specific line of the website that NAMES THEM. A practice-area paragraph or services description is NOT acceptable evidence — only a line containing the person's name.

2. **Generic roles are forbidden.**
   Do NOT invent roles like "Tech & IP Counsel", "Knowledge Manager", "Operations Lead", or "Firm Engineer" unless those exact words appear in the scraped content as someone's actual title. If you cannot find a real named person for a slot, leave it empty. Returning fewer agents than the user asked for is correct and expected. Inventing personae is the worst possible outcome.

3. **The 'count' parameter is a maximum, not a target.**
   If the user requests 5 and the site names 3 partners, return 3. If the site names 7 partners, return 5 (the user's max). If the site names 0 partners — only practice-area copy — return zero agents and an empty array. Never pad.

4. Each named individual should be characterised through the lens of what the site says about them or their visible role. Personality, skills, and seniority should reflect what's evident from how they're described.

5. Skills are on a 1–10 integer scale. Personality axes are 1–10 integers (low = left label, high = right label). Be deliberate — not every agent is a 10 at everything.

5. Billing rates should track seniority: partner 1800–3500, counsel 1200–2000, senior-associate 900–1600, specialist 700–1400, associate 500–900, junior 200–500.

6. costTier guidance: partner/counsel → opus, senior-associate/specialist → opus or sonnet, associate → sonnet, junior → haiku.

7. Write taglines, strengths, limitations, and workStyle in confident editorial voice — short, declarative, no hype, no "passionate about". Think Cormac McCarthy meets an engagement letter.

8. Category must be exactly one of: "lawyer", "specialist", "infrastructure", "orchestrator".
9. Seniority must be exactly one of: "partner", "senior-associate", "associate", "junior", "specialist", "counsel".
10. costTier must be exactly one of: "opus", "sonnet", "haiku".

OUTPUT FORMAT
Return ONE JSON object. No markdown code fences, no commentary, no prose before or after. The object MUST match this exact shape (fieldNames are camelCase, not snake_case):

{
  "firmName": "Example & Partners",
  "firmTagline": "One-line positioning pulled from the site",
  "agents": [
    {
      "displayName": "Managing Partner",
      "tagline": "Runs the firm. Signs every material engagement.",
      "category": "lawyer",
      "seniority": "partner",
      "costTier": "opus",
      "billingRateUsd": 2500,
      "skills": {
        "precision": 9, "creativity": 7, "speed": 6, "depth": 9,
        "negotiation": 8, "communication": 8, "research": 7, "risk": 9
      },
      "personality": {
        "archetype": "The Gatekeeper",
        "traits": {
          "conservative-vs-creative": 4,
          "thorough-vs-fast": 3,
          "risk-averse-vs-tolerant": 2,
          "formal-vs-approachable": 2,
          "adversarial-vs-collaborative": 6
        },
        "workStyle": "Commands the room. Reads the deal three moves ahead."
      },
      "practiceAreas": ["firm strategy", "complex negotiations"],
      "strengths": [
        "Sees the whole board three moves ahead",
        "Unwavering on non-negotiable terms"
      ],
      "limitations": [
        "Slow to engage on low-stakes matters"
      ],
      "seenOnSite": "The site lists 'strategic advisory' as lead practice."
    }
  ]
}

Every agent object MUST include ALL of: displayName, tagline, category, seniority, costTier, billingRateUsd, skills (all 8 keys), personality (archetype + traits with all 5 keys + workStyle), practiceAreas, strengths, limitations, seenOnSite.`;
}

function buildUserPrompt(scraped: ScrapeResult, count: number, hint?: string): string {
  const MAX_PAGE_CHARS = 6_000;
  const pagesBlock = scraped.pages
    .map((p, i) =>
      `### Page ${i + 1}: ${p.url}
Title: ${p.title || '(none)'}
---
${p.text.slice(0, MAX_PAGE_CHARS)}${p.text.length > MAX_PAGE_CHARS ? ' [truncated]' : ''}`,
    )
    .join('\n\n');

  return `Firm website: ${scraped.rootUrl}
Site title: ${scraped.siteTitle || '(none)'}

## Scraped content

${pagesBlock}

## Task

Find the NAMED individuals on this firm's team. Then characterise up to ${count} of them as agents.

Process:
  1. Scan the scraped content above for proper names attached to titles. Look for "Managing Partner", "Partner", "Of Counsel", "Head of X", "CEO", "Chief X Officer", "Operations Manager", "Compliance Officer", and similar — paired with a person's first and last name.
  2. List every named person you found and the line that names them.
  3. Pick the most senior / most prominent up to ${count} of those people.
  4. Build an agent for each. The displayName MUST be their actual name; seenOnSite MUST be the line that names them.

If step 1 finds fewer than ${count} named people, return only the ones you found. Returning 1 agent is better than returning ${count} where ${count - 1} are real and 1 is invented. Returning 0 is acceptable if the site is purely marketing copy with no team identification.

${hint ? `User hint: ${hint}` : ''}

Return a JSON object with fields: firmName, firmTagline, agents (array — exactly the number of named people you actually found, up to ${count} max, can be 0 if the site has no named team members).`;
}

// ── Main entry ─────────────────────────────────────────────────────────

export interface AnalyzeFirmOptions {
  count: number;
  hint?: string;
  onLog?: (msg: string) => void;
}

export async function analyzeFirm(
  scraped: ScrapeResult,
  opts: AnalyzeFirmOptions,
): Promise<{ analysis: FirmAnalysis; costUsd: number }> {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(scraped, opts.count, opts.hint);

  opts.onLog?.(`Asking the model to design ${opts.count} agents…`);

  const { text: raw, cost: costUsdFromCall } = await crossProviderChat({
    system,
    user,
    tier: 'opus',
    maxTokens: 8192,
    timeoutMs: 240_000,
  });

  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    logger.warn('No JSON object in response', { head: raw.slice(0, 400) });
    throw new Error('Firm analyzer did not return a JSON object.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    logger.warn('JSON parse failed', { head: jsonText.slice(0, 400) });
    throw new Error(`Firm analyzer returned malformed JSON: ${(err as Error).message}`);
  }

  // ── Lenience pass ──────────────────────────────────────────────────
  // Models occasionally overshoot array caps (5 practice areas instead of 4)
  // or extend a string past its limit. Failing the whole batch over an
  // off-by-one is bad UX. Clip arrays to schema max and truncate strings
  // before validation. The schema still rejects type mismatches, missing
  // fields, and out-of-enum values — the things that actually matter.
  parsed = clipForSchema(parsed);

  const validated = FirmAnalysisSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn('Schema validation failed', { issues: validated.error.issues.slice(0, 5) });
    throw new Error(`Firm analyzer output failed schema: ${validated.error.issues.map(i => i.path.join('.') + ' ' + i.message).slice(0, 3).join('; ')}`);
  }

  // Server-side backstop: drop any agent whose displayName looks like a
  // generic role title rather than a real person's name. The model is
  // strongly instructed not to produce these, but Opus occasionally pads
  // when the site has fewer named individuals than requested.
  const realPeople = validated.data.agents.filter(isLikelyNamedIndividual);
  const removedCount = validated.data.agents.length - realPeople.length;
  if (removedCount > 0) {
    opts.onLog?.(`Filtered ${removedCount} generic role${removedCount === 1 ? '' : 's'} (only named individuals are kept).`);
  }

  const finalAnalysis: FirmAnalysis = {
    firmName: validated.data.firmName,
    firmTagline: validated.data.firmTagline,
    agents: realPeople,
  };

  const costUsd = costUsdFromCall;
  opts.onLog?.(`Done — ${finalAnalysis.agents.length} agent${finalAnalysis.agents.length === 1 ? '' : 's'} in $${costUsd.toFixed(3)}.`);

  return { analysis: finalAnalysis, costUsd };
}

/**
 * Heuristic: does this agent represent a real named person?
 *
 * A name typically:
 *   - Has 2+ capitalised words (e.g. "Daniel Stranius", "Aino Kimppa")
 *   - The first word starts with a capital and is 2-20 chars
 *   - The "seenOnSite" field also mentions the same name
 *
 * A generic role typically:
 *   - displayName is words like "Counsel", "Partner", "Manager" alone
 *   - Or a practice area: "Tech & IP Counsel", "Knowledge Manager"
 *   - seenOnSite cites a paragraph, not a personal mention
 */
function isLikelyNamedIndividual(agent: GeneratedAgent): boolean {
  const name = agent.displayName.trim();

  // Generic-role red flags: leading title-only words with no clear personal name
  const GENERIC_LEADING = /^(?:The\b|Tech\b|IP\b|Senior\b|Junior\b|Chief\b|Head of\b|Lead\b|Principal\b|Knowledge\b|Operations\b|Compliance\b|Risk\b|Practice\b|Deputy\b|Group\b|Firm\b|Strategy\b|Innovation\b|Digital\b|AI\b|Data\b|Tax\b|Finance\b|HR\b|Marketing\b|Business\b|Client\b)/i;
  // Bare titles with no personal name component
  const BARE_TITLE = /^(?:[A-Z][a-z]*\s*&?\s*)*(?:Counsel|Partner|Associate|Manager|Officer|Director|Specialist|Lawyer|Attorney|Engineer|Architect|Lead|Advisor)$/i;

  // Extract candidate person-name tokens: capitalised 2-20 char words that
  // are not entirely uppercase abbreviations (IP, AI, etc.)
  const personTokens = name
    .split(/[\s,]+/)
    .filter(w => /^[A-Z][a-zA-Z'`-]{1,19}$/.test(w))
    .filter(w => !/^[A-Z]+$/.test(w))               // skip ALLCAPS like "IP", "AI"
    .filter(w => !/^(The|And|Of|For|At|In|To|A|An)$/.test(w)); // skip filler

  // Need at least 2 person-name-shaped tokens for it to look like a name
  if (personTokens.length < 2) return false;
  if (BARE_TITLE.test(name) && personTokens.length < 2) return false;

  // If the first word is a generic title flag AND there's no clear given+surname,
  // probably not a person.
  if (GENERIC_LEADING.test(name) && personTokens.length < 2) return false;

  // The seenOnSite citation should also mention the name (or a portion of it).
  // Loose check: at least one personTokens entry should appear in seenOnSite.
  const cite = agent.seenOnSite.toLowerCase();
  const nameMentioned = personTokens.some(t => cite.includes(t.toLowerCase()));
  if (!nameMentioned) return false;

  return true;
}

// ── Schema lenience ────────────────────────────────────────────────────

/**
 * Clip the raw model output to the bounds the Zod schema enforces, so a
 * one-off "5 practice areas instead of 4" or a 145-char strength doesn't
 * fail the whole import. Only clips arrays (truncate from the end) and
 * strings (trim trailing chars). Does NOT add missing fields or change
 * types — the schema still catches real problems.
 */
function clipForSchema(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const root = input as Record<string, unknown>;

  // Top-level firmName / firmTagline string caps (120 / 200)
  if (typeof root.firmName === 'string' && root.firmName.length > 120) {
    root.firmName = root.firmName.slice(0, 120);
  }
  if (typeof root.firmTagline === 'string' && root.firmTagline.length > 200) {
    root.firmTagline = root.firmTagline.slice(0, 200);
  }

  // Per-agent caps
  if (!Array.isArray(root.agents)) return root;
  let agents = root.agents as unknown[];
  // Cap top-level agents at 10 (schema max)
  if (agents.length > 10) agents = agents.slice(0, 10);
  root.agents = agents;

  for (const agent of agents) {
    if (!agent || typeof agent !== 'object') continue;
    const a = agent as Record<string, unknown>;

    // String fields with max-length caps
    const stringCaps: Record<string, number> = {
      displayName: 60, tagline: 140, seenOnSite: 240,
    };
    for (const [field, cap] of Object.entries(stringCaps)) {
      if (typeof a[field] === 'string' && (a[field] as string).length > cap) {
        a[field] = (a[field] as string).slice(0, cap);
      }
    }

    // Array fields with max-length caps; also clip individual string elements
    const arrayCaps: Record<string, { max: number; itemMax?: number }> = {
      practiceAreas: { max: 4, itemMax: 40 },
      strengths:     { max: 4, itemMax: 140 },
      limitations:   { max: 3, itemMax: 140 },
    };
    for (const [field, { max, itemMax }] of Object.entries(arrayCaps)) {
      if (Array.isArray(a[field])) {
        let arr = a[field] as unknown[];
        if (itemMax) {
          arr = arr.map(v => typeof v === 'string' && v.length > itemMax ? v.slice(0, itemMax) : v);
        }
        if (arr.length > max) arr = arr.slice(0, max);
        a[field] = arr;
      }
    }

    // Personality archetype + workStyle string caps
    if (a.personality && typeof a.personality === 'object') {
      const p = a.personality as Record<string, unknown>;
      if (typeof p.archetype === 'string' && p.archetype.length > 60) {
        p.archetype = p.archetype.slice(0, 60);
      }
      if (typeof p.workStyle === 'string' && p.workStyle.length > 280) {
        p.workStyle = p.workStyle.slice(0, 280);
      }
    }
  }

  return root;
}

// ── Firm Soul Synthesis ────────────────────────────────────────────────

/**
 * From the same scraped content, produce a 4-sentence Lavern Soul — the
 * firm's voice, principles, what it refuses, what it loves.
 *
 * This is what plugs into the existing Soul feature on My Page. After a
 * firm is cloned, the user gets BOTH the team AND the firm's house voice,
 * ready to drop into any matter.
 *
 * Single Sonnet 4.5 call. ~5-10 sec. ~$0.02-0.05.
 */
export async function synthesiseFirmSoul(
  scraped: ScrapeResult,
): Promise<{ soul: string; costUsd: number }> {
  // Use only the homepage + first follow page to keep this cheap and tight.
  const MAX_CHARS = 8_000;
  const content = scraped.pages
    .slice(0, 2)
    .map((p, i) => `### Page ${i + 1}: ${p.title || p.url}\n${p.text}`)
    .join('\n\n')
    .slice(0, MAX_CHARS);

  const system = `You are a firm anthropologist. Given the public face of a law/professional services firm, you write a four-sentence "Soul" — the firm's house voice and principles — for a multi-agent legal system to inhabit.

Rules:
- EXACTLY four sentences. No more, no fewer. Each ends with a period.
- Voice: editorial, dignified, slightly Cormac McCarthy. Not breathless. No "passionate about". No marketing hype.
- Sentence 1: how this firm SOUNDS — register, formality, signature phrases.
- Sentence 2: what this firm BELIEVES — its operating principle.
- Sentence 3: what this firm REFUSES — the kind of work or behaviour that's beneath them.
- Sentence 4: what this firm LOVES — what makes them lean forward.
- No proper nouns from the firm (no firm name, no partner names). Speak ABOUT them, abstractly. The Soul is a behaviour profile, not a brand bio.

Output: a single JSON object: { "soul": "string" } — nothing else.`;

  const user = `Firm website content:\n\n${content}\n\nNow produce the Soul.`;

  const { text: raw, cost: costUsd } = await crossProviderChat({
    system,
    user,
    tier: 'sonnet',
    maxTokens: 600,
    timeoutMs: 60_000,
  });

  // Extract the soul string from JSON response
  let soul = '';
  try {
    const jsonText = extractFirstJsonObject(raw);
    if (jsonText) {
      const parsed = JSON.parse(jsonText) as { soul?: string };
      if (typeof parsed.soul === 'string') soul = parsed.soul.trim();
    }
  } catch {
    /* fall through */
  }

  // Fallback: if JSON parse failed, take the raw text as the soul (best effort)
  if (!soul && raw.trim()) {
    soul = raw.trim().replace(/^[\s"'`]*soul[\s"':]*\s*/i, '').replace(/^["']|["']$/g, '');
  }

  if (!soul) {
    throw new Error('Soul synthesis returned empty content');
  }

  return { soul, costUsd };
}
