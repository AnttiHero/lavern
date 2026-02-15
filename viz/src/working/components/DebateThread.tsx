/**
 * DebateThread — Threaded challenge/response chain under a finding card.
 */

import type { DebateEntry } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface DebateThreadProps {
  threads: DebateEntry[];
  resolveAgentName: (role: string) => string;
}

export function DebateThread({ threads, resolveAgentName }: DebateThreadProps) {
  if (threads.length === 0) return null;

  return (
    <div style={styles.container}>
      {threads.map((entry, i) => {
        const agentName = resolveAgentName(entry.agent);

        if (entry.type === 'challenge') {
          return (
            <div key={i} style={styles.entry}>
              <div style={styles.challengeIcon}>{'\u2192'}</div>
              <div style={styles.content}>
                <span style={styles.challengeAgent}>{agentName}</span>
                <span style={styles.challengeLabel}> challenged</span>
              </div>
            </div>
          );
        }

        return (
          <div key={i} style={styles.entry}>
            <div style={styles.responseIcon}>{'\u2190'}</div>
            <div style={styles.content}>
              <span style={styles.responseAgent}>{agentName}</span>
              <span style={styles.responseLabel}> responded</span>
              {entry.accepted != null && (
                <span style={{
                  ...styles.acceptBadge,
                  backgroundColor: entry.accepted ? colors.successBg : colors.warningBg,
                  color: entry.accepted ? colors.success : colors.warning,
                }}>
                  {entry.accepted ? 'accepted' : 'rejected'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  entry: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  challengeIcon: {
    fontSize: 10,
    color: colors.accent,
    fontWeight: 700,
    width: 14,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  responseIcon: {
    fontSize: 10,
    color: colors.specialist,
    fontWeight: 700,
    width: 14,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap' as const,
  },
  challengeAgent: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.accent,
  },
  challengeLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
  },
  responseAgent: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.specialist,
  },
  responseLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
  },
  acceptBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: radii.pill,
    marginLeft: 4,
  },
};
