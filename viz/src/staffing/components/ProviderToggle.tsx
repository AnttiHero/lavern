/**
 * ProviderToggle — Two-option segmented selector for LLM provider.
 *
 * Both options always visible — you can see exactly what you're choosing
 * between. Uses the same segmented-button pattern as IntensitySelector.
 *
 * Options:
 *   - Claude — most capable, US-hosted
 *   - EU Sovereign — Mistral AI, data stays in Europe
 */

import { AnimatePresence, motion } from 'motion/react';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { LLMProvider } from '../hooks/useEngagementConfig.js';

/** EU sovereign blue — desaturated, editorial. */
const EU_COLOR = '#2E5D9C';
const EU_BG = 'rgba(46, 93, 156, 0.07)';

const OPTIONS: {
  value: LLMProvider;
  label: string;
  description: string;
}[] = [
  {
    value: 'anthropic',
    label: 'Claude',
    description: 'Most capable analysis. Data processed in the US.',
  },
  {
    value: 'mistral',
    label: '\uD83C\uDDEA\uD83C\uDDFA EU Sovereign',
    description: 'Mistral AI. Your data never leaves Europe.',
  },
];

interface Props {
  provider: LLMProvider;
  onToggle: (provider: LLMProvider) => void;
}

export function ProviderToggle({ provider, onToggle }: Props) {
  const active = OPTIONS.find(o => o.value === provider) ?? OPTIONS[0];
  const isEU = provider === 'mistral';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>Engine</span>
      </div>

      {/* Segmented button row — both options always visible */}
      <div style={{
        ...styles.buttonRow,
        borderColor: isEU ? EU_COLOR : colors.border,
      }}>
        {OPTIONS.map((opt, i) => {
          const isActive = opt.value === provider;
          const isLast = i === OPTIONS.length - 1;
          const isEUOpt = opt.value === 'mistral';

          return (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={{
                ...styles.button,
                backgroundColor: isActive
                  ? (isEUOpt ? EU_COLOR : colors.text)
                  : 'transparent',
                color: isActive ? '#fff' : colors.textSecondary,
                fontWeight: isActive ? 600 : 400,
                borderRight: isLast ? 'none' : `1px solid ${isEU ? EU_COLOR : colors.border}`,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Description updates based on selection */}
      <div style={{
        ...styles.description,
        color: isEU ? EU_COLOR : colors.textMuted,
      }}>
        {active.description}
      </div>

      {/* Info box — only when EU is selected */}
      <AnimatePresence>
        {isEU && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={styles.info}
          >
            Mistral Large is EU-hosted. Quality may differ from Claude on complex matters, but data sovereignty is guaranteed.
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
    gap: spacing.sm,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  buttonRow: {
    display: 'flex',
    gap: 0,
    borderRadius: radii.md,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    transition: 'border-color 0.2s ease',
  },
  button: {
    flex: 1,
    padding: '8px 4px',
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  description: {
    fontSize: 12,
    fontFamily: fonts.sans,
    marginTop: 2,
    transition: 'color 0.2s ease',
  },
  info: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: EU_COLOR,
    padding: '6px 10px',
    borderRadius: radii.sm,
    backgroundColor: EU_BG,
    border: `1px solid rgba(46, 93, 156, 0.15)`,
    overflow: 'hidden',
  },
};
