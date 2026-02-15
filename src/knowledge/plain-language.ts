/**
 * Plain language transformation knowledge extracted from Legal Design Plugin.
 * Word substitutions, sentence structure rules, readability targets.
 */

export const plainLanguageKnowledge = `
## Principles

1. Legal effect must remain identical
2. Write for the reader, not the lawyer
3. Examples over abstractions
4. Active voice, short sentences
5. Don't hide important information

## Word Substitutions

| Legalese | Plain English |
|----------|---------------|
| Notwithstanding | Despite / Even if |
| Hereinafter | From now on / [use actual name] |
| Shall | Must / Will |
| Prior to | Before |
| Subsequent to | After |
| In the event that | If |
| In accordance with | Under / Following |
| Pursuant to | Under / According to |
| With respect to | About / Regarding |
| Aforementioned | [Name the thing] |
| Herein, hereto, hereby | In this agreement |
| Whereas | [Delete] |
| Now therefore | [Delete] |
| Witnesseth | [Delete] |

## Sentence Structure Rules

| Pattern | Transform To |
|---------|-------------|
| Multiple clauses in one sentence | One idea per sentence |
| Passive voice | Active voice (who does what) |
| Nested conditions | Sequential if/then statements |
| Double negatives | Positive statements |
| Wall of text | Headed sections |
| Numbered-only paragraphs | Number + descriptive heading |
| Buried key terms | Front-loaded key terms |
| Definitions at end | Define on first use |
| Cross-references | Direct statements |

## Readability Targets

| Audience | FK Grade | Sentence Length | Passive Voice | Paragraphs |
|----------|----------|----------------|---------------|------------|
| Consumer | 8 or below | 18 words max | Under 10% | 3-4 sentences |
| SMB | 10 or below | 20 words max | Under 10% | 3-4 sentences |
| Enterprise | 12 or below | 22 words max | Under 15% | 4-5 sentences |
| Employee | 10 or below | 20 words max | Under 10% | 3-4 sentences |

## Handling Ambiguity

When meaning is unclear:
1. Provide the most likely plain-language interpretation
2. Mark with [LEGAL REVIEW NEEDED]
3. Note the ambiguity
4. Suggest verification with counsel

## Quick Example

**Before**:
> Notwithstanding any other provision of this Agreement to the contrary, in the event that the Customer fails to remit payment of the applicable fees within thirty (30) calendar days of the invoice date, the Company shall have the right to suspend the Customer's access without further notice.

**After**:
> **Late Payment**: If you don't pay within 30 days of your invoice, we may suspend your access without notice.
`;
