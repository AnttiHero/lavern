/**
 * InterviewerPicker — 2×2 card grid for choosing an interviewer persona.
 *
 * Each card shows an SVG portrait, name, title, and tagline.
 * A "Skip →" button below lets users advance without selecting.
 */

import { useState } from 'react';
import { INTERVIEWER_PERSONAS, type InterviewerPersona } from '../data/interviewers.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  onSelect: (personaId: string) => void;
  onSkip: () => void;
}

export function InterviewerPicker({ onSelect, onSkip }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={styles.container} data-testid="interviewer-picker">
      <h2 style={styles.heading}>Who should conduct your interview?</h2>
      <p style={styles.subheading}>
        Choose a partner to guide you through the briefing questions.
        Each brings their own style and personality.
      </p>

      <div style={styles.grid}>
        {INTERVIEWER_PERSONAS.map(persona => (
          <InterviewerCard
            key={persona.id}
            persona={persona}
            isHovered={hoveredId === persona.id}
            onHover={() => setHoveredId(persona.id)}
            onLeave={() => setHoveredId(null)}
            onSelect={() => onSelect(persona.id)}
          />
        ))}
      </div>

      <div style={styles.skipRow}>
        <button onClick={onSkip} style={styles.skipBtn} data-testid="interviewer-skip">
          Skip {'\u2192'}
        </button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────

interface CardProps {
  persona: InterviewerPersona;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
}

function InterviewerCard({ persona, isHovered, onHover, onLeave, onSelect }: CardProps) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        ...styles.card,
        borderColor: isHovered ? colors.borderHover : colors.border,
        transform: isHovered ? 'scale(1.01)' : 'scale(1)',
      }}
      data-testid={`interviewer-${persona.id}`}
    >
      {/* Portrait */}
      <div
        style={styles.portrait}
        dangerouslySetInnerHTML={{ __html: persona.portrait }}
      />

      {/* Name & Title */}
      <span style={styles.name}>{persona.name}</span>
      <span style={styles.title}>{persona.title}</span>
      <span style={styles.tagline}>{persona.tagline}</span>
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.lg,
    padding: `${spacing.xl}px 0`,
  },
  heading: {
    fontSize: 24,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    margin: 0,
    textAlign: 'center',
  },
  subheading: {
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    margin: 0,
    textAlign: 'center',
    maxWidth: 440,
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.md,
    width: '100%',
    maxWidth: 560,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xl}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, transform 0.2s ease',
    textAlign: 'center',
    // Reset button styles
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    lineHeight: 'inherit',
    WebkitAppearance: 'none' as const,
  },
  portrait: {
    width: 80,
    height: 80,
    marginBottom: spacing.xs,
    flexShrink: 0,
  },
  name: {
    fontSize: 15,
    fontFamily: fonts.serif,
    fontWeight: 500,
    color: colors.text,
    lineHeight: 1.2,
  },
  title: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  skipRow: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  skipBtn: {
    padding: '8px 20px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, color 0.15s ease',
  },
};
