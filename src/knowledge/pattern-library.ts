/**
 * Design pattern library extracted from Legal Design Plugin.
 * Ten reusable patterns for legal documents.
 */

export const patternLibraryKnowledge = `
## Pattern 1: TL;DR Summary Box

**When**: Document over 1000 words or complex. **Where**: Top of document.

Template:
## At a Glance

**What this is**: [One sentence]
**Key points**:
- [Most important thing]
- [Second most important]
- [Third most important]
**What you're agreeing to**: [One sentence]
**How to get out**: [Cancellation in one line]

*Full details below*

## Pattern 2: Key Terms Table

**When**: Multiple important terms. **Where**: After summary, before detail.

Template:
## Key Terms

| What | Details |
|------|---------|
| **Cost** | [Price, billing cycle] |
| **Duration** | [Term, auto-renewal] |
| **Cancellation** | [How, notice period, refund] |
| **Your data** | [Collected, used, shared] |
| **Support** | [How to get help] |

## Pattern 3: Progressive Disclosure

**When**: Users need different detail levels. **Structure**: Summary then expandable.

Template:
## [Topic]

[2-3 sentence plain language summary]

<details>
<summary>More details</summary>
[Expanded explanation]
</details>

<details>
<summary>Full legal language</summary>
[Original legal text]
</details>

## Pattern 4: Rights Block

**When**: Listing user rights. **Where**: Early in document, high prominence.

Template:
## Your Rights

### [Right Name]
[What it means in practice]
**How to use it**: [Specific steps]

## Pattern 5: Obligations Block

**When**: Listing user obligations. **Structure**: What / When / Consequence.

Template:
## Your Responsibilities

### [Obligation Name]
**What**: [What you must do]
**When**: [Timing or trigger]
**If you don't**: [Consequence]

## Pattern 6: Cancellation Flow

**When**: Documenting how to cancel. **Principles**: Clear, direct, no guilt, no mazes.

Template:
## How to Cancel

### Option 1: Self-Service (Fastest)
1. Go to [exact location]
2. Click [exact button]
3. Confirm cancellation
4. Confirmation email within [timeframe]

### Option 2: Contact Us
Email [address] — processed within [timeframe]

### What Happens When You Cancel
- **Your access**: Continues until [when]
- **Your data**: [What happens]
- **Refunds**: [Policy]
- **Reactivation**: [How to come back]

## Pattern 7: Notice at Point of Action

**When**: Critical info at decision moment (checkout, signup, consent).

Template:
> **Before you continue**:
> - [Key fact 1]
> - [Key fact 2]
> - [Key fact 3]

## Pattern 8: FAQ Section

**When**: Common questions need direct answers. **Where**: End of document.

Template:
## Common Questions

### [Question users actually ask]?
[Direct answer, 1-3 sentences]

## Pattern 9: Inline Definitions

**When**: Legal/technical terms need explanation without breaking flow.

**Option A** (parenthetical): "We may terminate for Cause (meaning you've seriously violated these terms and didn't fix it within 30 days)."

**Option B** (following sentence): "We may terminate for Cause. 'Cause' means a serious violation you didn't fix within 30 days."

## Pattern 10: Compliance Callout

**When**: Region-specific regulatory info.

Template:
> **For users in [region]**
>
> Under [regulation], you have additional rights:
> - [Right 1]
> - [Right 2]
>
> To exercise: [contact info]

## Documenting Patterns Used

Always list which patterns were applied:

### Patterns Applied
- TL;DR Summary Box (top)
- Key Terms Table (after summary)
- Rights Block (section 2)
- Cancellation Flow (section 5)
- FAQ Section (end)
`;
