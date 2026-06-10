/**
 * ProviderToggle — segmented selector for LLM provider.
 *
 * All options are visible so the chosen engine is explicit.
 */

import { AnimatePresence, motion } from 'motion/react';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { LLMProvider } from '../hooks/useEngagementConfig.js';

const PROVIDER_ACCENT: Record<LLMProvider, string> = {
  anthropic: colors.text,
  mistral: '#2E5D9C',
  minimax: '#7A4D00',
  kimi: '#6B4FA3',
  deepseek: '#0F766E',
};

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
    label: 'Mistral',
    description: 'Mistral AI. Your data never leaves Europe.',
  },
  {
    value: 'minimax',
    label: 'MiniMax M3',
    description: 'Large-context agentic model via MiniMax.',
  },
  {
    value: 'kimi',
    label: 'Kimi K2.6',
    description: 'Moonshot/Kimi model for agent and coding work.',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek V4 Pro',
    description: 'DeepSeek reasoning model through its OpenAI-compatible API.',
  },
];

interface Props {
  provider: LLMProvider;
  onToggle: (provider: LLMProvider) => void;
}

export function ProviderToggle({ provider, onToggle }: Props) {
  const active = OPTIONS.find(o => o.value === provider) ?? OPTIONS[0];
  const accent = PROVIDER_ACCENT[provider] ?? colors.text;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>Engine</span>
      </div>

      {/* Segmented button row — both options always visible */}
      <div style={{
        ...styles.buttonRow,
        borderColor: accent,
      }}>
        {OPTIONS.map((opt, i) => {
          const isActive = opt.value === provider;
          const isLast = i === OPTIONS.length - 1;
          const optionAccent = PROVIDER_ACCENT[opt.value];

          return (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={{
                ...styles.button,
                backgroundColor: isActive
                  ? optionAccent
                  : 'transparent',
                color: isActive ? '#fff' : colors.textSecondary,
                fontWeight: isActive ? 600 : 400,
                borderRight: isLast ? 'none' : `1px solid ${accent}`,
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
        color: accent,
      }}>
        {active.description}
      </div>

      <AnimatePresence>
        {provider !== 'anthropic' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              ...styles.info,
              color: accent,
              backgroundColor: `${accent}12`,
              borderColor: `${accent}30`,
            }}
          >
            Uses the {active.label} defaults from .env. You can override the exact model IDs there without changing code.
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
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
    gap: 0,
    borderRadius: radii.md,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    transition: 'border-color 0.2s ease',
  },
  button: {
    minHeight: 36,
    padding: '8px 6px',
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 1.15,
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
    padding: '6px 10px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    overflow: 'hidden',
  },
};
