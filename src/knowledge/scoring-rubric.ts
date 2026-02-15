/**
 * Scoring rubric knowledge extracted from Legal Design Plugin.
 * Five dimensions scored 0-4, mapped to RED/YELLOW/GREEN.
 * Complexity Tax formula and confidence indicators.
 */

export const scoringRubricKnowledge = `
## Scoring Scale

| Score | Classification | Action |
|-------|---------------|--------|
| 0-1 | RED | Must fix before publishing |
| 2 | YELLOW | Should address |
| 3-4 | GREEN | Minor polish or preserve |

**Overall Score** = average of five dimensions. 3.5-4.0 Excellent, 2.5-3.4 Good, 1.5-2.4 Fair, 0.5-1.4 Poor, 0-0.4 Critical.

## Dimension 1: Readability

| Score | FK Grade | Avg Sentence | Passive Voice |
|-------|----------|-------------|---------------|
| 4 | 8 or below | 18 words or fewer | Under 10% |
| 3 | 9-10 | 19-22 words | 10-20% |
| 2 | 11-13 | 23-30 words | 20-35% |
| 1 | 14-16 | 31-40 words | 35-50% |
| 0 | Above 16 | Over 40 words | Over 50% |

**Audience targets**: Grade 8 consumer, Grade 10 SMB/employee, Grade 12 enterprise.
**Paragraph density**: GREEN 3-4 sentences. YELLOW 5 sentences. RED 6+.
**Bonus** (+1, max 4): Jargon defined on first use, short paragraphs, active voice dominant.
**Penalty** (-1): Undefined technical terms, re-read required, double negatives.

## Dimension 2: Findability

| Item | Target Time |
|------|------------|
| How to cancel | 30 sec |
| What data is collected | 30 sec |
| Payment/renewal terms | 30 sec |
| Contact for questions | 15 sec |
| Main obligations | 60 sec |

Score: 5/5 found = 4, 4/5 = 3, 3/5 = 2, 2/5 = 1, under 2 = 0.

**RED flags**: Obligations buried after page 3, rights separated from obligations, definitions at end only, deadlines mentioned once and buried.

## Dimension 3: Clarity

Start at 4. Subtract 0.5 per unchecked item:
- Obligations in active voice
- Deadlines with specific timeframes
- Consequences follow from obligations
- Mutual vs. one-sided obligations distinguished
- Exceptions clearly stated
- Rights with actionable instructions
- All key terms defined
- No contradictions between sections

## Dimension 4: Visual Design

| Score | Hierarchy | Whitespace | Formatting |
|-------|-----------|-----------|------------|
| 4 | Clear H1-H2-H3, logical flow | Generous | Consistent |
| 3 | Good hierarchy, minor issues | Adequate | Minor inconsistencies |
| 2 | Weak hierarchy | Cramped | Notable inconsistencies |
| 1 | Flat structure | Wall of text | Inconsistent |
| 0 | No hierarchy | Unreadable density | Chaotic |

**Typography specs**: Body 11-12pt, headings 14-18pt, line spacing 1.3-1.5x, line length 50-75 chars, contrast 4.5:1 minimum.

**Anti-patterns** (subtract 0.5 each): Wall of text, ALL CAPS body, tiny footnotes (<8pt), inconsistent numbering, centered body text, low contrast.

## Dimension 5: Ethics

Start at 4. Subtract 1 per dark pattern (minimum 0):
- Pre-ticked consent boxes
- Asymmetric button design
- Hidden auto-renewal
- Buried cancellation
- Artificial urgency
- Confusing opt-out
- Visual misdirection
- Coercive/shaming language

## Complexity Tax

Formula: Tax = (Word Count / 200) x Difficulty Multiplier x Re-read Factor

| FK Grade | Multiplier |
|----------|-----------|
| 8 or below | 1.0x |
| 9-10 | 1.3x |
| 11-13 | 1.7x |
| 14-16 | 2.2x |
| Above 16 | 3.0x |

Re-read Factor: Clear 1.0x, Confusing 1.5x, Very poor 2.0x.

Always show current vs. achievable. Express as "X min/reader" and "At N users = Y hours saved."

## Confidence

| Level | When |
|-------|------|
| High | Type, audience, jurisdiction all known |
| Medium | Some inferred |
| Low | Significant context missing |
`;
