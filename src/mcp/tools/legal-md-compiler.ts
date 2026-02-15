/**
 * LEGAL.md Compiler MCP Tool — Human-readable institutional knowledge.
 *
 * v4: Compiles all memory tiers into a single markdown document.
 * This is the "brain dump" of everything The Shem has learned.
 *
 * Factory: createLegalMdTools(session) → 2 MCP tools:
 * 1. compile_legal_md — Generate .shem/LEGAL.md from all memory
 * 2. get_legal_md — Read current LEGAL.md
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import type {
  InstitutionalMemoryEntry,
  PrecedentEntry,
} from './memory-system.js';
import type { AntiPattern } from '../../types/report-card.js';
import type { QualityBaseline } from '../../types/baselines.js';
import { readJsonFile, ensureDir } from '../../utils/fs-helpers.js';

// ── Factory ──────────────────────────────────────────────────────────────

export function createLegalMdTools(session: SessionState) {
  const memoryDir = session.memoryDir;

  const compileLegalMd = tool(
    'compile_legal_md',
    'Compile all institutional knowledge into a human-readable LEGAL.md file. Reads institutional memory, precedents, anti-patterns, and baselines. Writes to .shem/LEGAL.md.',
    {},
    async () => {
      const now = new Date().toISOString();
      const sections: string[] = [];

      // ── Header ──
      sections.push(`# LEGAL.md — The Shem Institutional Knowledge

> Auto-compiled: ${now}
> This file is regenerated after each session. Do not edit manually.

---
`);

      // ── 1. Institutional Memory ──
      const memories = readJsonFile<InstitutionalMemoryEntry[]>(
        path.join(memoryDir, 'institutional.json'), [],
      );

      if (memories.length > 0) {
        // Group by category
        const categories = ['rule', 'lesson', 'pattern', 'preference', 'warning'] as const;
        const grouped = new Map<string, InstitutionalMemoryEntry[]>();
        for (const cat of categories) {
          const items = memories.filter(m => m.category === cat);
          if (items.length > 0) grouped.set(cat, items);
        }

        sections.push('## Institutional Memory\n');

        for (const [category, items] of grouped) {
          // Sort by effectiveness (v4 field, default 0.5)
          const sorted = [...items].sort((a, b) =>
            (b.effectiveness ?? 0.5) - (a.effectiveness ?? 0.5)
          );

          sections.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}s\n`);
          for (const m of sorted) {
            const eff = m.effectiveness !== undefined ? ` (effectiveness: ${(m.effectiveness * 100).toFixed(0)}%)` : '';
            sections.push(`- **${m.id}**: ${m.content}${eff}`);
            sections.push(`  _Source: ${m.source} | Used: ${m.usageCount}x | Added: ${m.addedAt}_\n`);
          }
        }

        sections.push(`**Total**: ${memories.length} entries\n\n---\n`);
      }

      // ── 2. Precedents ──
      const precedents = readJsonFile<PrecedentEntry[]>(
        path.join(memoryDir, 'precedents.json'), [],
      );

      if (precedents.length > 0) {
        const active = precedents.filter(p => !(p.deprecated));
        const deprecated = precedents.filter(p => p.deprecated);

        sections.push('## Precedent Patterns\n');

        if (active.length > 0) {
          // Sort by effectiveness score
          const sorted = [...active].sort((a, b) =>
            (b.effectivenessScore ?? b.qualityScore / 4) - (a.effectivenessScore ?? a.qualityScore / 4)
          );

          sections.push('### Active Precedents\n');
          for (const p of sorted) {
            const eff = p.effectivenessScore !== undefined
              ? `effectiveness: ${(p.effectivenessScore * 100).toFixed(0)}%`
              : `quality: ${p.qualityScore}/4`;
            sections.push(`#### ${p.id}: ${p.patternName} (${eff})`);
            sections.push(`**Type**: ${p.documentType} | **Jurisdiction**: ${p.jurisdiction}`);
            sections.push(`${p.description}`);
            if (p.timesUsed !== undefined) {
              sections.push(`_Used: ${p.timesUsed}x | Queried: ${p.timesQueried}x_`);
            }
            sections.push('');
          }
        }

        if (deprecated.length > 0) {
          sections.push('### Deprecated Precedents\n');
          sections.push('> These precedents have been auto-deprecated due to consistently poor outcomes.\n');
          for (const p of deprecated) {
            sections.push(`- ~~${p.id}: ${p.patternName}~~ — ${p.deprecationReason || 'deprecated'}`);
          }
          sections.push('');
        }

        sections.push(`**Active**: ${active.length} | **Deprecated**: ${deprecated.length}\n\n---\n`);
      }

      // ── 3. Anti-Patterns ──
      const antiPatterns = readJsonFile<AntiPattern[]>(
        path.join(memoryDir, 'anti-patterns.json'), [],
      );

      if (antiPatterns.length > 0) {
        // Sort by severity, then occurrences
        const sorted = [...antiPatterns].sort((a, b) => {
          const sev: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
          const sDiff = (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
          if (sDiff !== 0) return sDiff;
          return b.occurrences - a.occurrences;
        });

        sections.push('## Anti-Patterns (What NOT to Do)\n');

        for (const ap of sorted) {
          const icon = ap.severity === 'RED' ? '🔴' : ap.severity === 'YELLOW' ? '🟡' : '🟢';
          sections.push(`- ${icon} **${ap.id}** [${ap.category}]: ${ap.description}`);
          sections.push(`  _Occurrences: ${ap.occurrences} | Last seen: ${ap.lastSeenAt}_`);
        }

        sections.push(`\n**Total anti-patterns**: ${antiPatterns.length}\n\n---\n`);
      }

      // ── 4. Quality Baselines ──
      if (fs.existsSync(session.baselinesDir)) {
        const baselineFiles = fs.readdirSync(session.baselinesDir).filter(f => f.endsWith('.json'));

        if (baselineFiles.length > 0) {
          sections.push('## Quality Baselines\n');

          for (const file of baselineFiles) {
            const baseline = readJsonFile<QualityBaseline | null>(
              path.join(session.baselinesDir, file), null,
            );
            if (!baseline) continue;

            sections.push(`### ${baseline.documentType} (${baseline.jurisdiction})`);
            sections.push(`Sample: ${baseline.sampleSize} sessions | Updated: ${baseline.lastUpdated}\n`);
            sections.push('| Dimension | Expected | Range |');
            sections.push('|-----------|----------|-------|');
            for (const s of baseline.expectedScores) {
              sections.push(`| ${s.dimension} | ${s.mean.toFixed(2)} ± ${s.stdDev.toFixed(2)} | ${s.min.toFixed(1)}–${s.max.toFixed(1)} |`);
            }
            sections.push('');
            sections.push(`- Verification pass rate: ${(baseline.expectedVerificationPassRate * 100).toFixed(0)}%`);
            sections.push(`- Cost range: $${baseline.expectedCostRange.min}–$${baseline.expectedCostRange.max}`);
            sections.push('');
          }

          sections.push('---\n');
        }
      }

      // ── 5. Summary stats ──
      sections.push('## Summary\n');
      sections.push(`| Metric | Count |`);
      sections.push('|--------|-------|');
      sections.push(`| Institutional memories | ${memories.length} |`);
      sections.push(`| Active precedents | ${precedents.filter(p => !p.deprecated).length} |`);
      sections.push(`| Deprecated precedents | ${precedents.filter(p => p.deprecated).length} |`);
      sections.push(`| Anti-patterns | ${antiPatterns.length} |`);
      sections.push('');

      // ── Write to disk ──
      const markdown = sections.join('\n');
      const legalMdPath = path.join(path.dirname(memoryDir), 'LEGAL.md');
      ensureDir(path.dirname(legalMdPath));
      fs.writeFileSync(legalMdPath, markdown, 'utf-8');

      session.events.emitEvent({
        type: 'legal_md_compiled',
        entriesCount: memories.length + precedents.length + antiPatterns.length,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## LEGAL.md Compiled

📄 Written to ${legalMdPath}

### Contents
- **Institutional memories**: ${memories.length} entries across ${new Set(memories.map(m => m.category)).size} categories
- **Active precedents**: ${precedents.filter(p => !p.deprecated).length} (${precedents.filter(p => p.deprecated).length} deprecated)
- **Anti-patterns**: ${antiPatterns.length}
- **Baselines**: ${fs.existsSync(session.baselinesDir) ? fs.readdirSync(session.baselinesDir).filter(f => f.endsWith('.json')).length : 0}

Total size: ${(markdown.length / 1024).toFixed(1)}KB`,
        }],
      };
    }
  );

  const getLegalMd = tool(
    'get_legal_md',
    'Read the current LEGAL.md institutional knowledge file.',
    {},
    async () => {
      const legalMdPath = path.join(path.dirname(memoryDir), 'LEGAL.md');

      if (!fs.existsSync(legalMdPath)) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No LEGAL.md found. Run compile_legal_md to generate it.',
          }],
        };
      }

      const content = fs.readFileSync(legalMdPath, 'utf-8');
      return {
        content: [{
          type: 'text' as const,
          text: content,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [compileLegalMd, getLegalMd];
}
