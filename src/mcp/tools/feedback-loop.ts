/**
 * Feedback Loop MCP Tool — The learning engine of The Shem.
 *
 * v4: Takes a report card and updates memory effectiveness based on outcomes.
 * Records anti-patterns from failures. Auto-deprecates consistently poor precedents.
 *
 * Factory: createFeedbackLoopTools(session) → 4 MCP tools:
 * 1. run_feedback_loop — Main post-session update
 * 2. update_precedent_effectiveness — Targeted single-precedent update
 * 3. record_anti_pattern — Record what NOT to do
 * 4. query_anti_patterns — Search anti-patterns
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'node:path';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import type { AntiPattern } from '../../types/report-card.js';
import type { Severity } from '../../types/index.js';
import {
  type InstitutionalMemoryEntry,
  type PrecedentEntry,
  migrateMemory,
  migratePrecedent,
} from './memory-system.js';
import { readJsonFile, writeJsonFileAtomic } from '../../utils/fs-helpers.js';

// ── Constants ────────────────────────────────────────────────────────────

const EXPONENTIAL_WEIGHT = 0.3; // How much new outcomes weigh vs. history
const AUTO_DEPRECATE_THRESHOLD = 3; // Consecutive poor outcomes before auto-deprecation
const POOR_OUTCOME_THRESHOLD = 0.3; // Score below this is "poor"

// ── Factory ──────────────────────────────────────────────────────────────

export function createFeedbackLoopTools(session: SessionState) {
  const memoryDir = session.memoryDir;

  const runFeedbackLoop = tool(
    'run_feedback_loop',
    'Run the post-session feedback loop. Updates precedent and memory effectiveness based on the session report card. Records anti-patterns from regressions and failed verifications. Auto-deprecates consistently poor precedents. Call this after compile_report_card.',
    {},
    async () => {
      const reportCard = session.reportCard;
      if (!reportCard) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️ No report card found. Run compile_report_card first before running the feedback loop.',
          }],
        };
      }

      let precedentsUpdated = 0;
      let memoriesUpdated = 0;
      let antiPatternsRecorded = 0;
      let precedentsDeprecated = 0;

      // ── 1. Update precedent effectiveness ──
      const precedentsPath = path.join(memoryDir, 'precedents.json');
      const rawPrecedents = readJsonFile<Partial<PrecedentEntry>[]>(precedentsPath, []);
      const precedents = rawPrecedents.map(migratePrecedent);

      for (const precedent of precedents) {
        const wasQueried = reportCard.precedents.queried.includes(precedent.id);
        const wasApplied = reportCard.precedents.applied.includes(precedent.id);

        if (wasQueried) precedent.timesQueried++;
        if (wasApplied) {
          precedent.timesUsed++;

          // Calculate outcome score based on overall improvement + verification
          const outcomeScore = Math.max(0, Math.min(1,
            (reportCard.scores.overallImprovement / 2 + 0.5) * // Normalize improvement to 0-1
            (reportCard.verification.overallPassRate || 0.5)     // Weight by verification pass rate
          ));

          const outcome = {
            sessionId: reportCard.sessionId,
            timestamp: new Date().toISOString(),
            applied: true,
            scoreDelta: reportCard.scores.overallImprovement,
            verificationPassed: reportCard.verification.overallPassRate >= 0.7,
            notes: `Overall improvement: ${reportCard.scores.overallImprovement.toFixed(2)}`,
          };
          precedent.outcomes.push(outcome);

          // Exponential weighted moving average
          precedent.effectivenessScore =
            precedent.effectivenessScore * (1 - EXPONENTIAL_WEIGHT) +
            outcomeScore * EXPONENTIAL_WEIGHT;
          precedent.effectivenessScore = Math.round(precedent.effectivenessScore * 1000) / 1000;

          precedentsUpdated++;

          // Check for auto-deprecation
          const recentOutcomes = precedent.outcomes.slice(-AUTO_DEPRECATE_THRESHOLD);
          if (
            recentOutcomes.length >= AUTO_DEPRECATE_THRESHOLD &&
            recentOutcomes.every(o => {
              const score = (o.scoreDelta / 2 + 0.5) * (o.verificationPassed ? 1.0 : 0.5);
              return score < POOR_OUTCOME_THRESHOLD;
            }) &&
            !precedent.deprecated
          ) {
            precedent.deprecated = true;
            precedent.deprecationReason = `Auto-deprecated: ${AUTO_DEPRECATE_THRESHOLD} consecutive poor outcomes (effectiveness: ${precedent.effectivenessScore.toFixed(3)})`;
            precedentsDeprecated++;
          }
        }
      }

      writeJsonFileAtomic(precedentsPath, precedents);

      // ── 2. Update institutional memory effectiveness ──
      const memoryPath = path.join(memoryDir, 'institutional.json');
      const rawMemories = readJsonFile<Partial<InstitutionalMemoryEntry>[]>(memoryPath, []);
      const memories = rawMemories.map(migrateMemory);

      for (const memory of memories) {
        // Only update memories that were actually queried in THIS session
        if (session.queriedMemoryIds.has(memory.id) && !memory.usedInSessions.includes(reportCard.sessionId)) {
          memory.usedInSessions.push(reportCard.sessionId);
          memory.lastUsedAt = new Date().toISOString();

          const outcomeScore = Math.max(0, Math.min(1,
            reportCard.verification.overallPassRate * 0.6 +
            Math.min(1, reportCard.scores.overallImprovement / 2 + 0.5) * 0.4
          ));

          memory.outcomes.push({
            sessionId: reportCard.sessionId,
            timestamp: new Date().toISOString(),
            applied: true,
            outcomeScore,
          });

          memory.effectiveness =
            memory.effectiveness * (1 - EXPONENTIAL_WEIGHT) +
            outcomeScore * EXPONENTIAL_WEIGHT;
          memory.effectiveness = Math.round(memory.effectiveness * 1000) / 1000;

          memoriesUpdated++;
        }
      }

      writeJsonFileAtomic(memoryPath, memories);

      // ── 3. Record anti-patterns from failures ──
      const antiPatternsPath = path.join(memoryDir, 'anti-patterns.json');
      const antiPatterns = readJsonFile<AntiPattern[]>(antiPatternsPath, []);

      // Anti-pattern from score regressions
      for (const delta of reportCard.scores.deltas) {
        if (delta.regressed) {
          const existing = antiPatterns.find(
            ap => ap.documentType === reportCard.documentType &&
              ap.description.includes(delta.dimension) &&
              ap.category === 'regression'
          );

          if (existing) {
            existing.occurrences++;
            existing.lastSeenAt = new Date().toISOString();
          } else {
            antiPatterns.push({
              id: `AP-${String(antiPatterns.length + 1).padStart(3, '0')}`,
              documentType: reportCard.documentType,
              jurisdiction: reportCard.jurisdiction,
              description: `Score regression in ${delta.dimension}: ${delta.before.toFixed(1)} → ${delta.after.toFixed(1)} (Δ${delta.delta.toFixed(1)})`,
              source: reportCard.sessionId,
              category: 'regression',
              severity: Math.abs(delta.delta) > 1.0 ? 'RED' : 'YELLOW',
              addedAt: new Date().toISOString(),
              occurrences: 1,
              lastSeenAt: new Date().toISOString(),
            });
            antiPatternsRecorded++;
          }
        }
      }

      // Anti-pattern from failed verifications
      if (reportCard.verification.overallPassRate < 0.7) {
        const existing = antiPatterns.find(
          ap => ap.documentType === reportCard.documentType &&
            ap.category === 'verification_failure'
        );

        if (existing) {
          existing.occurrences++;
          existing.lastSeenAt = new Date().toISOString();
        } else {
          antiPatterns.push({
            id: `AP-${String(antiPatterns.length + 1).padStart(3, '0')}`,
            documentType: reportCard.documentType,
            jurisdiction: reportCard.jurisdiction,
            description: `Low verification pass rate: ${(reportCard.verification.overallPassRate * 100).toFixed(0)}%`,
            source: reportCard.sessionId,
            category: 'verification_failure',
            severity: reportCard.verification.overallPassRate < 0.5 ? 'RED' : 'YELLOW',
            addedAt: new Date().toISOString(),
            occurrences: 1,
            lastSeenAt: new Date().toISOString(),
          });
          antiPatternsRecorded++;
        }
      }

      writeJsonFileAtomic(antiPatternsPath, antiPatterns);

      // ── Emit event ──
      session.events.emitEvent({
        type: 'feedback_loop_completed',
        sessionId: session.id,
        precedentsUpdated,
        antiPatternsRecorded,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Feedback Loop Complete — ${session.id}

### Updates
- **Precedents updated**: ${precedentsUpdated} (effectiveness scores recalculated)
- **Memories updated**: ${memoriesUpdated} (institutional memory effectiveness)
- **Anti-patterns recorded**: ${antiPatternsRecorded}
- **Precedents auto-deprecated**: ${precedentsDeprecated}

${precedentsDeprecated > 0 ? `⚠️ ${precedentsDeprecated} precedent(s) auto-deprecated due to ${AUTO_DEPRECATE_THRESHOLD}+ consecutive poor outcomes.` : ''}
${antiPatternsRecorded > 0 ? `📝 ${antiPatternsRecorded} new anti-pattern(s) recorded from session failures.` : '✅ No new anti-patterns — session quality is good.'}`,
        }],
      };
    }
  );

  const updatePrecedentEffectiveness = tool(
    'update_precedent_effectiveness',
    'Manually update a single precedent\'s effectiveness score. Use for human overrides when the feedback loop\'s automatic scoring doesn\'t reflect reality.',
    {
      precedent_id: z.string().describe('Precedent ID (e.g., "P-001")'),
      effectiveness_score: z.number().min(0).max(1).describe('New effectiveness score (0-1)'),
      notes: z.string().optional().describe('Why the score is being overridden'),
      undeprecate: z.boolean().optional().describe('If true, removes deprecated status'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'precedents.json');
      const rawPrecedents = readJsonFile<Partial<PrecedentEntry>[]>(filePath, []);
      const precedents = rawPrecedents.map(migratePrecedent);

      const precedent = precedents.find(p => p.id === args.precedent_id);
      if (!precedent) {
        return {
          content: [{
            type: 'text' as const,
            text: `Precedent ${args.precedent_id} not found.`,
          }],
        };
      }

      const oldScore = precedent.effectivenessScore;
      precedent.effectivenessScore = args.effectiveness_score;

      if (args.undeprecate && precedent.deprecated) {
        precedent.deprecated = false;
        precedent.deprecationReason = undefined;
      }

      writeJsonFileAtomic(filePath, precedents);

      return {
        content: [{
          type: 'text' as const,
          text: `Updated ${args.precedent_id}: effectiveness ${oldScore.toFixed(3)} → ${args.effectiveness_score.toFixed(3)}${args.notes ? ` (${args.notes})` : ''}${args.undeprecate ? ' [un-deprecated]' : ''}`,
        }],
      };
    }
  );

  const recordAntiPattern = tool(
    'record_anti_pattern',
    'Record an anti-pattern — something that should NOT be done in future sessions.',
    {
      document_type: z.string().describe('Document type this applies to'),
      jurisdiction: z.string().describe('Jurisdiction'),
      description: z.string().describe('What went wrong and why'),
      category: z.enum(['regression', 'verification_failure', 'gate_rejection', 'performance', 'other'])
        .describe('Category of the anti-pattern'),
      severity: z.enum(['RED', 'YELLOW', 'GREEN']).describe('Severity level'),
      related_precedent_ids: z.array(z.string()).optional().describe('Related precedent IDs'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'anti-patterns.json');
      const antiPatterns = readJsonFile<AntiPattern[]>(filePath, []);

      const entry: AntiPattern = {
        id: `AP-${String(antiPatterns.length + 1).padStart(3, '0')}`,
        documentType: args.document_type,
        jurisdiction: args.jurisdiction,
        description: args.description,
        source: session.id,
        category: args.category,
        severity: args.severity as Severity,
        addedAt: new Date().toISOString(),
        occurrences: 1,
        lastSeenAt: new Date().toISOString(),
        relatedPrecedentIds: args.related_precedent_ids,
      };
      antiPatterns.push(entry);
      writeJsonFileAtomic(filePath, antiPatterns);

      session.events.emitEvent({
        type: 'memory_saved',
        memoryType: 'anti-pattern',
        key: `${args.category}:${entry.id}`,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Recorded anti-pattern: ${entry.id} [${args.category}/${args.severity}] — "${args.description.slice(0, 80)}..."`,
        }],
      };
    }
  );

  const queryAntiPatterns = tool(
    'query_anti_patterns',
    'Search for known anti-patterns. Use at session start to load what NOT to do for a given document type.',
    {
      document_type: z.string().optional().describe('Filter by document type'),
      jurisdiction: z.string().optional().describe('Filter by jurisdiction'),
      category: z.enum(['regression', 'verification_failure', 'gate_rejection', 'performance', 'other', 'all']).optional()
        .describe('Filter by category'),
      keyword: z.string().optional().describe('Search keyword'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'anti-patterns.json');
      let antiPatterns = readJsonFile<AntiPattern[]>(filePath, []);

      if (args.document_type) {
        antiPatterns = antiPatterns.filter(ap => ap.documentType === args.document_type);
      }
      if (args.jurisdiction) {
        antiPatterns = antiPatterns.filter(ap => ap.jurisdiction === args.jurisdiction);
      }
      if (args.category && args.category !== 'all') {
        antiPatterns = antiPatterns.filter(ap => ap.category === args.category);
      }
      if (args.keyword) {
        const kw = args.keyword.toLowerCase();
        antiPatterns = antiPatterns.filter(ap => ap.description.toLowerCase().includes(kw));
      }

      // Sort by severity (RED first), then by occurrences
      antiPatterns.sort((a, b) => {
        const severityOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
        const sDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
        if (sDiff !== 0) return sDiff;
        return b.occurrences - a.occurrences;
      });

      if (antiPatterns.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No anti-patterns found matching criteria. Proceed without anti-pattern guidance.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Anti-Patterns (${antiPatterns.length} found)

${antiPatterns.map(ap =>
  `### ${ap.id} [${ap.severity}] ${ap.category}
${ap.description}
_Occurrences: ${ap.occurrences} | Last seen: ${ap.lastSeenAt} | Source: ${ap.source}_${
  ap.relatedPrecedentIds?.length ? `\nRelated precedents: ${ap.relatedPrecedentIds.join(', ')}` : ''}`
).join('\n\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [
    runFeedbackLoop,
    updatePrecedentEffectiveness,
    recordAntiPattern,
    queryAntiPatterns,
  ];
}
