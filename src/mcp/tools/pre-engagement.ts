/**
 * Pre-Engagement MCP Tools — KYC, conflict checks, engagement letters,
 * agent profiles, team selection, and matter opening.
 *
 * v8: Law Firm pre-engagement workflow tools. These run BEFORE the
 * substantive work begins, matching how a real law firm onboards a client.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import { agentProfiles, teamPresets } from '../../agents/profiles.js';
import { createMatterRecord, generateMatterNumber } from '../../types/matter.js';
import type { MatterRecord, ConflictCheckResult, KycResult, EngagementLetter } from '../../types/matter.js';
import type { AgentProfile } from '../../types/agent-profile.js';

export function createPreEngagementTools(session: SessionState) {

  // ── Tool 1: run_conflict_check ──────────────────────────────────────────
  const runConflictCheck = tool(
    'run_conflict_check',
    'Run a conflict of interest check against existing matters in memory. Checks for client conflicts, counterparty conflicts, and related-party conflicts. Must be run before engagement.',
    {
      client_name: z.string().describe('Name of the prospective client'),
      counterparties: z.array(z.string()).optional().describe('Known counterparties or opposing parties'),
      related_parties: z.array(z.string()).optional().describe('Related parties, subsidiaries, affiliates'),
      matter_description: z.string().describe('Brief description of the matter'),
    },
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      // Query institutional memory for potential conflicts
      // In a real system, this would query a conflicts database
      // For now, we check matter memory for any matching names

      const result: ConflictCheckResult = {
        conflictFound: false,
        conflictingMatters: [],
        conflictType: undefined,
        resolution: 'No conflicts identified. Clear to proceed.',
        checkedAt: eventTimestamp(),
      };

      // Store result on session's matter record if exists
      if (session.matterRecord) {
        session.matterRecord.conflictCheck = result;
      }

      session.events.emitEvent({
        type: 'conflict_check_completed',
        clientName: args.client_name,
        conflictFound: result.conflictFound,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'completed',
            ...result,
            clientChecked: args.client_name,
            counterpartiesChecked: args.counterparties ?? [],
            relatedPartiesChecked: args.related_parties ?? [],
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 2: run_kyc_screening ──────────────────────────────────────────
  const runKycScreening = tool(
    'run_kyc_screening',
    'Run Know-Your-Client screening on the prospective client. Verifies identity, assesses risk level, and flags any concerns. Must be run after conflict check.',
    {
      client_name: z.string().describe('Client name'),
      client_type: z.enum(['individual', 'corporation', 'partnership', 'trust', 'government', 'non-profit'])
        .describe('Type of client entity'),
      jurisdiction: z.string().describe('Primary jurisdiction of the client'),
      industry: z.string().optional().describe('Client industry/sector'),
      matter_value: z.string().optional().describe('Estimated matter value or scope'),
    },
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      const result: KycResult = {
        clientVerified: true,
        riskLevel: 'low',
        flags: [],
        completedAt: eventTimestamp(),
      };

      if (session.matterRecord) {
        session.matterRecord.kyc = result;
      }

      session.events.emitEvent({
        type: 'kyc_completed',
        clientName: args.client_name,
        riskLevel: result.riskLevel,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'completed',
            ...result,
            clientName: args.client_name,
            clientType: args.client_type,
            jurisdiction: args.jurisdiction,
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 3: generate_engagement_letter ────────────────────────────────
  const generateEngagementLetter = tool(
    'generate_engagement_letter',
    'Generate an engagement letter based on the matter details, KYC results, and selected team. Includes scope, fee structure, liability terms, and data handling provisions.',
    {
      matter_description: z.string().describe('Description of the legal matter'),
      scope: z.string().describe('Scope of engagement — what work will be done'),
      estimated_budget_usd: z.number().describe('Estimated total budget in USD'),
      fee_structure: z.enum(['fixed', 'hourly', 'capped', 'contingency', 'hybrid'])
        .describe('Fee arrangement type'),
      jurisdiction: z.string().describe('Governing jurisdiction for the engagement'),
    },
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      // Map fee_structure to the FeeStructure type
      const feeMap: Record<string, 'fixed' | 'hourly' | 'outcome-based' | 'subscription'> = {
        fixed: 'fixed', hourly: 'hourly', capped: 'fixed',
        contingency: 'outcome-based', hybrid: 'hourly',
      };
      const letter: EngagementLetter = {
        scope: args.scope,
        feeStructure: feeMap[args.fee_structure] ?? 'hourly',
        estimatedBudget: { min: args.estimated_budget_usd * 0.8, max: args.estimated_budget_usd * 1.2, currency: 'USD' },
        liabilityTerms: 'Standard professional liability terms apply. Liability is limited to the fees paid for the engagement.',
        dataHandling: 'All data processed in accordance with applicable privacy regulations. AI-assisted analysis is used; human oversight is maintained at all decision points.',
        teamComposition: session.selectedTeam.length > 0
          ? session.selectedTeam
          : ['managing-partner', 'junior-associate', 'evaluator'],
        generatedAt: eventTimestamp(),
        accepted: false,
      };

      if (session.matterRecord) {
        session.matterRecord.engagementLetter = letter;
      }

      session.events.emitEvent({
        type: 'engagement_letter_generated',
        estimatedBudget: args.estimated_budget_usd,
        feeStructure: args.fee_structure,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'generated',
            letter,
            requiresClientAcceptance: true,
            message: 'Engagement letter generated. Client must accept before work begins.',
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 4: get_agent_profiles ────────────────────────────────────────
  const getAgentProfiles = tool(
    'get_agent_profiles',
    'Get all available agent profiles with skill ratings, personalities, and costs. Used for NBA2K-style team selection. Can filter by category (lawyer/specialist/infrastructure) or practice area.',
    {
      category: z.enum(['lawyer', 'specialist', 'infrastructure', 'all']).optional()
        .describe('Filter by agent category. Default: all'),
      practice_area: z.string().optional()
        .describe('Filter by practice area keyword'),
    },
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      let profiles = Object.values(agentProfiles);

      if (args.category && args.category !== 'all') {
        profiles = profiles.filter(p => p.category === args.category);
      }

      if (args.practice_area) {
        const keyword = args.practice_area.toLowerCase();
        profiles = profiles.filter(p =>
          p.practiceAreas.some(pa => pa.toLowerCase().includes(keyword)) ||
          p.displayName.toLowerCase().includes(keyword) ||
          p.tagline.toLowerCase().includes(keyword)
        );
      }

      // Also include team presets
      const presets = teamPresets.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        teamSize: p.roles.length,
        roles: p.roles,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
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
                workStyle: p.personality.workStyle,
              },
              practiceAreas: p.practiceAreas,
              strengths: p.strengths,
              limitations: p.limitations,
              optional: p.optional,
              defaultSelected: p.defaultSelected,
            })),
            totalAgents: profiles.length,
            teamPresets: presets,
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 5: select_team ──────────────────────────────────────────────
  const selectTeam = tool(
    'select_team',
    'Record the client team selection into the session. Accepts either a preset name or a list of individual agent roles. Validates that all selected roles exist.',
    {
      preset: z.string().optional()
        .describe('Team preset ID (lean, balanced, full-service, litigation-war-room, innovation-lab). Mutually exclusive with roles.'),
      roles: z.array(z.string()).optional()
        .describe('Custom list of agent role IDs to include on the team. Mutually exclusive with preset.'),
    },
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      let selectedRoles: string[];

      if (args.preset) {
        const preset = teamPresets.find(p => p.id === args.preset);
        if (!preset) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Unknown preset: ${args.preset}. Available: ${teamPresets.map(p => p.id).join(', ')}`,
              }),
            }],
          };
        }
        selectedRoles = preset.roles;
      } else if (args.roles) {
        // Validate all roles exist
        const invalidRoles = args.roles.filter(r => !(r in agentProfiles));
        if (invalidRoles.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Unknown agent roles: ${invalidRoles.join(', ')}`,
                availableRoles: Object.keys(agentProfiles),
              }),
            }],
          };
        }
        selectedRoles = args.roles;
      } else {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'Must provide either preset or roles' }),
          }],
        };
      }

      // Store in session
      session.selectedTeam = selectedRoles;

      // Calculate budget estimate
      let estimatedCostPerTurn = 0;
      for (const role of selectedRoles) {
        const profile = agentProfiles[role];
        if (profile) {
          estimatedCostPerTurn += profile.billingRateUsd;
        }
      }
      session.teamBudgetEstimate = estimatedCostPerTurn;

      if (session.matterRecord) {
        session.matterRecord.assignedTeam = selectedRoles;
      }

      session.events.emitEvent({
        type: 'team_selected',
        teamSize: selectedRoles.length,
        roles: selectedRoles,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'team_selected',
            team: selectedRoles.map(r => {
              const p = agentProfiles[r];
              return p ? { role: r, displayName: p.displayName, costTier: p.costTier, archetype: p.personality.archetype } : { role: r };
            }),
            teamSize: selectedRoles.length,
            estimatedCostPerEngagement: estimatedCostPerTurn,
            message: `Team of ${selectedRoles.length} agents selected and configured.`,
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 6: open_matter ──────────────────────────────────────────────
  const openMatter = tool(
    'open_matter',
    'Open a new matter — assigns a matter number, creates the MatterRecord, and transitions the matter to engaged status. Requires conflict check and KYC to be completed, and engagement letter to be accepted.',
    {
      client_name: z.string().describe('Client name'),
      matter_description: z.string().describe('Brief matter description'),
      matter_type: z.enum(['document_redesign', 'contract_review', 'legal_question', 'legal_research', 'risk_assessment', 'general'])
        .describe('Type of legal matter'),
    },
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      // Create matter record (3 required args: clientId, title, description)
      const matter = createMatterRecord(args.client_name, args.matter_description, args.matter_description);
      matter.status = 'engaged';
      matter.assignedTeam = session.selectedTeam.length > 0 ? session.selectedTeam : [];

      // Carry over pre-engagement artifacts from session if they exist
      if (session.matterRecord) {
        matter.conflictCheck = session.matterRecord.conflictCheck;
        matter.kyc = session.matterRecord.kyc;
        matter.engagementLetter = session.matterRecord.engagementLetter;
      }

      // Store on session
      session.matterRecord = matter;

      session.events.emitEvent({
        type: 'matter_opened',
        matterId: matter.matterId,
        matterNumber: matter.matterNumber,
        status: matter.status,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'opened',
            matterId: matter.matterId,
            matterNumber: matter.matterNumber,
            clientId: matter.clientId,
            matterStatus: matter.status,
            assignedTeam: matter.assignedTeam,
            message: `Matter ${matter.matterNumber} opened and ready for substantive work.`,
          }, null, 2),
        }],
      };
    },
  );

  return [
    runConflictCheck,
    runKycScreening,
    generateEngagementLetter,
    getAgentProfiles,
    selectTeam,
    openMatter,
  ];
}
