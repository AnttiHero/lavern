/**
 * FoundationsSection — Dark inverted zone showing pre-loaded agent frameworks.
 * "The bedrock." — what the agents studied in law school.
 */

import { FOUNDATIONS, type FoundationItem } from '../data/foundations.js';
import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';

const CATEGORY_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  framework: 'Framework',
  standard: 'Standard',
  guide: 'Guide',
};

function FoundationCard({ item }: { item: FoundationItem }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardCategory}>{CATEGORY_LABELS[item.category] ?? item.category}</div>
      <div style={styles.cardName}>{item.name}</div>
      <div style={styles.cardDesc}>{item.description}</div>
      <div style={styles.cardStat}>~{item.wordEstimate.toLocaleString()} words absorbed</div>
    </div>
  );
}

export function FoundationsSection() {
  return (
    <div style={styles.container}>
      <div style={styles.label}>Foundations</div>
      <h2 style={styles.heading}>The bedrock.</h2>
      <p style={styles.subtitle}>Frameworks and checklists that shape how your agents think.</p>

      <div style={styles.grid}>
        {FOUNDATIONS.map(f => (
          <FoundationCard key={f.id} item={f} />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: radii.lg,
    padding: `${spacing.xxl}px ${spacing.xl}px`,
    marginBottom: spacing.xxl,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(196, 93, 62, 0.7)',
    marginBottom: spacing.sm,
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 26,
    fontWeight: 300,
    fontStyle: 'italic' as const,
    color: 'rgba(250, 249, 246, 0.9)',
    margin: '0 0 6px',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.4)',
    margin: `0 0 ${spacing.xl}px`,
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: spacing.md,
  },
  card: {
    backgroundColor: 'rgba(250, 249, 246, 0.03)',
    border: '1px solid rgba(250, 249, 246, 0.08)',
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'border-color 0.2s ease',
  },
  cardCategory: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: 'rgba(196, 93, 62, 0.6)',
    marginBottom: spacing.sm,
  },
  cardName: {
    fontSize: 15,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: 'rgba(250, 249, 246, 0.85)',
    marginBottom: 6,
    lineHeight: 1.3,
  },
  cardDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.35)',
    lineHeight: 1.5,
    marginBottom: spacing.sm,
  },
  cardStat: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.2)',
  },
};
