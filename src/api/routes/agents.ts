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
    const budget = query.budget ? parseFloat(query.budget) : 10;
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
}
