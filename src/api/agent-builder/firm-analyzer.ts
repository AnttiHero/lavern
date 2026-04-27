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
  return `You are a firm analyst. Your job: given scraped content from a law/professional services firm's public website, identify the signature archetypes that firm needs to function and express them as agents in a multi-agent legal system (Lavern).

REQUIREMENTS
- Every agent must be grounded in specifics from the site. Cite a phrase, named partner, stated practice, or positioning line in the "seenOnSite" field. No generic archetypes.
- Diversity: the team should span lawyer / specialist / infrastructure categories, not five clones of the managing partner.
- Skills are on a 1–10 integer scale. Personality axes are 1–10 integers (low = left label, high = right label). Be deliberate — not every agent is a 10 at everything.
- Billing rates should track seniority: partner 1800–3500, counsel 1200–2000, senior-associate 900–1600, specialist 700–1400, associate 500–900, junior 200–500.
- costTier guidance: partner/counsel → opus, senior-associate/specialist → opus or sonnet, associate → sonnet, junior → haiku.
- Write taglines, strengths, limitations, and workStyle in confident editorial voice — short, declarative, no hype, no "passionate about". Think Cormac McCarthy meets an engagement letter.
- Category must be exactly one of: "lawyer", "specialist", "infrastructure", "orchestrator".
- Seniority must be exactly one of: "partner", "senior-associate", "associate", "junior", "specialist", "counsel".
- costTier must be exactly one of: "opus", "sonnet", "haiku".

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

Produce ${count} agents that collectively represent this firm's signature operating team. Focus on roles that actually show up in the scraped content (named partners, stated practice areas, stated values).

${hint ? `User hint: ${hint}` : ''}

Return a JSON object with fields: firmName, firmTagline, agents (array of ${count} agents).`;
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

  const validated = FirmAnalysisSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn('Schema validation failed', { issues: validated.error.issues.slice(0, 5) });
    throw new Error(`Firm analyzer output failed schema: ${validated.error.issues.map(i => i.path.join('.') + ' ' + i.message).slice(0, 3).join('; ')}`);
  }

  const costUsd = costUsdFromCall;
  opts.onLog?.(`Done — ${validated.data.agents.length} agents in $${costUsd.toFixed(3)}.`);

  return { analysis: validated.data, costUsd };
}
