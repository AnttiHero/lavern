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

  // Step 0: Aggressively strip transcript noise. Multi-agent workflows
  // (Review / Full-Bench) produce finalOutput containing the orchestrator's
  // narration interleaved with raw subagent JSON envelopes (token counts,
  // agentIds, internal prompts). None of that should ever appear in a
  // client deliverable. Strip it before extraction.
  let cleaned = finalOutput;

  // 0.a — strip JSON envelopes from subagent transcripts. These look like:
  //   {"status":"completed","prompt":"You are ...","agentId":"abc","content":[...],"totalDurationMs":12345,...}
  // Match ANY {...} block whose content includes one of these telltale keys.
  // Iterative replacement to handle nested cases.
  for (let pass = 0; pass < 6; pass++) {
    const before = cleaned.length;
    cleaned = cleaned.replace(/\{[^{}]*"(?:totalDurationMs|totalTokens|totalToolUseCount|agentId|cache_creation_input_tokens|cache_read_input_tokens|service_tier|inference_geo|ephemeral_5m_input_tokens)"[^{}]*\}/g, '');
    if (cleaned.length === before) break;
  }
  // Also strip larger envelopes that wrap a `prompt` block (evaluator/specialist re-dispatch).
  cleaned = cleaned.replace(/\{"status":"completed","prompt":"[\s\S]{0,40000}?"\}\}?/g, '');
  cleaned = cleaned.replace(/\{"agentId":"[a-z0-9]+","content":\[[\s\S]{0,40000}?\]\}/g, '');

  // 0.b — decode HTML entities that crept in via subagent transcripts
  if (/&(?:quot|apos|amp|lt|gt|#39);/.test(cleaned)) {
    cleaned = cleaned
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  // 0.c — strip orchestrator workflow chatter that happens between sections.
  // Each pattern is matched at line scope.
  const NOISE_LINE_PATTERNS = [
    /^Specialist analysis complete\.?.*$/im,
    /^Now (?:advancing|dispatching|requesting|running|retrieving).*$/im,
    /^The (?:evaluator|plain-language|specialist) sub-agent.*$/im,
    /^I'll (?:produce|re-dispatch|now|next|start).*$/im,
    /^All \d+ (?:debates|findings) resolved\.?.*$/im,
    /^Resolving all .* findings.*$/im,
    /^Workflow complete\..*$/im,
    /^Final summary for the user.*$/im,
    /^Two RED findings on the debate board.*$/im,
    /^Coherence audit tool returned.*$/im,
    /^Human gate approved.*$/im,
    /^Closing out the workflow.*$/im,
    // v0.14.7 — patterns surfaced by Gemini/Claude blind eval (Apr 2026)
    /^Acknowledged\.?\s*Budget:.*$/im,
    /^The (?:Counsel|Review|Full-Force|Full-Bench) workflow is complete\.?.*$/im,
    /^Final spend:\s*\$.*budget.*$/im,
    /^Final spend:\s*\$.*remaining.*$/im,
    /^Pipeline (?:summary|integrity):.*$/im,
    /^Evaluator gate (?:passed|failed)(?:\s+at\s+[\d.]+)?\s*(?:on first attempt)?.*$/im,
    /^Self-verification V?-?\d+\s+(?:PASSED|FAILED).*$/im,
    /^Decomposition Rationale:.*$/im,
    /^Verification Report:.*$/im,
    /^Workflow Status:.*$/im,
    /^Budget:\s*\$\d/im,
    /^Three resolutions flagged for human escalation.*$/im,
    /^All \d+ workflow steps completed.*$/im,
    /^\d+\/\d+ workflow steps completed.*$/im,
    /^Confidence:\s*\d+%\.?\s*$/im,
  ];
  for (const re of NOISE_LINE_PATTERNS) {
    cleaned = cleaned.replace(re, '');
  }

  // v0.14.7 — strip multi-line "Verification Report" / "Pipeline" blocks
  // (these have a header line then 3-7 indented bullet lines underneath).
  // A line that looks like a transcript header followed by bulleted internal
  // metrics (PASSED/FAILED/SCORE/criteria) gets the whole block removed.
  cleaned = cleaned.replace(
    /^(?:Verification Report|Pipeline (?:summary|integrity)|Workflow Status|Decomposition Rationale)[^\n]{0,200}\n(?:[\s\-•*]*(?:Self-verification|Evaluator gate|All \d+|Three resolutions|Human gate|\d+\/\d+|PASSED|FAILED|criteria|workflow steps)[^\n]{0,300}\n?){1,8}/gim,
    '',
  );

  // Step 1: Find the substantive deliverable start. Prefer strong markers
  // (MEMORANDUM, BOARD BRIEFING, EXECUTIVE SUMMARY) over the first `# `
  // because Review orchestrators sometimes emit "# CONCLUSION" early before
  // dispatching specialists who produce the real memo later.
  const STRONG_MARKERS = [
    /^#+\s*(?:MEMORANDUM|BOARD BRIEFING|EXECUTIVE SUMMARY|FINAL DELIVERABLE|DELIVERY PACKAGE)\b.*$/im,
    /^COBARIDGE BOARD BRIEFING\b.*$/im,
    /^MEMORANDUM OF ADVICE\b.*$/im,
    /^Re:\s+.{5,200}$/im,
  ];
  let startIdx = -1;
  for (const re of STRONG_MARKERS) {
    const m = cleaned.match(re);
    if (m) {
      const idx = cleaned.indexOf(m[0]);
      if (startIdx < 0 || idx < startIdx) startIdx = idx;
    }
  }
  // Fallback: first top-level markdown heading
  if (startIdx < 0) {
    const firstHeadingMatch = cleaned.match(/^#\s+\S/m);
    if (firstHeadingMatch) startIdx = cleaned.indexOf(firstHeadingMatch[0]);
  }
  if (startIdx < 0) return '';

  let extracted = cleaned.substring(startIdx);

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

  // Step 1.7: Hard-stop at terminal narration markers. These appear AFTER the
  // deliverable when the orchestrator narrates wrap-up.
  const HARD_STOP_MARKERS = [
    // v0.14.7 — orchestrator's own end-of-deliverable marker. Must be the
    // bold form that the orchestrator actually emits — bare phrase matches
    // would catch legitimate prose like "at the end of advice that comes…"
    /\*\*End of Advice\*\*/,                 // exact bold marker (case-sensitive)
    /\*\*\s*End of Memo\s*\*\*/i,            // alternate emitted variant
    /^End of Advice\s*$/m,                   // standalone line form
    /\nNow (?:dispatching|advancing|requesting|running|retrieving)/i,
    /\nWorkflow complete\./i,
    /\nFinal summary for the user/i,
    /\nPIPELINE INTEGRITY/i,
    /\nWorkflow Complete\b/i,
    /\nAcknowledged\.?\s*Budget:/i,
    /\nFinal spend:\s*\$/i,
    /\nThe (?:Counsel|Review|Full-Force|Full-Bench) workflow is complete\b/i,
    /\nPipeline (?:summary|integrity):/i,
    /\nVerification Report:/i,
    /\nDecomposition Rationale:/i,
    /\nWorkflow Status:/i,
    /\nSelf-verification V?-?\d+/i,
  ];
  let explicitEndHit = false;
  for (const re of HARD_STOP_MARKERS) {
    const m = extracted.match(re);
    if (m && m.index !== undefined) {
      // "End of Advice" / "**End of Advice**" is the orchestrator's own
      // explicit terminator — trim there unconditionally, even if the
      // upstream content is shorter than MIN_EXTRACTED_CHARS. A thin but
      // clean conclusion beats a transcript dump.
      const isExplicitEnd = /End of (?:Advice|Memo)/i.test(re.source);
      if (isExplicitEnd || m.index > MIN_EXTRACTED_CHARS) {
        extracted = extracted.substring(0, m.index);
        if (isExplicitEnd) explicitEndHit = true;
        break;
      }
    }
  }

  // Step 2: Trim trailing orchestrator epilogue. Scan line-by-line from the
  // end looking for the last line that's part of the document (prose,
  // heading, or list item) and NOT an orchestrator marker.
  extracted = stripTrailingEpilogue(extracted);

  // Step 3: Sanity checks — must be substantial and look like a document.
  // EXCEPTION: when the orchestrator emitted an explicit "End of Advice"
  // terminator, we trust that what's before it is the deliverable — even
  // if thinner than usual. The downstream LLM cleanup pass will further
  // refine if needed.
  const RELAXED_MIN = 500;
  const minRequired = explicitEndHit ? RELAXED_MIN : MIN_EXTRACTED_CHARS;
  if (extracted.length < minRequired) return '';
  if (!explicitEndHit && !looksLikeDocument(extracted)) return '';

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
