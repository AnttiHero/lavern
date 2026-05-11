/**
 * Agent Routes — Agent profiles, team presets, and team recommendations API.
 *
 * v8: Provides NBA2K-style agent cards for team selection.
 *   GET /api/agents/profiles        — All agent profiles with skill ratings
 *   GET /api/agents/profiles/:role  — Single agent detail
 *   GET /api/agents/presets         — Team preset configurations
 *
 * v9: Engagement configurator support.
 *   GET /api/agents/recommend       — Smart team recommendation based on intensity/budget/workflow
 */

import type { FastifyInstance } from 'fastify';
import { agentProfiles, teamPresets } from '../../agents/profiles.js';
import { workflowRegistry } from '../../workflows/registry.js';
import { INTENSITY_PROFILES, type IntensityLevel } from '../../types/engagement.js';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AGENTS');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const CLONE_SYSTEM_PROMPT = `You are a legal talent analyst. Given a person's professional profile text, extract their details and map them to an AI agent configuration for a legal AI platform.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "displayName": "First Last",
  "tagline": "Short punchy description of their legal specialty (max 60 chars)",
  "category": "lawyer" | "specialist" | "infrastructure" | "orchestrator",
  "seniority": "associate" | "senior-associate" | "partner" | "specialist" | "counsel",
  "archetype": "A dramatic archetype name like 'The Rainmaker' or 'The Tactician'",
  "workStyle": "First-person description of how they work (max 150 chars)",
  "practiceAreas": ["Area 1", "Area 2"],
  "strengths": ["Strength 1", "Strength 2"],
  "limitations": ["Limitation 1"],
  "skills": {
    "precision": 1-10,
    "creativity": 1-10,
    "speed": 1-10,
    "depth": 1-10,
    "negotiation": 1-10,
    "communication": 1-10,
    "research": 1-10,
    "risk": 1-10
  },
  "personality": {
    "conservative-vs-creative": 1-10,
    "thorough-vs-fast": 1-10,
    "risk-averse-vs-tolerant": 1-10,
    "formal-vs-approachable": 1-10,
    "adversarial-vs-collaborative": 1-10
  }
}

Calibration notes:
- category: 'lawyer' for attorneys/solicitors/barristers, 'specialist' for non-lawyer experts (finance, tech, IP), 'orchestrator' for senior partners who manage teams
- seniority: infer from years of experience and title
- skills: calibrate against top legal professionals (10 = world-class)
- personality axes are 1=left side, 10=right side
- If the text is not a professional profile, still do your best with whatever information is present`;

async function callAnthropicForClone(profileText: string): Promise<string> {
  const apiKey = config.anthropic.apiKey;
  if (!apiKey) throw new Error('API key not configured');

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.routerModel,
      max_tokens: 1024,
      system: CLONE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Here is the profile text:\n\n${profileText}` }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find(b => b.type === 'text');
  return textBlock?.text ?? '';
}

export function registerAgentRoutes(fastify: FastifyInstance): void {

  // ── GET /api/agents/profiles — All agent profiles ────────────────────
  fastify.get('/api/agents/profiles', async (request, reply) => {
    const query = request.query as { category?: string; practice_area?: string };

    let profiles = Object.values(agentProfiles);

    // Filter by category
    if (query.category && query.category !== 'all') {
      profiles = profiles.filter(p => p.category === query.category);
    }

    // Filter by practice area keyword
    if (query.practice_area) {
      const keyword = query.practice_area.toLowerCase();
      profiles = profiles.filter(p =>
        p.practiceAreas.some(pa => pa.toLowerCase().includes(keyword)) ||
        p.displayName.toLowerCase().includes(keyword)
      );
    }

    // Group by category
    const lawyers = profiles.filter(p => p.category === 'lawyer');
    const specialists = profiles.filter(p => p.category === 'specialist');
    const infrastructure = profiles.filter(p => p.category === 'infrastructure');
    const orchestrators = profiles.filter(p => p.category === 'orchestrator');

    return reply.send({
      profiles: profiles.map(p => ({
        role: p.role,
        displayName: p.displayName,
        tagline: p.tagline,
        category: p.category,
        seniority: p.seniority,
        costTier: p.costTier,
        billingRateUsd: p.billingRateUsd,
        skills: p.skills,
        personality: {
          archetype: p.personality.archetype,
          traits: p.personality.traits,
          workStyle: p.personality.workStyle,
        },
        practiceAreas: p.practiceAreas,
        strengths: p.strengths,
        limitations: p.limitations,
        optional: p.optional,
        defaultSelected: p.defaultSelected,
        ...(p.avatarExtra ? { avatarExtra: p.avatarExtra } : {}),
        ...(p.criticalRules?.length ? { criticalRules: p.criticalRules } : {}),
        ...(p.successMetrics?.length ? { successMetrics: p.successMetrics } : {}),
      })),
      summary: {
        total: profiles.length,
        lawyers: lawyers.length,
        specialists: specialists.length,
        infrastructure: infrastructure.length,
        orchestrators: orchestrators.length,
      },
    });
  });

  // ── GET /api/agents/profiles/:role — Single agent detail ─────────────
  fastify.get('/api/agents/profiles/:role', async (request, reply) => {
    const { role } = request.params as { role: string };
    const profile = agentProfiles[role];

    if (!profile) {
      return reply.status(404).send({
        error: `Agent not found: ${role}`,
        availableRoles: Object.keys(agentProfiles),
      });
    }

    return reply.send({
      profile: {
        role: profile.role,
        displayName: profile.displayName,
        tagline: profile.tagline,
        category: profile.category,
        seniority: profile.seniority,
        costTier: profile.costTier,
        billingRateUsd: profile.billingRateUsd,
        skills: profile.skills,
        personality: profile.personality,
        practiceAreas: profile.practiceAreas,
        strengths: profile.strengths,
        limitations: profile.limitations,
        optional: profile.optional,
        defaultSelected: profile.defaultSelected,
        ...(profile.criticalRules?.length ? { criticalRules: profile.criticalRules } : {}),
        ...(profile.successMetrics?.length ? { successMetrics: profile.successMetrics } : {}),
      },
    });
  });

  // ── GET /api/agents/presets — Team presets ────────────────────────────
  fastify.get('/api/agents/presets', async (_request, reply) => {
    return reply.send({
      presets: teamPresets.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        teamSize: p.roles.length,
        roles: p.roles,
        teamDetails: p.roles.map(role => {
          const profile = agentProfiles[role];
          return profile ? {
            role,
            displayName: profile.displayName,
            costTier: profile.costTier,
            billingRateUsd: profile.billingRateUsd,
            archetype: profile.personality.archetype,
          } : { role };
        }),
        estimatedCost: p.roles.reduce((sum, role) => {
          const profile = agentProfiles[role];
          return sum + (profile?.billingRateUsd ?? 0);
        }, 0),
      })),
      total: teamPresets.length,
    });
  });

  // ── GET /api/agents/recommend — Smart team recommendation ────────────
  //
  // v9: Returns a recommended team based on intensity, budget, and workflow.
  // Priority: required agents first → non-optional defaults → best value/cost.

  fastify.get('/api/agents/recommend', async (request, reply) => {
    const query = request.query as {
      intensity?: string;
      budget?: string;
      workflow?: string;
    };

    const intensity = (query.intensity ?? 'standard') as IntensityLevel;
    const parsedBudget = query.budget ? parseFloat(query.budget) : 10;
    const budget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 10;
    const workflowId = query.workflow;

    const profile = INTENSITY_PROFILES[intensity];
    if (!profile) {
      return reply.status(400).send({
        error: `Invalid intensity: ${intensity}. Must be one of: quick, standard, thorough, maximal`,
      });
    }

    const targetTeamSize = profile.suggestedTeamSize;
    const allProfiles = Object.values(agentProfiles);

    // 1. Start with required agents from the workflow template
    const requiredRoles = new Set<string>();
    if (workflowId) {
      const template = workflowRegistry.get(workflowId);
      if (template) {
        for (const role of template.requiredAgents) {
          if (agentProfiles[role]) {
            requiredRoles.add(role);
          }
        }
      }
    }

    // 2. Add non-optional (required) agents that are always needed
    for (const p of allProfiles) {
      if (!p.optional) {
        requiredRoles.add(p.role);
      }
    }

    // 3. Add defaultSelected agents (up to target team size)
    const defaultSelectedRoles = new Set<string>();
    for (const p of allProfiles) {
      if (p.defaultSelected && !requiredRoles.has(p.role)) {
        defaultSelectedRoles.add(p.role);
      }
    }

    // 4. Score remaining optional agents by value (skills avg / cost ratio)
    const scoredOptional = allProfiles
      .filter(p => p.optional && !requiredRoles.has(p.role) && !defaultSelectedRoles.has(p.role))
      .map(p => {
        const skillValues = Object.values(p.skills);
        const avgSkill = skillValues.reduce((a, b) => a + b, 0) / skillValues.length;
        const valueScore = avgSkill / Math.max(p.billingRateUsd, 1);
        return { role: p.role, billingRate: p.billingRateUsd, valueScore };
      })
      .sort((a, b) => b.valueScore - a.valueScore);

    // 5. Build team: required → defaults → best value, within budget
    const team: string[] = [...requiredRoles];
    let totalCost = team.reduce((sum, role) => sum + (agentProfiles[role]?.billingRateUsd ?? 0), 0);

    // Add defaults
    for (const role of defaultSelectedRoles) {
      if (team.length >= targetTeamSize) break;
      const rate = agentProfiles[role]?.billingRateUsd ?? 0;
      if (totalCost + rate <= budget) {
        team.push(role);
        totalCost += rate;
      }
    }

    // Fill remaining slots with best-value optional agents
    for (const agent of scoredOptional) {
      if (team.length >= targetTeamSize) break;
      if (totalCost + agent.billingRate <= budget) {
        team.push(agent.role);
        totalCost += agent.billingRate;
      }
    }

    return reply.send({
      recommendedRoles: team,
      teamSize: team.length,
      targetTeamSize,
      estimatedCost: totalCost,
      budget,
      intensity,
      workflow: workflowId ?? null,
      teamDetails: team.map(role => {
        const p = agentProfiles[role];
        return p ? {
          role,
          displayName: p.displayName,
          category: p.category,
          costTier: p.costTier,
          billingRateUsd: p.billingRateUsd,
          required: requiredRoles.has(role),
        } : { role, required: false };
      }),
    });
  });

  // ── POST /api/agents/clone — Clone an agent from profile text ────────
  //
  // Accepts any free-form text (LinkedIn about, CV, bio) and returns
  // a fully-populated agent builder state ready for the wizard.

  fastify.post('/api/agents/clone', {
    // Each clone call makes an expensive Claude API request — cap it tight per
    // user/IP so one bad actor can't drain budget. 5/min is plenty for a human
    // pasting a profile into the builder.
    config: { rateLimit: { max: 5, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const { profileText } = request.body as { profileText?: string };

    if (!profileText || typeof profileText !== 'string') {
      return reply.status(400).send({ error: 'profileText is required' });
    }

    const trimmed = profileText.trim();
    if (trimmed.length < 20) {
      return reply.status(400).send({ error: 'Profile text too short — paste more content' });
    }
    if (trimmed.length > 6000) {
      return reply.status(400).send({ error: 'Profile text too long — limit 6000 characters' });
    }

    try {
      const raw = await callAnthropicForClone(trimmed);

      // Strip markdown code fences if the model added them
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(clean);

      // Validate structural shape — guards against malformed LLM output passing
      // through to the frontend builder and causing downstream crashes.
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Model returned non-object');
      }
      if (typeof parsed.displayName !== 'string' || parsed.displayName.trim().length === 0) {
        throw new Error('Missing displayName');
      }
      if (!parsed.skills || typeof parsed.skills !== 'object' || Array.isArray(parsed.skills)) {
        throw new Error('Missing or malformed skills object');
      }
      if (!parsed.personality || typeof parsed.personality !== 'object' || Array.isArray(parsed.personality)) {
        throw new Error('Missing or malformed personality object');
      }
      // Verify at least the core personality axes are present (spot-check —
      // the builder can fall back to defaults for missing ones, but an empty
      // object indicates the model went off-spec).
      const requiredAxes = [
        'conservative-vs-creative',
        'thorough-vs-fast',
        'risk-averse-vs-tolerant',
      ];
      const axesPresent = requiredAxes.filter(k => typeof parsed.personality[k] === 'number').length;
      if (axesPresent === 0) {
        throw new Error('Personality has no recognized axes');
      }

      return reply.send(parsed);
    } catch (err) {
      logger.error('Clone failed', { error: err });
      return reply.status(500).send({ error: 'Failed to generate agent from profile' });
    }
  });
}
