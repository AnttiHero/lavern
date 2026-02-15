/**
 * Meaning preservation protocol extracted from Legal Design Plugin.
 * Dual artifact output, change logs, ambiguity flags, non-negotiables, escalation rules.
 */

export const meaningPreservationKnowledge = `
## Dual Artifact Rule

Every transformation produces TWO outputs:

**Artifact 1: User-Facing Version** — Clean document for end users. No annotations.

**Artifact 2: Legal Review Package** — For legal verification:
- Change log with risk levels
- Ambiguity flags
- Non-negotiables checklist
- Side-by-side comparisons for significant changes

## Change Log

Document every substantive change:

| # | Section | Original | Transformed | Intent | Risk |
|---|---------|----------|-------------|--------|------|
| 1 | [ref] | [exact quote] | [new text] | [why changed] | [level] |

**Risk Levels**:
- **Low** — Cosmetic, meaning clearly preserved (e.g., "prior to" to "before")
- **REVIEW** — Potential meaning shift, needs legal check (e.g., "indemnify" to "protect and pay for")
- **CRITICAL** — Significant change to rights/obligations, must verify

## Ambiguity Flags

When transformation may have shifted meaning:

### Flag [N]: [Section] — [Topic]
**Original**: [exact quote]
**Transformed**: [new version]
**Concern**: [what might have shifted]
**Recommendation**: [what to verify]

## Non-Negotiables Checklist

These must be preserved exactly:

| Category | Elements to Verify |
|----------|-------------------|
| **Amounts** | Liability caps, payment amounts, penalties |
| **Time** | Notice periods, deadlines, cure periods, term length |
| **Jurisdiction** | Governing law, venue, arbitration terms |
| **Mechanisms** | Dispute resolution, termination triggers, renewal terms |
| **Definitions** | Defined terms with specific legal scope |
| **Insurance** | Coverage requirements, limits |
| **Compliance** | Regulatory language (GDPR, CCPA, etc.) |

Output format:

| Element | Original Value | Preserved? | Notes |
|---------|---------------|------------|-------|
| [term] | [value] | Yes/No | [notes] |

## Five Legal Meaning Checkpoints

Run before finalizing any transformation:

1. **Rights preserved** — All user rights present, none removed
2. **Obligations clear** — All captured, deadlines exact, consequences stated
3. **Definitions consistent** — Terms used consistently, scope preserved
4. **Risk allocation unchanged** — Liability caps, indemnification, insurance preserved
5. **Dispute resolution intact** — Governing law, arbitration, venue preserved

## Escalation Rules

**Always flag for legal review**:
- Indemnification language changes
- Liability limitation modifications
- Dispute resolution term changes
- Defined terms with specific legal meanings simplified
- Any change to rights, obligations, or consequences
- Jurisdiction-specific regulatory language

**Safe without escalation**:
- "Herein" to "in this agreement"
- "Prior to" to "before"
- "Notwithstanding" to "despite" (when context clear)
- Passive to active voice (when subject unambiguous)
- Sentence splitting (when meaning clearly preserved)
`;
