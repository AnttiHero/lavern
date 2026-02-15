/**
 * Legal sanity check knowledge extracted from Legal Design Plugin.
 * Comprehension testing, intent comparison, failure modes, before/after scoring.
 */

export const legalSanityCheckKnowledge = `
## Process

### Step 1: Read as a User Would

Skim headings, read first sentences, look for bold/highlighted content, skip dense paragraphs.

### Step 2: Summarize Understanding

Answer as the user would:
- What am I agreeing to?
- What do I have to do?
- What do I get?
- How much does it cost?
- How do I cancel?
- What happens to my data?
- What if something goes wrong?

### Step 3: Compare to Intent

| Topic | Intended Meaning | User Likely Understands | Match? |
|-------|-----------------|------------------------|--------|
| [topic] | [what it should mean] | [what user probably thinks] | MATCH / MISMATCH / UNCLEAR |

### Step 4: Flag Problems

- **CRITICAL** — User misunderstands something important. Causes complaints, disputes, harm.
- **WARNING** — User might miss something. Could cause confusion later.
- **NOTE** — Minor gap. User gets the gist.

## Common Failure Modes

| Mode | Symptom | Fix |
|------|---------|-----|
| **Lost Nuance** | Misses qualifications | Add directly: "Cancel anytime *with 30 days notice*" |
| **False Simplicity** | Suggests easier than reality | Be specific: "Industry-standard security, but no system is 100% secure" |
| **Hidden Conditions** | Conditions separated from statement | State immediately: "Free trial (credit card required, converts to paid)" |
| **Assumed Knowledge** | Assumes user knows terms | Define: "Subject to our SLA (we guarantee 99.9% uptime)" |
| **Passive Danger** | Hides who does what | Active voice: "We may increase fees once per year with 30 days notice" |

## Comprehension Test

Generate 8-12 questions covering: obligations, rights, cancellation, data, costs, consequences.

For each: question, expected answer, location in document.

**Scoring**: 10-12 correct = Excellent | 7-9 = Good | 4-6 = Fair | 0-3 = Poor

## Before/After Comparison

| Question | Original (likely correct %) | Redesigned (likely correct %) | Change |
|----------|---------------------------|------------------------------|--------|
| [topic] | [X]% | [Y]% | +[Z]% |

**Verdict**:
- Score 8+ with no critical issues: Ready to publish
- Score 5-7 or has warnings: Needs revision
- Below 5 or critical issues: Major rework needed
`;
