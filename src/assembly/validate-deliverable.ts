/**
 * Validate Deliverable — Shared validation for assembled documents.
 *
 * Ensures that the output served to clients is an actual legal document,
 * not orchestrator internal thinking / process logs.
 *
 * Used by:
 *   - document-assembler.ts (post-assembly validation)
 *   - sessions.ts download endpoint (final safety gate)
 *   - claw/delivery.ts (Claw mode delivery gate)
 *
 * The frontend has a mirror of isProcessDump() in
 * viz/src/delivery/utils/validateDeliverable.ts.
 */

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

/**
 * Validate that a text is a legitimate deliverable document.
 *
 * Returns { valid: true } if the text passes all checks, or
 * { valid: false, reason } describing why it failed.
 */
export function validateDeliverable(text: string): { valid: boolean; reason?: string } {
  if (!text) return { valid: false, reason: 'empty' };

  const trimmed = text.trim();

  // A real legal document is at least 500 chars
  if (trimmed.length < 500) return { valid: false, reason: 'too_short' };

  // Must start with a markdown heading — not process text
  if (!trimmed.startsWith('#')) return { valid: false, reason: 'no_heading' };

  // Must not be a process dump
  if (isProcessDump(text)) return { valid: false, reason: 'process_text' };

  // A real document has structure — at least 3 headings
  const headingCount = (trimmed.match(/^#{1,6}\s/gm) || []).length;
  if (headingCount < 3) return { valid: false, reason: 'no_structure' };

  return { valid: true };
}
