/**
 * Formatting Check MCP Tool — Verification Pass 8.
 *
 * Computational (no LLM). Validates document formatting consistency:
 * - Cross-reference validity: "Section X.Y" references point to existing sections
 * - Defined term consistency: capitalization, orphaned definitions, usage tracking
 * - Numbering scheme consistency: no mixing of numbering styles within the same level
 * - Typography patterns: consistent use of formatting conventions
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

export const checkDocumentFormatting = tool(
  'check_document_formatting',
  'Validate formatting consistency: cross-references, defined terms, numbering schemes, typography. Returns structured findings for the Formatting verification pass.',
  {
    defined_terms: z.array(z.object({
      term: z.string().describe('The defined term'),
      definition_location: z.string().describe('Where the term is defined'),
      usage_locations: z.array(z.string()).describe('Where the term is used'),
      capitalized_in_definition: z.boolean().describe('Is the term capitalized in its definition?'),
      always_capitalized_in_usage: z.boolean().describe('Is the term consistently capitalized when used?'),
    })).describe('Defined terms found in the document'),

    cross_references: z.array(z.object({
      reference_text: z.string().describe('The full reference text (e.g., "as set forth in Section 3.2")'),
      target_exists: z.boolean().describe('Whether the referenced target exists in the document'),
      source_location: z.string().describe('Where the reference appears'),
    })).describe('Cross-references and their validity'),

    numbering_schemes: z.array(z.object({
      level: z.number().describe('Nesting level (0 = top, 1 = first sub, etc.)'),
      pattern: z.string().describe('Pattern type: "numeric" (1,2,3), "alpha" (a,b,c), "roman" (i,ii,iii), "bullet"'),
      examples: z.array(z.string()).describe('Example numbers from this level'),
    })).optional().describe('Numbering schemes used at each level'),

    typography_patterns: z.array(z.object({
      pattern_type: z.string().describe('What formatting is used for (e.g., "defined_term_first_use", "section_title", "warning_text")'),
      format_used: z.string().describe('How it is formatted (e.g., "bold", "italic", "ALL CAPS", "quoted")'),
      consistent: z.boolean().describe('Is this formatting applied consistently throughout?'),
      exceptions: z.array(z.string()).optional().describe('Where inconsistencies were found'),
    })).optional().describe('Typography formatting patterns'),
  },
  async (args) => {
    const findings: Array<{
      type: string;
      severity: 'critical' | 'major' | 'minor';
      location: string;
      description: string;
      evidence: string;
      autoFixable: boolean;
    }> = [];

    // ── 1. Defined term consistency ────────────────────────────────────
    for (const term of args.defined_terms) {
      // Orphaned definition: defined but never used
      if (term.usage_locations.length === 0) {
        findings.push({
          type: 'orphaned_definition',
          severity: 'minor',
          location: term.definition_location,
          description: `"${term.term}" is defined but never used in the document`,
          evidence: `Defined at: ${term.definition_location}, used: 0 times`,
          autoFixable: false,
        });
      }

      // Capitalization inconsistency
      if (term.capitalized_in_definition && !term.always_capitalized_in_usage) {
        findings.push({
          type: 'capitalization_inconsistency',
          severity: 'major',
          location: `Multiple locations (${term.usage_locations.length} usages)`,
          description: `"${term.term}" is capitalized in its definition but not consistently capitalized when used`,
          evidence: `Defined as capitalized at ${term.definition_location}; inconsistent in usage`,
          autoFixable: true,
        });
      }
    }

    // Check for terms used but never defined
    // (The agent should pass undefined terms in the defined_terms array with empty definition_location)
    for (const term of args.defined_terms) {
      if (!term.definition_location || term.definition_location === '') {
        findings.push({
          type: 'undefined_term',
          severity: 'major',
          location: term.usage_locations[0] || 'Unknown',
          description: `"${term.term}" is used as a defined term but has no definition`,
          evidence: `Used at: ${term.usage_locations.slice(0, 3).join(', ')}${term.usage_locations.length > 3 ? '...' : ''}`,
          autoFixable: false,
        });
      }
    }

    // ── 2. Cross-reference validity ────────────────────────────────────
    for (const ref of args.cross_references) {
      if (!ref.target_exists) {
        findings.push({
          type: 'broken_cross_reference',
          severity: 'critical',
          location: ref.source_location,
          description: `Cross-reference to non-existent target`,
          evidence: ref.reference_text,
          autoFixable: false,
        });
      }
    }

    // ── 3. Numbering scheme consistency ────────────────────────────────
    if (args.numbering_schemes) {
      // Check for mixed patterns at the same level
      const byLevel = new Map<number, Set<string>>();
      for (const scheme of args.numbering_schemes) {
        if (!byLevel.has(scheme.level)) byLevel.set(scheme.level, new Set());
        byLevel.get(scheme.level)!.add(scheme.pattern);
      }

      for (const [level, patterns] of byLevel) {
        if (patterns.size > 1) {
          findings.push({
            type: 'mixed_numbering',
            severity: 'major',
            location: `Numbering level ${level}`,
            description: `Mixed numbering schemes at level ${level}: ${Array.from(patterns).join(', ')}`,
            evidence: `Found ${patterns.size} different patterns at the same nesting level`,
            autoFixable: true,
          });
        }
      }
    }

    // ── 4. Typography consistency ──────────────────────────────────────
    if (args.typography_patterns) {
      for (const pattern of args.typography_patterns) {
        if (!pattern.consistent) {
          findings.push({
            type: 'typography_inconsistency',
            severity: 'minor',
            location: pattern.exceptions?.join(', ') || 'Multiple locations',
            description: `Inconsistent formatting for "${pattern.pattern_type}" — should be ${pattern.format_used} throughout`,
            evidence: `${pattern.exceptions?.length ?? 0} exceptions found`,
            autoFixable: true,
          });
        }
      }
    }

    // ── Compile result ─────────────────────────────────────────────────
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const majorCount = findings.filter(f => f.severity === 'major').length;
    const minorCount = findings.filter(f => f.severity === 'minor').length;
    const autoFixableCount = findings.filter(f => f.autoFixable).length;

    let score = 1.0;
    score -= criticalCount * 0.25;
    score -= majorCount * 0.10;
    score -= minorCount * 0.03;
    score = Math.max(0, Math.min(1, score));

    const findingsText = findings.length > 0
      ? findings.map(f =>
        `- [${f.severity.toUpperCase()}] ${f.description}${f.autoFixable ? ' (auto-fixable)' : ''}\n  Location: ${f.location}\n  Evidence: ${f.evidence}`
      ).join('\n\n')
      : 'No formatting issues found.';

    return {
      content: [{
        type: 'text' as const,
        text: `## Formatting Check Results

**Score**: ${(score * 100).toFixed(0)}%
**Defined terms**: ${args.defined_terms.length}
**Cross-references**: ${args.cross_references.length}
**Numbering levels**: ${args.numbering_schemes?.length ?? 0}
**Findings**: ${criticalCount} critical, ${majorCount} major, ${minorCount} minor
**Auto-fixable**: ${autoFixableCount}

${findingsText}`,
      }],
    };
  },
  { annotations: { readOnly: true } }
);

export const formattingCheckTools = [checkDocumentFormatting];
