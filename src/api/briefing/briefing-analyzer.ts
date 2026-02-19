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

const MAX_CONTENT_PER_DOC = 8000;

/**
 * Build the user prompt from the request data.
 */
function buildUserPrompt(req: BriefingAnalyzeRequest): string {
  const parts: string[] = [];

  parts.push(`## Engagement Type: ${req.workflowId}`);
  parts.push('');

  // Documents
  if (req.documents.length > 0) {
    parts.push('## Uploaded Documents');
    for (const doc of req.documents) {
      const truncated = doc.content.length > MAX_CONTENT_PER_DOC
        ? doc.content.slice(0, MAX_CONTENT_PER_DOC) + '\n[...truncated]'
        : doc.content;
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
    ?? 'claude-haiku-3-5-20250929';

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
