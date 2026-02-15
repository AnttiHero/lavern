/**
 * Ethics audit / dark pattern detection knowledge extracted from Legal Design Plugin.
 * Seven categories, compliance touchpoints, severity ratings, output format.
 */

export const ethicsAuditKnowledge = `
## Seven Dark Pattern Categories

| # | Category | What to Scan For | Severity |
|---|----------|-----------------|----------|
| 1 | **Information Overload** | Excessive length, fragmented info, discouraging complexity, legalese walls | YELLOW |
| 2 | **Default Manipulation** | Pre-ticked boxes, opt-out instead of opt-in, pre-selected add-ons | RED |
| 3 | **Visual Nudging** | Asymmetric buttons, color manipulation, size differences between accept/decline | RED |
| 4 | **Time Pressure** | Countdown timers, artificial urgency, expiring offers on legal terms | RED |
| 5 | **Hidden Information** | Buried terms, small print, key info scattered across sections, auto-renewal hidden | RED |
| 6 | **Illusory Control** | Choices that don't affect outcomes, excessive toggles that all default on | YELLOW |
| 7 | **Coercive Language** | Shaming, threats, guilt trips, "Are you sure you want to miss out?" | RED |

## Compliance Touchpoints

**GDPR (EU)**:
- Art. 7: Consent must be freely given, specific, informed, unambiguous
- Art. 7(3): Withdrawal must be as easy as giving consent
- Art. 12: Information must be concise, transparent, easily accessible

**FTC (US)**:
- Deceptive practices: Design that misleads consumers about choices
- Negative option rule: Cancellation must be simple and straightforward
- ROSCA: Material terms must be clearly disclosed before billing

**CCPA (California)**:
- 1798.135: "Do Not Sell" must be clear and easy
- 1798.120: Right to opt out must be accessible

**CPA (UK)**:
- Unfair commercial practices: Misleading actions or omissions
- Consumer Rights Act: Terms must be fair and transparent

Note: Flag regulatory concerns but state clearly these are potential issues for legal counsel to evaluate, not legal determinations.

## Severity Ratings

- **RED (Manipulative)**: Active manipulation that exploits user psychology. Must fix before publishing.
- **YELLOW (Problematic)**: Design choices that may disadvantage users, even if not intentionally manipulative. Should review.
- **GREEN (Ethical)**: Practices that respect user autonomy. Preserve these.

## Output Format

Structure ethics audit output as:

# Ethics Audit: [Document Name]

**Context**: [moment] | **Jurisdiction**: [region] | **Channel**: [web/mobile/print]

## Summary

| Rating | Count | Action |
|--------|-------|--------|
| RED (Manipulative) | [N] | Must fix |
| YELLOW (Problematic) | [N] | Should review |
| GREEN (Ethical) | [N] | Preserve |

**Overall Ethics Rating**: [RED/YELLOW/GREEN] — [one-line summary]

## Part 1: Manipulation Patterns

### RED — Manipulative Patterns

#### [N]. [Pattern Name]
**Category**: [one of seven categories]
**Location**: [where in document/UI]
**Evidence**: [exact quote or description]
**Why it's manipulative**: [explanation]

### YELLOW — Problematic Patterns

#### [N]. [Pattern Name]
**Category**: [category]
**Location**: [where]
**Evidence**: [quote or description]
**Concern**: [explanation]

### GREEN — Ethical Practices

- [list of good practices found]

## Part 2: Compliance Touchpoints

**Note**: These are potential regulatory concerns, not legal determinations. Consult legal counsel.

### [Regulation Name] ([Region])

| Issue | Article/Section | Concern |
|-------|----------------|---------|
| [issue] | [reference] | [explanation] |

## Part 3: Design Alternatives

### For [Pattern Name]

**Current**: [exact current text or UI description]
**Ethical Alternative**: [replacement]
**Implementation**: [how to make the change]

## Verification Checklist

Before publishing, verify:

### Consent
- [ ] All consent boxes start unchecked
- [ ] Equal visual treatment for accept/decline
- [ ] No time pressure on consent decisions
- [ ] Withdrawal as easy as giving consent

### Information Access
- [ ] Key terms prominent, not buried
- [ ] Readable font size (10pt+ minimum)
- [ ] Cancellation easily findable
- [ ] Auto-renewal clearly stated

### User Respect
- [ ] No shaming of privacy-protective choices
- [ ] No artificial urgency
- [ ] Meaningful choices (not illusory)
- [ ] Dignified exit process

## Notes

- This tool scans for patterns, not legal violations. False positives are possible.
- Always quote specific evidence from the document — never classify without showing why
- When in doubt, flag it as YELLOW rather than ignoring it
- Remind the user that this analysis should inform but not replace legal counsel
`;
