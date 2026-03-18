/**
 * TeamCostSummary — "Traditional Firm Equivalent" cost comparison.
 *
 * Shows what the selected team would bill at a traditional law firm.
 * Framed as a fun comparison ("look how much you'd save"), not a price tag.
 */

import { colors, fonts, spacing } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  selectedProfiles: AgentProfile[];
  totalCost: number;
  teamSize: number;
}

export function TeamCostSummary({ selectedProfiles, totalCost, teamSize }: Props) {
  // Count agents by cost tier
  const tierCounts = { opus: 0, sonnet: 0, haiku: 0 };
  for (const p of selectedProfiles) {
    if (p.costTier in tierCounts) {
      tierCounts[p.costTier as keyof typeof tierCounts]++;
    }
  }

  const tierParts: string[] = [];
  if (tierCounts.opus > 0) tierParts.push(`${tierCounts.opus} Opus`);
  if (tierCounts.sonnet > 0) tierParts.push(`${tierCounts.sonnet} Sonnet`);
  if (tierCounts.haiku > 0) tierParts.push(`${tierCounts.haiku} Haiku`);

  const avgCost = teamSize > 0 ? totalCost / teamSize : 0;

  if (teamSize === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.label}>Traditional Firm Equivalent</span>
        </div>
        <div style={styles.emptyText}>Select agents to see comparison</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Traditional Firm Equivalent</span>
      </div>

      {/* Comparison subtitle */}
      <div style={styles.subtitle}>What this team would bill at a traditional firm</div>

      {/* Total cost */}
      <div style={styles.costRow}>
        <span style={styles.totalCost}>${totalCost.toLocaleString()}</span>
        <span style={styles.perUnit}>/hr</span>
        <span style={styles.separator}>·</span>
        <span style={styles.teamCount}>{teamSize} agent{teamSize !== 1 ? 's' : ''}</span>
      </div>

      {/* Tier breakdown */}
      <div style={styles.tierRow}>
        {tierParts.map((part, i) => (
          <span key={part}>
            {i > 0 && <span style={styles.tierSep}> · </span>}
            <span style={styles.tierText}>{part}</span>
          </span>
        ))}
        {avgCost > 0 && (
          <>
            <span style={styles.tierSep}> · </span>
            <span style={styles.avgText}>~${Math.round(avgCost).toLocaleString()} avg</span>
          </>
        )}
      </div>

      {/* Disclaimer */}
      <div style={styles.disclaimer}>Lavern doesn't actually charge by the hour</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
    marginTop: -2,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
    marginTop: 2,
  },
  costRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  totalCost: {
    fontSize: 20,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
  },
  perUnit: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
  },
  separator: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    margin: '0 2px',
  },
  teamCount: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
  },
  tierRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 2,
  },
  tierText: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    fontWeight: 500,
  },
  tierSep: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  avgText: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  disclaimer: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
    marginTop: 4,
  },
};
