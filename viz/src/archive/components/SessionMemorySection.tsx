/**
 * SessionMemorySection — Layer 3: gold-tinted zone.
 * "What your firm has learned." — accumulated knowledge from sessions.
 */

import { fonts, spacing } from '../../staffing/styles/tokens.js';
import type { MemoryEntry } from '../hooks/useSessionMemory.js';
import { MemoryEntryCard } from './MemoryEntry.js';

interface Props {
  memories: MemoryEntry[];
  loading: boolean;
  demoMode: boolean;
}

export function SessionMemorySection({ memories, loading, demoMode }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.label}>Session Memory</div>
      <h2 style={styles.heading}>What your firm has learned.</h2>
      <p style={styles.subtitle}>
        Knowledge accumulates as your agents work. Findings, resolutions, and patterns emerge.
      </p>

      {loading ? (
        <div style={styles.loadingText}>Loading memories...</div>
      ) : memories.length === 0 ? (
        <div style={styles.emptyText}>
          No memories yet. Knowledge accumulates as your firm works.
        </div>
      ) : (
        <div style={styles.list}>
          {memories.map(m => (
            <MemoryEntryCard key={m.id} entry={m} isDemo={demoMode} />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'rgba(184, 134, 11, 0.04)',
    borderTop: '2px solid rgba(184, 134, 11, 0.15)',
    borderRadius: '0 0 8px 8px',
    padding: `${spacing.xxl}px ${spacing.xl}px`,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(184, 134, 11, 0.6)',
    marginBottom: spacing.sm,
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: 300,
    fontStyle: 'italic' as const,
    color: '#1A1A1A',
    margin: '0 0 6px',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: 'rgba(26, 26, 26, 0.45)',
    margin: `0 0 ${spacing.xl}px`,
    lineHeight: 1.5,
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: 'rgba(26, 26, 26, 0.35)',
    padding: `${spacing.lg}px 0`,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: 'rgba(26, 26, 26, 0.35)',
    padding: `${spacing.lg}px 0`,
  },
};
