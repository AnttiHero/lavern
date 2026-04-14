/**
 * Validate Deliverable — Hardened validation for assembled documents.
 *
 * Ensures that the output served to clients is a REAL, SUBSTANTIVE legal
 * document — not orchestrator thinking, not a skeleton, not placeholder text.
 *
 * v19: Defense-in-depth validation. Every check exists because a real
 * failure mode was observed in production:
 *   - Skeleton documents with correct structure but no substance
 *   - Placeholder text like [Insert Date], [PLACEHOLDER]
 *   - Process dumps with agent reasoning mixed into middle sections
 *   - Documents meeting minimum length with thin/empty sections
 *
 * Used by:
 *   - document-assembler.ts (post-assembly validation)
 *   - sessions.ts download endpoint (final safety gate)
 *   - claw/delivery.ts (Claw mode delivery gate)
 *
 * The frontend has a mirror in viz/src/delivery/utils/validateDeliverable.ts.
 * KEEP BOTH FILES IN SYNC.
 */

// ── Process Dump Detection ────────────────────────────────────────────────

/**
 * Detect whether text looks like orchestrator process output
 * rather than an actual deliverable document.
 *
 * Checks the FIRST 500 characters for patterns that indicate
 * agent thinking, tool calls, or internal coordination.
 */
export function isProcessDump(text: string): boolean {
  const head = text.trimStart().substring(0, 500);

  // Common orchestrator thinking patterns
  const processPatterns = [
    // Agent reasoning / planning
    /^I'll /i, /^I will /i, /^Let me /i, /^I need to/i, /^I see /i,
    /^I can see/i, /^I have /i, /^I've /i,
    // Transitions
    /^First,/i, /^Now,/i, /^Now let/i, /^Next,/i,
    // Affirmations
    /^OK[,.\s]/i, /^Okay/i, /^Sure/i, /^Certainly/i,
    /^Good\./i, /^Good —/i, /^Great/i, /^Excellent/i, /^Perfect/i,
    // Preamble
    /^Here is/i, /^Here's /i, /^Based on/i, /^The analysis/i,
    /^Below is/i, /^What follows/i, /^The following/i,
    // Agent coordination
    /^Clean slate/i, /^The specialist/i, /^Both specialists/i,
    /^Let me check/i, /^I'll start/i, /^I'll now/i,
    // Additional patterns observed in production
    /^I'll get started/i, /^Looking at/i, /^After review/i,
    /^Once analyzed/i, /^The process/i, /^In summary,? here/i,
    /^To begin/i, /^Starting with/i, /^Moving on/i,
  ];

  if (processPatterns.some(p => p.test(head))) return true;

  // MCP tool references that should never appear in a deliverable
  const toolPatterns = [
    /get_current_step/i, /advance_step/i, /post_finding/i,
    /dispatching the/i, /running in parallel/i,
    /permission issue/i, /tool.*has.*issue/i,
    /subagent/i, /debate board/i,
  ];

  if (toolPatterns.some(p => p.test(head))) return true;

  return false;
}

// ── Full-Text Process Scan ────────────────────────────────────────────────

/**
 * Scan the ENTIRE document for process text contamination.
 * Returns the ratio of process-contaminated paragraphs (0.0 to 1.0).
 *
 * Unlike isProcessDump() which only checks the first 500 chars,
 * this catches agent reasoning that leaked into middle sections.
 */
export function processTextRatio(text: string): number {
  const paragraphs = text.split(/\n\n+/).filter(p => {
    const t = p.trim();
    // Skip headings, horizontal rules, and very short lines
    return t.length > 30 && !t.startsWith('#') && t !== '---';
  });

  if (paragraphs.length === 0) return 0;

  // NOTE: "First,", "Now,", "Next," are intentionally EXCLUDED here (common in
  // legal prose: "First, the parties agree..."). They ARE in isProcessDump()
  // which only checks the opening 500 chars where they indicate agent preamble.
  const processPatterns = [
    /^I'll /im, /^I will /im, /^Let me /im, /^I need to/im,
    /^I can see/im, /^I have /im, /^I've /im, /^I see /im,
    /^Now let/im,
    /^OK[,.\s]/im, /^Okay/im, /^Sure/im, /^Certainly/im,
    /^Good\./im, /^Good —/im, /^Great/im, /^Excellent/im, /^Perfect/im,
    /^Here is/im, /^Here's /im, /^Based on my/im,
    /^Looking at/im, /^After review/im, /^To begin/im,
    /^Starting with/im, /^Moving on/im, /^I'll get started/im,
  ];

  let contaminated = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (processPatterns.some(p => p.test(trimmed))) {
      contaminated++;
    }
  }

  return contaminated / paragraphs.length;
}

// ── Placeholder Detection ─────────────────────────────────────────────────

/**
 * Detect bracketed placeholder text that indicates an unfinished document.
 * Returns the number of placeholder occurrences found.
 */
export function countPlaceholders(text: string): number {
  // Only flag genuine assembly failures — NOT legitimate legal template fields.
  // Template fields like [Company Name], [Effective Date], [Insert Date] are
  // EXPECTED in drafted contracts, ToS, and policies. Only flag:
  //   - Explicit filler signals: [PLACEHOLDER], [TBD], [TODO], [PENDING], [DRAFT]
  //   - Structural stubs: [SECTION ...], [Analysis goes here], [To be filled/added]
  const knownPlaceholders = [
    /\[To be (filled|completed|added|determined)[^\]]*\]/gi,
    /\[PLACEHOLDER[^\]]*\]/gi,
    /\[TBD[^\]]*\]/gi,
    /\[TODO[^\]]*\]/gi,
    /\[PENDING[^\]]*\]/gi,
    /\[DRAFT[^\]]*\]/gi,
    /\[SECTION [^\]]*\]/gi,
    /\[Analysis goes here[^\]]*\]/gi,
    /\[Content here[^\]]*\]/gi,
    /\[Add (content|analysis|text)[^\]]*\]/gi,
  ];

  let count = 0;
  for (const pattern of knownPlaceholders) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }

  // Generic uppercase bracketed patterns (e.g., [ANALYSIS], [FINDINGS])
  // Only flag if 3+ found (some legal docs legitimately use [brackets])
  const genericBrackets = text.match(/\[[A-Z][A-Z\s]{2,30}\]/g);
  if (genericBrackets && genericBrackets.length >= 3) {
    count += genericBrackets.length;
  }

  return count;
}

// ── Content Density Check ─────────────────────────────────────────────────

/**
 * Analyze content density: checks that sections have real substance,
 * not just headings with minimal text underneath.
 *
 * Returns { sectionsWithContent, totalSections, avgCharsPerSection }.
 */
export function analyzeContentDensity(text: string): {
  sectionsWithContent: number;
  totalSections: number;
  avgCharsPerSection: number;
} {
  // Split by headings
  const sections = text.split(/^(?=#{1,6}\s)/m).filter(s => s.trim());

  if (sections.length === 0) {
    return { sectionsWithContent: 0, totalSections: 0, avgCharsPerSection: 0 };
  }

  let totalBodyChars = 0;
  let sectionsWithContent = 0;

  for (const section of sections) {
    // Strip the heading line itself and any horizontal rules
    const bodyLines = section.split('\n').filter(line => {
      const t = line.trim();
      return t && !t.startsWith('#') && t !== '---' && t !== '***';
    });
    const bodyChars = bodyLines.join(' ').trim().length;
    totalBodyChars += bodyChars;
    if (bodyChars >= 150) sectionsWithContent++;
  }

  return {
    sectionsWithContent,
    totalSections: sections.length,
    avgCharsPerSection: sections.length > 0 ? Math.round(totalBodyChars / sections.length) : 0,
  };
}

// ── Empty Section Detection ──────────────────────────────────────────────

/**
 * Count sections that have a heading but no content before the next heading
 * or end of document. This indicates the assembler failed to populate a section.
 *
 * A section is "empty" if a heading line (## Something) is followed immediately
 * by another heading line or end of document with no substantive content between.
 */
export function countEmptySections(text: string): number {
  const lines = text.split('\n');
  let emptyCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Check if this line is a heading
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (!headingMatch) continue;
    const currentLevel = headingMatch[1].length;

    // Look ahead for content before the next SAME-OR-HIGHER-LEVEL heading or EOF.
    // A parent heading (## X) followed by deeper sub-headings (### X.1) is a
    // container, not empty — well-structured legal docs use this pattern heavily.
    let hasContent = false;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();
      // Skip blank lines and horizontal rules
      if (!nextLine || nextLine === '---' || nextLine === '***') continue;
      const nextHeadingMatch = nextLine.match(/^(#{1,6})\s/);
      if (nextHeadingMatch) {
        const nextLevel = nextHeadingMatch[1].length;
        // A deeper heading = this section has sub-structure (not empty)
        if (nextLevel > currentLevel) {
          hasContent = true;
        }
        // Either way, stop scanning at the next heading of any level
        break;
      }
      // Found substantive non-heading content
      hasContent = true;
      break;
    }

    if (!hasContent) emptyCount++;
  }

  return emptyCount;
}

// ── Main Validation ───────────────────────────────────────────────────────

export type ValidationReason =
  | 'empty'
  | 'too_short'
  | 'no_heading'
  | 'process_text'
  | 'no_structure'
  | 'thin_content'
  | 'empty_sections'
  | 'excessive_placeholders'
  | 'process_contamination';

/**
 * Validate that a text is a legitimate deliverable document.
 *
 * Returns { valid: true } if the text passes ALL checks, or
 * { valid: false, reason } describing why it failed.
 *
 * Checks (in order — all mechanical, no semantic judgment):
 *   1. Not empty
 *   2. At least 500 chars
 *   3. Starts with markdown heading
 *   4. Head is not a process dump (first 500 chars)
 *   5. Has at least 3 markdown headings (structure)
 *   6. Sufficient content density (sections have real content)
 *   6b. No more than 2 empty sections (heading with no content before next heading)
 *   7. No excessive placeholders (≥5 = fail; legal templates with 1-3 are fine)
 *   8. Full-text process contamination < 5%
 */
export function validateDeliverable(text: string): { valid: boolean; reason?: ValidationReason } {
  if (!text) return { valid: false, reason: 'empty' };

  const trimmed = text.trim();

  // 1. Minimum length — a real legal document is at least 500 chars
  if (trimmed.length < 500) return { valid: false, reason: 'too_short' };

  // 2. Must start with a markdown heading
  if (!trimmed.startsWith('#')) return { valid: false, reason: 'no_heading' };

  // 3. Head must not be a process dump
  if (isProcessDump(text)) return { valid: false, reason: 'process_text' };

  // 4. Must have structural headings
  const headingCount = (trimmed.match(/^#{1,6}\s/gm) || []).length;
  if (headingCount < 3) return { valid: false, reason: 'no_structure' };

  // 5. Content density — at least 2 sections with ≥150 chars of body text
  //    Average threshold is 100 (not 150) because title headings often have
  //    zero body text, dragging the average down for legitimate documents.
  const density = analyzeContentDensity(trimmed);
  if (density.sectionsWithContent < 2 || density.avgCharsPerSection < 100) {
    return { valid: false, reason: 'thin_content' };
  }

  // 6. Empty sections — headings with no content indicate assembly failure
  const emptySections = countEmptySections(trimmed);
  if (emptySections > 2) return { valid: false, reason: 'empty_sections' };

  // 7. Excessive placeholders — ≥5 indicates unfinished garbage.
  //    Legal template drafts legitimately use 1-3 fields like [Insert Date],
  //    [Company Name]. But 5+ means the assembler didn't fill in content.
  const placeholderCount = countPlaceholders(trimmed);
  if (placeholderCount >= 5) return { valid: false, reason: 'excessive_placeholders' };

  // 8. Full-text process contamination check — 5% threshold means at most
  //    1 contaminated paragraph in a 20-paragraph document.
  const contamination = processTextRatio(trimmed);
  if (contamination > 0.05) return { valid: false, reason: 'process_contamination' };

  return { valid: true };
}
