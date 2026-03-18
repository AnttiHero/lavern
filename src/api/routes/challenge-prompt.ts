/**
 * Blind Comparison Prompt — The Lavern Challenge.
 *
 * Sonnet receives two documents labeled ONLY as "Document A" and "Document B".
 * It does NOT know which is human or AI.
 * Scores each on 6 dimensions (0–100) with evidence.
 * Returns structured JSON.
 */

export const CHALLENGE_DIMENSIONS = [
  {
    name: 'Clarity & Readability',
    weight: 0.20,
    description: 'How easy is the document to understand? Considers sentence structure, paragraph length, Flesch-Kincaid readability, passive voice usage, and overall flow.',
  },
  {
    name: 'Legal Completeness',
    weight: 0.20,
    description: 'Are all necessary legal provisions present? Considers coverage of standard clauses, missing protections, regulatory compliance requirements, and industry-standard terms.',
  },
  {
    name: 'Risk Protection',
    weight: 0.20,
    description: 'How well does the document protect the drafting party? Considers liability limitations, indemnification clauses, force majeure, termination rights, and exposure gaps.',
  },
  {
    name: 'Structure & Navigation',
    weight: 0.15,
    description: 'Can a reader find what they need? Considers section organization, table of contents, cross-references, defined terms placement, and logical flow.',
  },
  {
    name: 'Plain Language',
    weight: 0.15,
    description: 'Is the document accessible to non-lawyers? Considers unnecessary jargon, Latin phrases, archaic constructions, defined term clarity, and sentence complexity.',
  },
  {
    name: 'Consistency',
    weight: 0.10,
    description: 'Is the document internally consistent? Considers defined term usage, cross-reference accuracy, numbering consistency, and contradictory provisions.',
  },
] as const;

/**
 * Build the blind comparison system prompt for the judge (Sonnet).
 */
export function buildComparisonSystemPrompt(): string {
  return `You are a senior legal document quality judge. You have been retained to perform a BLIND evaluation of two legal documents.

You will receive Document A and Document B. You do NOT know which document was created by a human lawyer and which was created by an AI system. Your evaluation must be entirely impartial and evidence-based.

## Evaluation Dimensions

Score each document on the following dimensions (0–100):

${CHALLENGE_DIMENSIONS.map((d, i) => `${i + 1}. **${d.name}** (weight: ${d.weight})
   ${d.description}`).join('\n\n')}

## Scoring Guidelines

- **90–100**: Exceptional. Best-in-class for this document type.
- **80–89**: Strong. Well-crafted with minor improvements possible.
- **70–79**: Good. Competent but with noticeable gaps or issues.
- **60–69**: Adequate. Functional but with significant room for improvement.
- **50–59**: Below average. Multiple material issues present.
- **Below 50**: Poor. Significant deficiencies that create risk or confusion.

## Requirements

1. Score each dimension independently based on the document text alone.
2. Provide specific evidence (quote or reference exact text) for each score.
3. Be precise — a 3-point difference should reflect a meaningful quality gap.
4. Do not guess which document is human vs. AI. Score purely on quality.
5. Calculate the weighted overall score for each document.

## Output Format

You MUST respond with ONLY valid JSON matching this exact structure (no markdown code fences, no commentary outside the JSON):

{
  "dimensions": [
    {
      "name": "Clarity & Readability",
      "scoreA": <number 0-100>,
      "scoreB": <number 0-100>,
      "evidenceA": "<specific evidence for Document A's score>",
      "evidenceB": "<specific evidence for Document B's score>"
    }
  ],
  "overallA": <weighted average 0-100>,
  "overallB": <weighted average 0-100>,
  "summary": "<2-3 sentence narrative comparing the two documents>"
}`;
}

/**
 * Build the user prompt containing the two documents for blind comparison.
 */
export function buildComparisonUserPrompt(docA: string, docB: string): string {
  // Truncate to prevent token overflow — keep first 30k chars of each
  const maxLen = 30_000;
  const truncA = docA.length > maxLen ? docA.slice(0, maxLen) + '\n\n[Document truncated at 30,000 characters]' : docA;
  const truncB = docB.length > maxLen ? docB.slice(0, maxLen) + '\n\n[Document truncated at 30,000 characters]' : docB;

  return `## Document A

${truncA}

---

## Document B

${truncB}

---

Evaluate both documents across all 6 dimensions. Return your scores as JSON.`;
}
