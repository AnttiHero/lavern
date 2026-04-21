/**
 * Briefing Analyzer — LLM call for intelligent intake analysis.
 *
 * Follows the exact same pattern as llmClassify() in src/router/router.ts:
 * - Single-turn query() with structured output via zodToOutputFormat()
 * - No tools, no agents
 * - Haiku model for speed and cost (~$0.01/call)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { briefingAnalyzerPrompt } from './briefing-prompt.js';
import {
  BriefingAnalyzeResponseSchema,
  type BriefingAnalyzeRequest,
  type BriefingAnalyzeResponse,
} from './briefing-schema.js';
import { zodToOutputFormat } from '../../types/output-schemas.js';
import { config } from '../../config.js';

const MAX_CONTENT_PER_DOC = 12_000;

/** Legal section headings to prioritize in truncation. */
const PRIORITY_SECTIONS = [
  'definition', 'obligation', 'liability', 'indemnif', 'terminat',
  'confidential', 'governing', 'warranty', 'limitation', 'intellectual',
  'payment', 'represent', 'covenant', 'default', 'force majeure',
];

/**
 * Intelligently truncate document content, prioritizing key legal sections.
 * If the document has structural data (sections), uses that for smarter selection.
 */
function smartTruncate(content: string, sections?: Array<{ heading: string; content: string }>, maxChars = MAX_CONTENT_PER_DOC): string {
  if (content.length <= maxChars) return content;

  // If we have structural sections, prioritize key legal sections
  if (sections && sections.length > 0) {
    const parts: string[] = [];
    let remaining = maxChars;

    // First pass: priority sections
    for (const section of sections) {
      const headingLower = section.heading.toLowerCase();
      if (PRIORITY_SECTIONS.some(p => headingLower.includes(p))) {
        const block = `### ${section.heading}\n${section.content}\n`;
        if (block.length <= remaining) {
          parts.push(block);
          remaining -= block.length;
        } else if (remaining > 200) {
          parts.push(`### ${section.heading}\n${section.content.slice(0, remaining - 100)}\n[...truncated]\n`);
          remaining = 0;
        }
      }
    }

    // Second pass: fill remaining space with other sections
    if (remaining > 500) {
      for (const section of sections) {
        const headingLower = section.heading.toLowerCase();
        if (!PRIORITY_SECTIONS.some(p => headingLower.includes(p))) {
          const block = `### ${section.heading}\n${section.content}\n`;
          if (block.length <= remaining) {
            parts.push(block);
            remaining -= block.length;
          }
        }
      }
    }

    if (parts.length > 0) {
      return parts.join('\n') + `\n[${sections.length} total sections — key sections prioritized]`;
    }
  }

  // Fallback: simple truncation
  return content.slice(0, maxChars) + '\n[...truncated]';
}

/**
 * Build the user prompt from the request data.
 */
function buildUserPrompt(req: BriefingAnalyzeRequest): string {
  const parts: string[] = [];

  parts.push(`## Engagement Type: ${req.workflowId}`);
  parts.push('');

  // Documents — use smart truncation with structure when available
  if (req.documents.length > 0) {
    parts.push('## Uploaded Documents');
    for (const doc of req.documents) {
      // Check if this document has structural sections (from parsed data)
      const docWithSections = doc as { content: string; name: string; sections?: Array<{ heading: string; content: string }> };
      const truncated = smartTruncate(doc.content, docWithSections.sections);
      parts.push(`### ${doc.name}`);
      parts.push(truncated);
      parts.push('');
    }
  } else {
    parts.push('## Documents: None provided');
    parts.push('');
  }

  // Static Q&A
  if (Object.keys(req.answers).length > 0) {
    parts.push('## Client Answers (Initial Intake)');
    for (const [qId, answer] of Object.entries(req.answers)) {
      if (answer.trim()) {
        parts.push(`**${qId}:** ${answer}`);
      }
    }
    parts.push('');
  }

  // Follow-up Q&A (from previous round)
  if (req.followUpAnswers && Object.keys(req.followUpAnswers).length > 0) {
    parts.push('## Client Answers (Follow-Up Round)');
    for (const [qId, answer] of Object.entries(req.followUpAnswers)) {
      if (answer.trim()) {
        parts.push(`**${qId}:** ${answer}`);
      }
    }
    parts.push('');
  }

  // Final instructions
  if (req.finalInstructions?.trim()) {
    parts.push('## Final Client Instructions');
    parts.push(req.finalInstructions.trim());
    parts.push('');
  }

  parts.push('---');
  parts.push('Analyze the above and produce the sufficiency assessment, follow-up questions (if needed), and engagement brief.');

  return parts.join('\n');
}

/**
 * Call the LLM to analyze the briefing and return structured output.
 */
export async function analyzeBriefing(
  req: BriefingAnalyzeRequest,
): Promise<BriefingAnalyzeResponse> {
  const userPrompt = buildUserPrompt(req);
  const model = (config as Record<string, unknown>).briefingModel as string | undefined
    ?? 'claude-sonnet-4-5';

  const result = query({
    prompt: userPrompt,
    options: {
      systemPrompt: briefingAnalyzerPrompt,
      model,
      maxTurns: 1,
      outputFormat: zodToOutputFormat(BriefingAnalyzeResponseSchema),
    },
  });

  // Consume the async generator to get the result
  let analysisResult: BriefingAnalyzeResponse | null = null;

  for await (const message of result) {
    if ('type' in message && message.type === 'result') {
      const resultMessage = message as Record<string, unknown>;
      if (resultMessage.subtype === 'success' && resultMessage.structured_output) {
        const parsed = BriefingAnalyzeResponseSchema.safeParse(resultMessage.structured_output);
        if (parsed.success) {
          analysisResult = parsed.data;
        }
      }
    }
  }

  if (!analysisResult) {
    throw new Error('Briefing analyzer did not return a valid response');
  }

  return analysisResult;
}
