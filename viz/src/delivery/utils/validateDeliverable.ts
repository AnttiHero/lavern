/**
 * Validate Deliverable — Frontend mirror of src/assembly/validate-deliverable.ts.
 *
 * Used by TheWorkTab and DownloadPanel to detect process dumps before
 * showing previews or enabling downloads.
 */

/**
 * Detect whether text looks like orchestrator process output
 * rather than an actual deliverable document.
 */
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

/**
 * Validate that text is a legitimate deliverable document.
 */
export function validateDeliverable(text: string): { valid: boolean; reason?: string } {
  if (!text) return { valid: false, reason: 'empty' };

  const trimmed = text.trim();

  if (trimmed.length < 500) return { valid: false, reason: 'too_short' };
  if (!trimmed.startsWith('#')) return { valid: false, reason: 'no_heading' };
  if (isProcessDump(text)) return { valid: false, reason: 'process_text' };

  const headingCount = (trimmed.match(/^#{1,6}\s/gm) || []).length;
  if (headingCount < 3) return { valid: false, reason: 'no_structure' };

  return { valid: true };
}
