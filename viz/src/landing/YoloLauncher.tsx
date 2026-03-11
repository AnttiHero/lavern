/**
 * YoloLauncher — Express Lane bypass on the dashboard page.
 *
 * For the repeat client who trusts the machine. Type a question,
 * pick your tier, and go directly to a working session.
 */

import { useState, useCallback, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { YOLO_CONFIGS, type YoloTier } from './yolo-config.js';

interface Props {
  onLaunch: (question: string, tier: YoloTier) => void;
}

const std = YOLO_CONFIGS.standard;
const ws = YOLO_CONFIGS['white-shoe'];

export function YoloLauncher({ onLaunch }: Props) {
  const [question, setQuestion] = useState('');
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);
  const launchedRef = useRef(false);

  const handleLaunch = useCallback((tier: YoloTier) => {
    if (launchedRef.current) return; // prevent double-submit
    const trimmed = question.trim();
    if (trimmed) {
      launchedRef.current = true;
      onLaunch(trimmed, tier);
    }
  }, [question, onLaunch]);

  const isEmpty = !question.trim();

  return (
    <div style={styles.container}>
      {/* Bold title */}
      <div style={styles.titleRow}>
        <span style={styles.bolt}>{'\u26A1'}</span>
        <h2 style={styles.title}>Ask Right Away</h2>
        <span style={styles.bolt}>{'\u26A1'}</span>
      </div>
      <p style={styles.tagline}>
        Skip the process. No intake, no briefing, no team selection.<br />
        All gates auto-approved. Full autonomy.
      </p>

      {/* Question input */}
      <textarea
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="What's your legal question?"
        rows={3}
        style={{
          ...styles.input,
          borderColor: question.trim() ? colors.accent : colors.border,
        }}
      />

      {/* Two-button row */}
      <div style={styles.buttonRow}>
        {/* Standard */}
        <button
          onClick={() => handleLaunch('standard')}
          disabled={isEmpty}
          onMouseEnter={() => setHoveredTier('standard')}
          onMouseLeave={() => setHoveredTier(null)}
          style={{
            ...styles.launchBtn,
            ...styles.standardBtn,
            opacity: isEmpty ? 0.35 : 1,
            cursor: isEmpty ? 'not-allowed' : 'pointer',
            backgroundColor: !isEmpty && hoveredTier === 'standard' ? 'transparent' : colors.text,
            color: !isEmpty && hoveredTier === 'standard' ? colors.text : '#fff',
          }}
        >
          <span style={styles.btnLabel}>Launch {'\u2192'}</span>
          <span style={styles.btnSublabel}>
            {std.teamSize} agents · ${std.budgetUsd} budget
          </span>
        </button>

        {/* White-Shoe */}
        <button
          onClick={() => handleLaunch('white-shoe')}
          disabled={isEmpty}
          onMouseEnter={() => setHoveredTier('white-shoe')}
          onMouseLeave={() => setHoveredTier(null)}
          style={{
            ...styles.launchBtn,
            ...styles.whiteShoeBtn,
            opacity: isEmpty ? 0.35 : 1,
            cursor: isEmpty ? 'not-allowed' : 'pointer',
            backgroundColor: !isEmpty && hoveredTier === 'white-shoe' ? 'transparent' : colors.accent,
            color: !isEmpty && hoveredTier === 'white-shoe' ? colors.accent : '#fff',
            animation: !isEmpty ? 'yoloGlow 3s ease infinite' : 'none',
          }}
        >
          <span style={styles.btnLabel}>{'\u26A1'} White-Shoe Launch {'\u2192'}</span>
          <span style={styles.btnSublabel}>
            {ws.teamSize} agents · ${ws.budgetUsd} budget · Maximum effort
          </span>
        </button>
      </div>

      {/* Disclaimer */}
      <p style={styles.disclaimer}>
        <span style={styles.disclaimerAccent}>Caveat emptor, counselor.</span>
        {' '}For the returning client who trusts the machine.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    marginLeft: 'auto',
    marginRight: 'auto',
    padding: `${spacing.xxl}px ${spacing.xl}px`,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },

  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  bolt: {
    fontSize: 20,
    color: colors.accent,
    animation: 'yoloPulse 2s ease infinite',
  },
  title: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.accent,
    letterSpacing: -0.5,
    margin: 0,
  },

  tagline: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    textAlign: 'center' as const,
    marginBottom: spacing.xl,
    lineHeight: 1.7,
    letterSpacing: 0.2,
  },

  input: {
    width: '100%',
    padding: '16px 18px',
    fontSize: 15,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    resize: 'vertical' as const,
    lineHeight: 1.6,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.25s ease',
  },

  buttonRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  launchBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: '20px 24px',
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  standardBtn: {
    backgroundColor: colors.text,
    color: '#fff',
    border: `2px solid ${colors.text}`,
  },
  whiteShoeBtn: {
    backgroundColor: colors.accent,
    color: '#fff',
    border: `2px solid ${colors.accent}`,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  btnSublabel: {
    fontSize: 12,
    fontWeight: 400,
    opacity: 0.8,
  },

  disclaimer: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    textAlign: 'center' as const,
    lineHeight: 1.7,
    marginTop: spacing.lg,
  },
  disclaimerAccent: {
    color: colors.accent,
    fontStyle: 'italic' as const,
    fontWeight: 500,
  },
};
