/**
 * FinalInstructions — Catch-all textarea before brief generation.
 *
 * "Anything else the team should know?"
 * Large multiline textarea + "Generate Engagement Brief" button.
 */

import { useRef } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onGenerate: () => void;
  isAnalyzing: boolean;
}

export function FinalInstructions({ value, onChange, onGenerate, isAnalyzing }: Props) {
  const submittedRef = useRef(false);
  return (
    <div style={styles.container}>
      <div style={styles.headingRow}>
        <h2 style={styles.heading}>Final Instructions</h2>
      </div>
      <p style={styles.subtitle}>
        Anything else the team should know? Specific approaches, things to watch for,
        or particular outcomes you need?
      </p>

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g., Focus on the indemnification clause. The counterparty is very aggressive on IP ownership. We need this by Friday..."
        style={styles.textarea}
        rows={6}
        maxLength={10000}
      />

      <div style={styles.actions}>
        <button
          onClick={() => { if (!submittedRef.current) { submittedRef.current = true; onGenerate(); } }}
          disabled={isAnalyzing}
          style={{
            ...styles.generateBtn,
            opacity: isAnalyzing ? 0.6 : 1,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (!isAnalyzing) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
          onMouseLeave={e => { if (!isAnalyzing) { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; } }}
        >
          {isAnalyzing ? (
            <>
              <span style={styles.spinner} />
              Generating Brief{'\u2026'}
            </>
          ) : 'Generate Engagement Brief \u2192'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  heading: {
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.5,
    margin: 0,
  },
  textarea: {
    width: '100%',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 1.6,
    padding: '14px 16px',
    resize: 'vertical' as const,
    minHeight: 120,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  generateBtn: {
    padding: '12px 28px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'fiBtnSpin 0.8s linear infinite',
    flexShrink: 0,
  },
};
