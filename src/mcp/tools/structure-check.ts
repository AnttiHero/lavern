/**
 * Structure Check MCP Tool — Verification Pass 4.
 *
 * Computational (no LLM). Validates document structure:
 * - Heading hierarchy: no skipped levels (H1→H3 without H2)
 * - Section numbering continuity: detects gaps (1.1, 1.2, 1.4 — missing 1.3)
 * - Cross-reference target existence: "Section X.Y" → verify target exists
 * - Section flow: orphaned sections referenced elsewhere but not present
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

export const checkDocumentStructure = tool(
  'check_document_structure',
  'Validate document structure: heading hierarchy, section numbering continuity, cross-reference targets. Returns structured findings for the Structure verification pass.',
  {
    headings: z.array(z.object({
      level: z.number().min(1).max(6).describe('Heading level (1–6)'),
      text: z.string().describe('Heading text'),
      position: z.number().describe('Position in document (paragraph index or char offset)'),
    })).describe('All headings found in the document, in order'),

    section_numbers: z.array(z.string()).optional()
      .describe('All section numbers found (e.g., ["1", "1.1", "1.2", "2", "2.1"])'),

    cross_references: z.array(z.object({
      source_text: z.string().describe('The reference text (e.g., "see Section 3.2")'),
      target_section: z.string().describe('The target being referenced (e.g., "3.2")'),
      source_location: z.string().describe('Where the reference appears'),
    })).optional().describe('Cross-references found in the document'),
  },
  async (args) => {
    const findings: Array<{
      type: string;
      severity: 'critical' | 'major' | 'minor';
      location: string;
      description: string;
      evidence: string;
    }> = [];

    // ── 1. Heading hierarchy validation ────────────────────────────────
    for (let i = 1; i < args.headings.length; i++) {
      const prev = args.headings[i - 1];
      const curr = args.headings[i];
      const jump = curr.level - prev.level;

      if (jump > 1) {
        findings.push({
          type: 'heading_skip',
          severity: 'major',
          location: `Heading at position ${curr.position}`,
          description: `Heading level jumps from H${prev.level} to H${curr.level} (skipped H${prev.level + 1})`,
          evidence: `"${prev.text}" (H${prev.level}) → "${curr.text}" (H${curr.level})`,
        });
      }
    }

    // Check for missing H1
    if (args.headings.length > 0 && !args.headings.some(h => h.level === 1)) {
      findings.push({
        type: 'missing_h1',
        severity: 'minor',
        location: 'Document top',
        description: 'No H1 heading found. Document should have a top-level heading.',
        evidence: `First heading: "${args.headings[0].text}" (H${args.headings[0].level})`,
      });
    }

    // ── 2. Section numbering continuity ────────────────────────────────
    if (args.section_numbers && args.section_numbers.length > 0) {
      const numbers = args.section_numbers;

      // Group by parent (e.g., "1.1" and "1.2" share parent "1")
      const byParent = new Map<string, string[]>();
      for (const num of numbers) {
        const parts = num.split('.');
        const parent = parts.length > 1 ? parts.slice(0, -1).join('.') : '';
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent)!.push(num);
      }

      // Check continuity within each parent group
      for (const [parent, children] of byParent) {
        // Extract last segment as number
        const lastSegments = children.map(c => {
          const parts = c.split('.');
          return parseInt(parts[parts.length - 1], 10);
        }).filter(n => !isNaN(n));

        lastSegments.sort((a, b) => a - b);

        for (let i = 1; i < lastSegments.length; i++) {
          const expected = lastSegments[i - 1] + 1;
          const actual = lastSegments[i];
          if (actual !== expected) {
            const prefix = parent ? `${parent}.` : '';
            findings.push({
              type: 'numbering_gap',
              severity: 'major',
              location: `Section numbering under ${parent || 'root'}`,
              description: `Section ${prefix}${expected} is missing (jumps from ${prefix}${lastSegments[i - 1]} to ${prefix}${actual})`,
              evidence: `Found: ${children.join(', ')}`,
            });
          }
        }
      }
    }

    // ── 3. Cross-reference validation ──────────────────────────────────
    if (args.cross_references && args.section_numbers) {
      const existingSections = new Set(args.section_numbers);

      // Also add heading text as potential targets
      const headingTexts = new Set(args.headings.map(h => h.text.toLowerCase()));

      for (const ref of args.cross_references) {
        const targetExists = existingSections.has(ref.target_section) ||
          headingTexts.has(ref.target_section.toLowerCase());

        if (!targetExists) {
          findings.push({
            type: 'broken_reference',
            severity: 'critical',
            location: ref.source_location,
            description: `Cross-reference to "${ref.target_section}" points to a non-existent section`,
            evidence: ref.source_text,
          });
        }
      }
    }

    // ── 4. Duplicate headings (potential confusion) ────────────────────
    const headingCounts = new Map<string, number>();
    for (const h of args.headings) {
      const key = h.text.toLowerCase().trim();
      headingCounts.set(key, (headingCounts.get(key) ?? 0) + 1);
    }
    for (const [text, count] of headingCounts) {
      if (count > 1) {
        findings.push({
          type: 'duplicate_heading',
          severity: 'minor',
          location: 'Multiple locations',
          description: `Heading "${text}" appears ${count} times, which may cause navigation confusion`,
          evidence: `${count} occurrences`,
        });
      }
    }

    // ── Compile result ─────────────────────────────────────────────────
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const majorCount = findings.filter(f => f.severity === 'major').length;
    const minorCount = findings.filter(f => f.severity === 'minor').length;

    // Score: start at 1.0, deduct for findings
    let score = 1.0;
    score -= criticalCount * 0.25;
    score -= majorCount * 0.10;
    score -= minorCount * 0.03;
    score = Math.max(0, Math.min(1, score));

    const findingsText = findings.length > 0
      ? findings.map(f => `- [${f.severity.toUpperCase()}] ${f.description}\n  Location: ${f.location}\n  Evidence: ${f.evidence}`).join('\n\n')
      : 'No structural issues found.';

    return {
      content: [{
        type: 'text' as const,
        text: `## Structure Check Results

**Score**: ${(score * 100).toFixed(0)}%
**Headings analyzed**: ${args.headings.length}
**Sections**: ${args.section_numbers?.length ?? 0}
**Cross-references**: ${args.cross_references?.length ?? 0}
**Findings**: ${criticalCount} critical, ${majorCount} major, ${minorCount} minor

${findingsText}`,
      }],
    };
  },
  { annotations: { readOnly: true } }
);

export const structureCheckTools = [checkDocumentStructure];
