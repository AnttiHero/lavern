/**
 * Document Checks MCP Tools — Computational verification for document structure and formatting.
 *
 * These tools provide the mechanical checks referenced by orchestrator-verification,
 * orchestrator-review, and orchestrator-full-bench prompts:
 *
 * 1. `check_document_structure` — Detects heading hierarchy gaps, numbering
 *    discontinuities, and broken cross-references.
 * 2. `check_document_formatting` — Detects inconsistencies in defined terms,
 *    cross-references, numbering schemes, and typography.
 * 3. `record_pass_result` — Records a verification pass result on the session.
 * 4. `compile_verification_report` — Compiles all pass results into a final report.
 *
 * Pass 4 (Structure) and Pass 8 (Formatting) of the 10-pass verification pipeline
 * are computational — they should produce deterministic, evidence-based findings,
 * not vibes.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

// ── Types ────────────────────────────────────────────────────────────────

interface VerificationPassResult {
  pass: string;
  score: number;
  findingsCount: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Check heading hierarchy for gaps (e.g. H1 → H3 with no H2).
 */
function analyzeHeadingHierarchy(headings: Array<{ text: string; level: number; position: number }>) {
  const issues: string[] = [];
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1];
    const curr = headings[i];
    // Gap: jumping from H1 to H3 (skipping H2)
    if (curr.level > prev.level + 1) {
      issues.push(`Heading hierarchy gap at position ${curr.position}: "${curr.text}" is H${curr.level} but previous heading "${prev.text}" is H${prev.level} (skipped H${prev.level + 1})`);
    }
  }
  return issues;
}

/**
 * Check section numbering for discontinuities.
 */
function analyzeNumbering(sectionNumbers: string[]) {
  const issues: string[] = [];
  if (sectionNumbers.length < 2) return issues;

  // Group by prefix depth
  const topLevel: number[] = [];
  for (const num of sectionNumbers) {
    const parts = num.split('.');
    const first = parseInt(parts[0], 10);
    if (!isNaN(first) && parts.length === 1) {
      topLevel.push(first);
    }
  }

  // Check for gaps in top-level numbering
  for (let i = 1; i < topLevel.length; i++) {
    if (topLevel[i] !== topLevel[i - 1] + 1) {
      issues.push(`Section numbering gap: Section ${topLevel[i - 1]} is followed by Section ${topLevel[i]} (expected ${topLevel[i - 1] + 1})`);
    }
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const num of sectionNumbers) {
    if (seen.has(num)) {
      issues.push(`Duplicate section number: ${num}`);
    }
    seen.add(num);
  }

  return issues;
}

/**
 * Check cross-references for broken targets.
 */
function analyzeCrossReferences(
  crossRefs: Array<{ text: string; target: string }>,
  headings: Array<{ text: string; level: number; position: number }>,
  sectionNumbers: string[],
) {
  const issues: string[] = [];
  const headingTexts = new Set(headings.map(h => h.text.toLowerCase()));
  const numberSet = new Set(sectionNumbers);

  for (const ref of crossRefs) {
    const target = ref.target.trim();

    // Check if target matches a section number
    if (/^\d+(\.\d+)*$/.test(target)) {
      if (!numberSet.has(target)) {
        issues.push(`Broken cross-reference: "${ref.text}" references Section ${target} which does not exist`);
      }
      continue;
    }

    // Check if target matches a heading
    if (!headingTexts.has(target.toLowerCase())) {
      // Fuzzy check — does any heading contain the target text?
      const fuzzyMatch = headings.some(h => h.text.toLowerCase().includes(target.toLowerCase()));
      if (!fuzzyMatch) {
        issues.push(`Potentially broken cross-reference: "${ref.text}" references "${target}" — no matching heading found`);
      }
    }
  }

  return issues;
}

// ── Tool Factories ───────────────────────────────────────────────────────

export function createDocumentCheckTools(session: SessionState) {
  // Use the typed verificationPassResults array on SessionState
  const passes = session.verificationPassResults;

  const checkDocumentStructure = tool(
    'check_document_structure',
    'Computational structure check: Detects heading hierarchy gaps, numbering discontinuities, and broken cross-references in a document. Returns specific, evidence-based findings.',
    {
      headings: z.array(z.object({
        text: z.string().describe('The heading text'),
        level: z.number().min(1).max(6).describe('Heading level (1-6)'),
        position: z.number().describe('Approximate character position in document'),
      })).describe('All headings extracted from the document'),
      section_numbers: z.array(z.string()).describe('All section numbers (e.g., "1", "1.1", "2", "2.1")'),
      cross_references: z.array(z.object({
        text: z.string().describe('The reference text as it appears (e.g., "see Section 3.2")'),
        target: z.string().describe('The target being referenced (e.g., "3.2")'),
      })).describe('Cross-references found in the document'),
    },
    async (args) => {
      const hierarchyIssues = analyzeHeadingHierarchy(args.headings);
      const numberingIssues = analyzeNumbering(args.section_numbers);
      const refIssues = analyzeCrossReferences(args.cross_references, args.headings, args.section_numbers);

      const allIssues = [...hierarchyIssues, ...numberingIssues, ...refIssues];
      const score = allIssues.length === 0 ? 1.0
        : Math.max(0, 1.0 - (allIssues.length * 0.15));

      session.events.emitEvent({
        type: 'tool_used',
        tool: 'check_document_structure',
        agent: 'verification',
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Structure Check Results

**Score**: ${score.toFixed(2)} / 1.00
**Headings analyzed**: ${args.headings.length}
**Section numbers**: ${args.section_numbers.length}
**Cross-references**: ${args.cross_references.length}
**Issues found**: ${allIssues.length}

${allIssues.length > 0 ? `### Issues\n${allIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}` : '✅ No structural issues detected.'}

### Heading Hierarchy
${args.headings.map(h => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}`).join('\n') || '(no headings)'}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const checkDocumentFormatting = tool(
    'check_document_formatting',
    'Computational formatting check: Detects inconsistencies in defined terms, cross-references, numbering schemes, and typography conventions.',
    {
      defined_terms: z.array(z.object({
        term: z.string().describe('The defined term'),
        definition_location: z.string().describe('Where the term is defined'),
        usage_count: z.number().describe('How many times the term is used'),
        capitalized_consistently: z.boolean().describe('Whether capitalization is consistent'),
      })).describe('All defined terms in the document'),
      cross_references: z.array(z.object({
        text: z.string().describe('The reference text'),
        target_exists: z.boolean().describe('Whether the referenced target exists'),
      })).describe('Cross-references with validation status'),
      numbering_schemes: z.array(z.object({
        level: z.number().describe('Nesting level (1 = top)'),
        pattern: z.string().describe('Pattern used (e.g., "1.2.3", "(a)", "i.")'),
        count: z.number().describe('Number of items using this pattern'),
      })).describe('Numbering patterns at each level'),
      typography_patterns: z.array(z.object({
        convention: z.string().describe('Description of the convention (e.g., "Bold for defined terms")'),
        consistent: z.boolean().describe('Whether this convention is applied consistently'),
        violations: z.number().describe('Number of violations found'),
      })).describe('Typography conventions and their consistency'),
    },
    async (args) => {
      const issues: string[] = [];

      // Check defined terms
      const inconsistentTerms = args.defined_terms.filter(dt => !dt.capitalized_consistently);
      if (inconsistentTerms.length > 0) {
        issues.push(`${inconsistentTerms.length} defined term(s) have inconsistent capitalization: ${inconsistentTerms.map(t => `"${t.term}"`).join(', ')}`);
      }

      const unusedTerms = args.defined_terms.filter(dt => dt.usage_count === 0);
      if (unusedTerms.length > 0) {
        issues.push(`${unusedTerms.length} defined term(s) are never used: ${unusedTerms.map(t => `"${t.term}"`).join(', ')}`);
      }

      // Check cross-references
      const brokenRefs = args.cross_references.filter(cr => !cr.target_exists);
      if (brokenRefs.length > 0) {
        issues.push(`${brokenRefs.length} broken cross-reference(s): ${brokenRefs.map(r => `"${r.text}"`).join(', ')}`);
      }

      // Check numbering consistency
      const levelPatterns = new Map<number, Set<string>>();
      for (const ns of args.numbering_schemes) {
        if (!levelPatterns.has(ns.level)) levelPatterns.set(ns.level, new Set());
        levelPatterns.get(ns.level)!.add(ns.pattern);
      }
      for (const [level, patterns] of levelPatterns) {
        if (patterns.size > 1) {
          issues.push(`Mixed numbering patterns at level ${level}: ${[...patterns].join(', ')}`);
        }
      }

      // Check typography consistency
      const typoViolations = args.typography_patterns.filter(tp => !tp.consistent);
      for (const tv of typoViolations) {
        issues.push(`Typography inconsistency: "${tv.convention}" has ${tv.violations} violation(s)`);
      }

      const score = issues.length === 0 ? 1.0
        : Math.max(0, 1.0 - (issues.length * 0.12));

      session.events.emitEvent({
        type: 'tool_used',
        tool: 'check_document_formatting',
        agent: 'verification',
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Formatting Check Results

**Score**: ${score.toFixed(2)} / 1.00
**Defined terms**: ${args.defined_terms.length} (${inconsistentTerms.length} inconsistent, ${unusedTerms.length} unused)
**Cross-references**: ${args.cross_references.length} (${brokenRefs.length} broken)
**Numbering schemes**: ${args.numbering_schemes.length}
**Typography conventions**: ${args.typography_patterns.length} (${typoViolations.length} inconsistent)
**Issues found**: ${issues.length}

${issues.length > 0 ? `### Issues\n${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}` : '✅ No formatting inconsistencies detected.'}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const recordPassResult = tool(
    'record_pass_result',
    'Record the result of a verification pass. Call after completing each of the 10 verification passes.',
    {
      pass: z.string().describe('Pass name (context, ux, clarity, structure, accuracy, completeness, risk, formatting, design, delivery)'),
      score: z.number().min(0).max(1).describe('Score for this pass (0.0 to 1.0)'),
      findings: z.array(z.object({
        severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR']).describe('Finding severity'),
        location: z.string().describe('Where in the document'),
        description: z.string().describe('What the issue is'),
        evidence: z.string().describe('Specific text or data supporting the finding'),
        suggestion: z.string().optional().describe('How to fix it'),
        autoFixable: z.boolean().describe('Whether this can be auto-fixed'),
        confidence: z.number().min(0).max(1).describe('Confidence in this finding'),
      })).describe('Findings from this pass'),
    },
    async (args) => {
      const critical = args.findings.filter(f => f.severity === 'CRITICAL').length;
      const major = args.findings.filter(f => f.severity === 'MAJOR').length;
      const minor = args.findings.filter(f => f.severity === 'MINOR').length;

      const result: VerificationPassResult = {
        pass: args.pass,
        score: args.score,
        findingsCount: args.findings.length,
        criticalCount: critical,
        majorCount: major,
        minorCount: minor,
        timestamp: new Date().toISOString(),
      };
      passes.push(result);

      // Also record findings on the debate board for downstream consumers
      const severityMap = { 'CRITICAL': 'RED', 'MAJOR': 'YELLOW', 'MINOR': 'GREEN' } as const;
      for (const finding of args.findings) {
        session.debate.findings.push({
          id: `VP-${args.pass.toUpperCase()}-${session.debate.findings.length + 1}`,
          agentRole: 'orchestrator',
          findingType: 'score',
          content: `[${args.pass.toUpperCase()}] ${finding.description}`,
          severity: severityMap[finding.severity] ?? 'YELLOW',
          evidence: [finding.evidence, `Location: ${finding.location}`],
          confidence: finding.confidence,
          timestamp: new Date().toISOString(),
          resolved: false,
        });
      }

      session.events.emitEvent({
        type: 'tool_used',
        tool: 'record_pass_result',
        agent: 'verification',
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `✓ Pass "${args.pass}" recorded: ${args.score.toFixed(2)} / 1.00 (${args.findings.length} findings: ${critical} critical, ${major} major, ${minor} minor)`,
        }],
      };
    }
  );

  const compileVerificationReport = tool(
    'compile_verification_report',
    'Compile all recorded pass results into the final Verification Report. Call after all 10 passes are complete.',
    {
      document_name: z.string().describe('Name of the document being verified'),
    },
    async (args) => {
      const totalFindings = passes.reduce((sum, p) => sum + p.findingsCount, 0);
      const totalCritical = passes.reduce((sum, p) => sum + p.criticalCount, 0);
      const totalMajor = passes.reduce((sum, p) => sum + p.majorCount, 0);
      const totalMinor = passes.reduce((sum, p) => sum + p.minorCount, 0);
      const avgScore = passes.length > 0
        ? passes.reduce((sum, p) => sum + p.score, 0) / passes.length
        : 0;

      // Determine overall grade
      const grade = totalCritical > 0 ? 'FAIL'
        : avgScore >= 0.8 ? 'PASS'
        : avgScore >= 0.6 ? 'CONDITIONAL PASS'
        : 'FAIL';

      // Store on session for downstream consumers
      session.verification = {
        passed: grade !== 'FAIL',
        overallScore: avgScore,
        passResults: passes.map(p => ({
          pass: p.pass,
          score: p.score,
          findings: p.findingsCount,
        })),
      };

      session.events.emitEvent({
        type: 'tool_used',
        tool: 'compile_verification_report',
        agent: 'verification',
        timestamp: eventTimestamp(),
      });

      const passTable = passes.map(p => {
        const bar = '█'.repeat(Math.round(p.score * 10)) + '░'.repeat(10 - Math.round(p.score * 10));
        return `| ${p.pass.padEnd(14)} | ${bar} ${(p.score * 100).toFixed(0).padStart(3)}% | ${p.findingsCount} (${p.criticalCount}C ${p.majorCount}M ${p.minorCount}m) |`;
      }).join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `# Verification Report: ${args.document_name}

## Overall: ${grade} (${(avgScore * 100).toFixed(0)}%)

| Pass           | Score          | Findings |
|----------------|----------------|----------|
${passTable}

## Summary
- **Total findings**: ${totalFindings} (${totalCritical} critical, ${totalMajor} major, ${totalMinor} minor)
- **Average score**: ${(avgScore * 100).toFixed(1)}%
- **Passes completed**: ${passes.length} / 10
- **Grade**: ${grade}

${totalCritical > 0 ? `⚠️ **${totalCritical} CRITICAL finding(s)** must be addressed before this document can be delivered.` : ''}
${grade === 'CONDITIONAL PASS' ? '⚠️ Document passes with conditions — major findings should be reviewed.' : ''}
${grade === 'PASS' ? '✅ Document meets quality standards for delivery.' : ''}`,
        }],
      };
    }
  );

  return [
    checkDocumentStructure,
    checkDocumentFormatting,
    recordPassResult,
    compileVerificationReport,
  ];
}
