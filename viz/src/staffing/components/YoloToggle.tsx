/**
 * YoloToggle — Autopilot toggle with warning state.
 * Warm editorial — amber warning, no neon glow.
 */

import { motion, AnimatePresence } from 'motion/react';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';

interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function YoloToggle({ enabled, onToggle }: Props) {
  return (
    <div style={styles.container}>
      <button
        onClick={() => onToggle(!enabled)}
        style={{
          ...styles.toggleRow,
          borderColor: enabled ? colors.warning : colors.border,
          backgroundColor: enabled ? colors.warningBg : 'transparent',
        }}
      >
        <div style={styles.labelArea}>
          <span style={styles.bolt}>{'\u26A1'}</span>
          <span style={{
            ...styles.label,
            color: enabled ? colors.warning : colors.textMuted,
          }}>
            Autopilot
          </span>
        </div>

        {/* Toggle switch */}
        <div style={{
          ...styles.switch,
          backgroundColor: enabled ? colors.warning : colors.textDim,
        }}>
          <motion.div
            style={styles.knob}
            animate={{
              x: enabled ? 18 : 0,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
      </button>

      <span style={{
        ...styles.sublabel,
        color: enabled ? colors.warning : colors.textDim,
      }}>
        {enabled
          ? 'Full automation \u2014 no human review gates.'
          : 'Human-in-the-loop at gate checkpoints.'}
      </span>

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={styles.warning}
          >
            {'\u26A0'} Agents will proceed through all gates without stopping for human review.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: '8px 12px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    fontFamily: fonts.sans,
  },
  labelArea: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bolt: {
    fontSize: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    transition: 'color 0.2s ease',
  },
  switch: {
    position: 'relative',
    width: 40,
    height: 22,
    borderRadius: 11,
    transition: 'background-color 0.2s ease',
    flexShrink: 0,
  },
  knob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: '#fff',
  },
  sublabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    transition: 'color 0.2s ease',
    paddingLeft: 2,
  },
  warning: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.warning,
    padding: '6px 10px',
    borderRadius: radii.sm,
    backgroundColor: colors.warningBg,
    border: `1px solid rgba(184, 134, 11, 0.15)`,
    overflow: 'hidden',
  },
};
