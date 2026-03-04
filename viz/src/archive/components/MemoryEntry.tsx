/**
 * MemoryEntry — Single session memory entry with colored accent bar.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { MemoryEntry as MemoryEntryType } from '../hooks/useSessionMemory.js';

const TYPE_COLORS: Record<string, string> = {
  finding: '#C45D3E',
  resolution: '#4A7C50',
  pattern: '#B8860B',
};

const TYPE_LABELS: Record<string, string> = {
  finding: 'Finding',
  resolution: 'Resolution',
  pattern: 'Pattern',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

interface Props {
  entry: MemoryEntryType;
  isDemo?: boolean;
}

export function MemoryEntryCard({ entry, isDemo }: Props) {
  const accentColor = TYPE_COLORS[entry.type] ?? colors.textDim;

  return (
    <div style={{ ...styles.card, borderLeftColor: accentColor, opacity: isDemo ? 0.5 : 1 }}>
      <div style={styles.content}>{entry.content}</div>
      <div style={styles.meta}>
        <span style={{ ...styles.typePill, color: accentColor, borderColor: `${accentColor}30`, backgroundColor: `${accentColor}08` }}>
          {TYPE_LABELS[entry.type] ?? entry.type}
        </span>
        {entry.agent && (
          <span style={styles.agent}>{entry.agent}</span>
        )}
        <span style={styles.source}>
          From: {entry.sessionTitle}
        </span>
        <span style={styles.date}>{relativeTime(entry.completedAt)}</span>
        {isDemo && <span style={styles.demoBadge}>(demo)</span>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    borderLeft: '3px solid',
    paddingLeft: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  content: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.text,
    lineHeight: 1.65,
    marginBottom: spacing.sm,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: spacing.sm,
  },
  typePill: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    padding: '2px 8px',
    borderRadius: radii.pill,
    border: '1px solid',
  },
  agent: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    fontWeight: 500,
  },
  source: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  date: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  demoBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic' as const,
  },
};
