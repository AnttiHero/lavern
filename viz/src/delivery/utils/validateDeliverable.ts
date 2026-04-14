/**
 * Validate Deliverable — Frontend mirror of src/assembly/validate-deliverable.ts.
 *
 * KEEP IN SYNC with the backend version. Changes here must be reflected there.
 *
 * v19: Hardened validation — placeholder detection, content density,
 * full-text process contamination scan.
 */

// ── Process Dump Detection ────────────────────────────────────────────────

export function isProcessDump(text: string): boolean {
  const head = text.trimStart().substring(0, 500);

  const processPatterns = [
    /^I'll /i, /^I will /i, /^Let me /i, /^I need to/i, /^I see /i,
    /^I can see/i, /^I have /i, /^I've /i,
    /^First,/i, /^Now,/i, /^Now let/i, /^Next,/i,
    /^OK[,.\s]/i, /^Okay/i, /^Sure/i, /^Certainly/i,
    /^Good\./i, /^Good —/i, /^Great/i, /^Excellent/i, /^Perfect/i,
    /^Here is/i, /^Here's /i, /^Based on/i, /^The analysis/i,
    /^Below is/i, /^What follows/i, /^The following/i,
    /^Clean slate/i, /^The specialist/i, /^Both specialists/i,
    /^Let me check/i, /^I'll start/i, /^I'll now/i,
    /^I'll get started/i, /^Looking at/i, /^After review/i,
    /^Once analyzed/i, /^The process/i, /^In summary,? here/i,
    /^To begin/i, /^Starting with/i, /^Moving on/i,
  ];

  if (processPatterns.some(p => p.test(head))) return true;

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

export function processTextRatio(text: string): number {
  const paragraphs = text.split(/\n\n+/).filter(p => {
    const t = p.trim();
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
    if (processPatterns.some(p => p.test(para.trim()))) contaminated++;
  }

  return contaminated / paragraphs.length;
}

// ── Placeholder Detection ─────────────────────────────────────────────────

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

  const genericBrackets = text.match(/\[[A-Z][A-Z\s]{2,30}\]/g);
  if (genericBrackets && genericBrackets.length >= 3) {
    count += genericBrackets.length;
  }

  return count;
}

// ── Content Density Check ─────────────────────────────────────────────────

export function analyzeContentDensity(text: string): {
  sectionsWithContent: number;
  totalSections: number;
  avgCharsPerSection: number;
} {
  const sections = text.split(/^(?=#{1,6}\s)/m).filter(s => s.trim());

  if (sections.length === 0) {
    return { sectionsWithContent: 0, totalSections: 0, avgCharsPerSection: 0 };
  }

  let totalBodyChars = 0;
  let sectionsWithContent = 0;

  for (const section of sections) {
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
 */
export function countEmptySections(text: string): number {
  const lines = text.split('\n');
  let emptyCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (!headingMatch) continue;
    const currentLevel = headingMatch[1].length;

    // A parent heading followed by deeper sub-headings is a container, not empty.
    let hasContent = false;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();
      if (!nextLine || nextLine === '---' || nextLine === '***') continue;
      const nextHeadingMatch = nextLine.match(/^(#{1,6})\s/);
      if (nextHeadingMatch) {
        if (nextHeadingMatch[1].length > currentLevel) hasContent = true;
        break;
      }
      hasContent = true;
      break;
    }

    if (!hasContent) emptyCount++;
  }

  return emptyCount;
}

// ── Main Validation ───────────────────────────────────────────────────────

/**
 * Structural validation with placeholder detection and process contamination scan.
 * KEEP IN SYNC with src/assembly/validate-deliverable.ts.
 */
export function validateDeliverable(text: string): { valid: boolean; reason?: string } {
  if (!text) return { valid: false, reason: 'empty' };

  const trimmed = text.trim();

  if (trimmed.length < 500) return { valid: false, reason: 'too_short' };
  if (!trimmed.startsWith('#')) return { valid: false, reason: 'no_heading' };
  if (isProcessDump(text)) return { valid: false, reason: 'process_text' };

  const headingCount = (trimmed.match(/^#{1,6}\s/gm) || []).length;
  if (headingCount < 3) return { valid: false, reason: 'no_structure' };

  const density = analyzeContentDensity(trimmed);
  if (density.sectionsWithContent < 2 || density.avgCharsPerSection < 100) {
    return { valid: false, reason: 'thin_content' };
  }

  const emptySections = countEmptySections(trimmed);
  if (emptySections > 2) return { valid: false, reason: 'empty_sections' };

  // Excessive placeholders — ≥5 indicates unfinished garbage
  const placeholderCount = countPlaceholders(trimmed);
  if (placeholderCount >= 5) return { valid: false, reason: 'excessive_placeholders' };

  // Full-text process contamination — 5% threshold
  const contamination = processTextRatio(trimmed);
  if (contamination > 0.05) return { valid: false, reason: 'process_contamination' };

  return { valid: true };
}
