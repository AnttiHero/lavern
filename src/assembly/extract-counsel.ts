/**
 * Counsel Document Extractor — deterministic, zero-LLM extraction of the
 * specialist's drafted document from session.finalOutput.
 *
 * For the Counsel workflow, the specialist already produced the complete
 * deliverable (e.g., a Terms of Service) inline during execution. The
 * previous assembler fired another expensive Claude call just to "extract"
 * that same document, then ran a validator + retry loop that could stall
 * for 2.5 minutes.
 *
 * This extractor does it in microseconds with pure string manipulation.
 *
 * Heuristic:
 *   1. Find the first top-level markdown heading (# ) in finalOutput.
 *   2. Take everything from there to end-of-document.
 *   3. Strip trailing orchestrator epilogue (common handoff markers, agent
 *      commentary, "Now dispatching...", etc.).
 *   4. Return the cleaned block, or '' if it doesn't look like a coherent
 *      document (too short, mostly process text, etc.).
 *
 * If extraction returns '', the caller falls back to the LLM assembly.
 */

/** Minimum length for extraction to be considered successful. */
const MIN_EXTRACTED_CHARS = 2000;

/** Phrases that signal orchestrator narrative (not document content). */
const ORCHESTRATOR_EPILOGUE_MARKERS = [
  /^\s*(Now|Then)\s+dispatching/im,
  /^\s*Handoff (to|complete|recorded)/im,
  /^\s*Session\s+complete/im,
  /^\s*Dispatching\s+(the|a|to)/im,
  /^\s*The specialist\s+(has|will|should)/im,
  /^\s*The deliverable is\s+(complete|ready|delivered)/im,
  /^\s*I'll\s+(now|next|start)/im,
  /^\s*Let me\s+(now|next|start|dispatch)/im,
  /^\s*\*\*Specialist:\*\*/m,
  /^\s*\*\*Orchestrator:\*\*/m,
  /^\s*Good\.\s+(Intake|Triage|Specialist)/im,
];

/**
 * Extract the specialist's drafted document from a finalOutput process log.
 *
 * @param finalOutput Full process log containing orchestrator narrative +
 *                    specialist's drafted document.
 * @returns The extracted document, or '' if extraction heuristics fail.
 */
export function extractCounselDocument(finalOutput: string): string {
  if (!finalOutput || finalOutput.length < MIN_EXTRACTED_CHARS) return '';

  // Step 1: Find the first top-level heading. Legal deliverables almost
  // always start with "# Title" (ToS, contract, memo, policy).
  const firstHeadingMatch = finalOutput.match(/^#\s+\S/m);
  if (!firstHeadingMatch) return '';

  const headingIndex = finalOutput.indexOf(firstHeadingMatch[0]);
  let extracted = finalOutput.substring(headingIndex);

  // Step 1.5: Decode any literal escape sequences the orchestrator may have
  // emitted (Opus sometimes writes "\\n\\n" instead of real newlines when it
  // re-quotes contract text inside its own output). Without this, the
  // delivered memo renders as one giant unbroken paragraph in the UI.
  if (/\\[ntr]/.test(extracted)) {
    extracted = extracted
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"');
  }

  // Step 2: Trim trailing orchestrator epilogue. Scan line-by-line from the
  // end looking for the last line that's part of the document (prose,
  // heading, or list item) and NOT an orchestrator marker.
  extracted = stripTrailingEpilogue(extracted);

  // Step 3: Sanity checks — must be substantial and look like a document.
  if (extracted.length < MIN_EXTRACTED_CHARS) return '';
  if (!looksLikeDocument(extracted)) return '';

  return extracted.trim();
}

/**
 * Walk backward from the end of the text, dropping lines that look like
 * orchestrator narrative. Stop when we hit a line that looks like document
 * content (heading, list item, or prose paragraph with no narrative markers).
 */
function stripTrailingEpilogue(text: string): string {
  const lines = text.split('\n');
  let lastContentLine = lines.length - 1;

  // Walk backward, skipping blank lines and orchestrator markers
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines
    if (!trimmed) continue;

    // Is this line an orchestrator marker?
    const isEpilogue = ORCHESTRATOR_EPILOGUE_MARKERS.some(p => p.test(line));
    if (isEpilogue) continue;

    // Is this a markdown heading, list item, blockquote, table row, or
    // horizontal rule? These are definitely document content.
    if (/^#{1,6}\s/.test(trimmed)) { lastContentLine = i; break; }
    if (/^[-*+]\s/.test(trimmed)) { lastContentLine = i; break; }
    if (/^\d+\.\s/.test(trimmed)) { lastContentLine = i; break; }
    if (/^>/.test(trimmed)) { lastContentLine = i; break; }
    if (/^\|/.test(trimmed)) { lastContentLine = i; break; }
    if (trimmed === '---' || trimmed === '***') { lastContentLine = i; break; }

    // Is this a "prose" line — long enough, no narrative first-person?
    const hasNarrativePrefix =
      /^(I'll|I will|I've|I have|Let me|Now|Next|OK|Okay|Good|Alright)/i.test(trimmed);
    if (!hasNarrativePrefix && trimmed.length > 20) {
      lastContentLine = i;
      break;
    }

    // Otherwise keep walking back.
  }

  return lines.slice(0, lastContentLine + 1).join('\n');
}

/**
 * Sanity check: does the extracted text look like a markdown document
 * rather than a process log? Requires:
 *   - ≥3 markdown headings
 *   - <20% of non-blank lines start with narrative prefixes ("I'll", "Let me", etc.)
 */
function looksLikeDocument(text: string): boolean {
  const lines = text.split('\n');
  const nonBlank = lines.filter(l => l.trim().length > 0);
  if (nonBlank.length === 0) return false;

  const headings = nonBlank.filter(l => /^#{1,6}\s/.test(l.trim()));
  if (headings.length < 3) return false;

  const narrativeLines = nonBlank.filter(l =>
    /^\s*(I'll|I will|I've|I have|Let me|Now|Next|OK|Okay|Good|Alright|Then|First,|The specialist|The ethics|The evaluator)/i.test(l)
  );
  const narrativeRatio = narrativeLines.length / nonBlank.length;
  if (narrativeRatio > 0.20) return false;

  return true;
}
