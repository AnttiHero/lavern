/**
 * IntelligencePreview — Rotating cards demonstrating system competence.
 *
 * Top firms show they've done their homework BEFORE the first meeting.
 * This is the digital equivalent: previewing the firm's capabilities
 * and experience right on the landing page.
 */

import { useState, useEffect } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface InsightCard {
  icon: string;
  title: string;
  value: string;
  detail: string;
}

const INSIGHTS: InsightCard[] = [
  {
    icon: '\u25A0',
    title: 'Agents Ready',
    value: '70',
    detail: 'Specialists across 5 practice areas, coordinated by expert orchestrators',
  },
  {
    icon: '\u25C6',
    title: 'Quality Dimensions',
    value: '5',
    detail: 'Every output scored on clarity, accuracy, completeness, usability, and compliance',
  },
  {
    icon: '\u25CB',
    title: 'Verification Gates',
    value: '3',
    detail: 'Ethics, meaning, and synthesis gates ensure nothing ships without review',
  },
  {
    icon: '\u25B2',
    title: 'Average Improvement',
    value: '+1.8',
    detail: 'Mean quality improvement across all dimensions for document redesign',
  },
];

export function IntelligencePreview() {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % INSIGHTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.sectionLabel}>System Intelligence</div>

      <div style={styles.grid}>
        {INSIGHTS.map((card, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            style={{
              ...styles.card,
              borderColor: i === activeIndex ? colors.accent : colors.border,
              backgroundColor: i === activeIndex ? 'rgba(196, 93, 62, 0.03)' : colors.bgCard,
            }}
          >
            <div style={styles.cardIcon}>{card.icon}</div>
            <div style={styles.cardValue}>{card.value}</div>
            <div style={styles.cardTitle}>{card.title}</div>
            {i === activeIndex && (
              <div style={styles.cardDetail}>{card.detail}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 720,
    margin: '0 auto',
    padding: `0 ${spacing.xl}px ${spacing.xxl}px`,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.md,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.md}px ${spacing.sm}px`,
    borderRadius: radii.md,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    fontFamily: fonts.sans,
    textAlign: 'center',
  },
  cardIcon: {
    fontSize: 12,
    color: colors.accent,
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 24,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.text,
    lineHeight: 1,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardDetail: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 1.4,
    marginTop: 4,
  },
};
