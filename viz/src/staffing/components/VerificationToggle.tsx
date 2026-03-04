/**
 * VerificationToggle — 10-pass quality verification toggle.
 * Green/accent when ON (quality signal), neutral when OFF.
 * Same layout pattern as YoloToggle.
 */

import { motion } from 'motion/react';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';

interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function VerificationToggle({ enabled, onToggle }: Props) {
  return (
    <div style={styles.container}>
      <button
        onClick={() => onToggle(!enabled)}
        style={{
          ...styles.toggleRow,
          borderColor: enabled ? colors.accent : colors.border,
          backgroundColor: enabled ? 'rgba(150, 135, 95, 0.06)' : 'transparent',
        }}
      >
        <div style={styles.labelArea}>
          <span style={styles.icon}>{'\u2713'}</span>
          <span style={{
            ...styles.label,
            color: enabled ? colors.text : colors.textMuted,
          }}>
            Verification
          </span>
        </div>

        {/* Toggle switch */}
        <div style={{
          ...styles.switch,
          backgroundColor: enabled ? colors.accent : colors.textDim,
        }}>
          <motion.div
            style={styles.knob}
            animate={{
              x: enabled ? 16 : 0,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
      </button>

      <span style={{
        ...styles.sublabel,
        color: enabled ? colors.textMuted : colors.textDim,
      }}>
        {enabled
          ? '10-pass quality check before delivery.'
          : 'Deliver without verification.'}
      </span>
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
  icon: {
    fontSize: 14,
    fontWeight: 700,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    transition: 'color 0.2s ease',
  },
  switch: {
    position: 'relative',
    width: 36,
    height: 20,
    borderRadius: 10,
    transition: 'background-color 0.2s ease',
    flexShrink: 0,
  },
  knob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: '50%',
    backgroundColor: '#fff',
  },
  sublabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    transition: 'color 0.2s ease',
    paddingLeft: 2,
  },
};
