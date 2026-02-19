/**
 * QualityCheckCard — Shows the result of a quality iteration check.
 *
 * Pass: green checkmark, score, step name.
 * Fail: amber warning, "Attempt N of M", failure reasons, revision guidance.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type QualityCheckData = Extract<StreamCard, { kind: 'quality_check' }>;

interface QualityCheckCardProps {
  card: QualityCheckData;
}

export function QualityCheckCard({ card }: QualityCheckCardProps) {
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const scorePct = Math.round(card.score * 100);

  if (card.passed) {
    return (
      <div style={styles.passCard}>
        <div style={styles.header}>
          <span style={styles.passIcon}>{'\u2713'}</span>
          <span style={styles.passLabel}>Quality check passed</span>
          <span style={styles.stepName}>{card.step}</span>
          <span style={styles.time}>{time}</span>
        </div>
        <div style={styles.scoreRow}>
          <span style={styles.scoreLabel}>Score</span>
          <div style={styles.scoreBar}>
            <div style={{
              ...styles.scoreFill,
              width: `${scorePct}%`,
              backgroundColor: colors.success,
            }} />
          </div>
          <span style={{ ...styles.scoreValue, color: colors.success }}>{scorePct}%</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.failCard}>
      <div style={styles.header}>
        <span style={styles.failIcon}>{'\u21BB'}</span>
        <span style={styles.failLabel}>Revision needed</span>
        <span style={styles.stepName}>{card.step}</span>
        <span style={styles.iterBadge}>Attempt {card.iteration}</span>
        <span style={styles.time}>{time}</span>
      </div>

      <div style={styles.scoreRow}>
        <span style={styles.scoreLabel}>Score</span>
        <div style={styles.scoreBar}>
          <div style={{
            ...styles.scoreFill,
            width: `${scorePct}%`,
            backgroundColor: colors.warning,
          }} />
        </div>
        <span style={{ ...styles.scoreValue, color: colors.warning }}>{scorePct}%</span>
      </div>

      {/* Failure reasons */}
      {card.failureReasons.length > 0 && (
        <div style={styles.reasonsBlock}>
          <span style={styles.reasonsLabel}>Issues</span>
          {card.failureReasons.map((r, i) => (
            <div key={i} style={styles.reasonLine}>
              <span style={styles.reasonBullet}>{'\u2022'}</span>
              <span style={styles.reasonText}>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Revision guidance */}
      {card.revisionGuidance.length > 0 && (
        <div style={styles.guidanceBlock}>
          <span style={styles.guidanceLabel}>Guidance</span>
          {card.revisionGuidance.map((g, i) => (
            <div key={i} style={styles.guidanceLine}>
              <span style={styles.guidanceBullet}>{'\u2192'}</span>
              <span style={styles.guidanceText}>{g}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  passCard: {
    backgroundColor: colors.successBg,
    border: `1px solid rgba(74, 124, 80, 0.2)`,
    borderRadius: radii.md,
    padding: '10px 14px',
  },
  failCard: {
    backgroundColor: colors.warningBg,
    border: `1px solid rgba(184, 134, 11, 0.2)`,
    borderRadius: radii.md,
    padding: '12px 14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  passIcon: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.success,
  },
  passLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.success,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  failIcon: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.warning,
  },
  failLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.warning,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  stepName: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    flex: 1,
  },
  iterBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 700,
    color: colors.warning,
    backgroundColor: 'rgba(184, 134, 11, 0.12)',
    padding: '2px 8px',
    borderRadius: radii.pill,
    letterSpacing: 0.3,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  scoreBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  scoreValue: {
    fontSize: 10,
    fontFamily: fonts.mono,
    fontWeight: 500,
    flexShrink: 0,
    width: 28,
    textAlign: 'right' as const,
  },
  reasonsBlock: {
    marginTop: 8,
  },
  reasonsLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    display: 'block',
    marginBottom: 4,
  },
  reasonLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 2,
    marginBottom: 2,
  },
  reasonBullet: {
    fontSize: 11,
    color: colors.warning,
    flexShrink: 0,
    marginTop: 1,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.4',
  },
  guidanceBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid rgba(184, 134, 11, 0.15)`,
  },
  guidanceLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    display: 'block',
    marginBottom: 4,
  },
  guidanceLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 2,
    marginBottom: 2,
  },
  guidanceBullet: {
    fontSize: 10,
    color: colors.textMuted,
    flexShrink: 0,
    marginTop: 2,
  },
  guidanceText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.4',
    fontStyle: 'italic' as const,
  },
};
