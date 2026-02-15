/**
 * EngagementViewer — Renders the engagement letter with Accept button.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface EngagementLetter {
  scope: string;
  feeStructure: string;
  estimatedBudget: { min: number; max: number; currency: string };
  accepted: boolean;
}

interface Props {
  letter: EngagementLetter;
  onAccept: () => void;
  loading: boolean;
}

const feeLabels: Record<string, string> = {
  fixed: 'Fixed Fee',
  hourly: 'Hourly',
  'outcome-based': 'Outcome-Based',
  subscription: 'Subscription',
};

export function EngagementViewer({ letter, onAccept, loading }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.title}>Engagement Letter</span>
          <span style={styles.draft}>REVIEW</span>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Scope of Work</div>
          <div style={styles.sectionBody}>{letter.scope}</div>
        </div>

        <div style={styles.divider} />

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Fee Structure</div>
          <div style={styles.sectionBody}>{feeLabels[letter.feeStructure] ?? letter.feeStructure}</div>
        </div>

        <div style={styles.divider} />

        <div style={styles.section}>
          <div style={styles.sectionTitle}>AI Analysis Budget</div>
          <div style={styles.budgetRange}>
            <span style={styles.budgetNum}>${Math.round(letter.estimatedBudget.min)}</span>
            <span style={styles.budgetDash}>{'\u2013'}</span>
            <span style={styles.budgetNum}>${Math.round(letter.estimatedBudget.max)}</span>
            <span style={styles.budgetCurrency}>{letter.estimatedBudget.currency}</span>
          </div>
          <div style={styles.budgetNote}>
            Estimated API compute cost for agent analysis
          </div>
        </div>

        <div style={styles.divider} />

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Liability Terms</div>
          <div style={styles.sectionBody}>
            Standard professional liability terms apply. Liability is limited to the fees paid for the engagement.
          </div>
        </div>

        <div style={styles.divider} />

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Data Handling & Confidentiality</div>
          <div style={styles.sectionBody}>
            All data processed in accordance with applicable privacy regulations. AI-assisted analysis is used; human oversight is maintained at all decision points.
          </div>
        </div>
      </div>

      <div style={styles.actions}>
        <button onClick={onAccept} disabled={loading}
          style={{ ...styles.acceptBtn, opacity: loading ? 0.6 : 1 }}
          onMouseEnter={e => { if (!loading) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        >
          {loading ? 'Processing...' : 'Accept Engagement \u2192'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  card: { backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: spacing.xl, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg, paddingBottom: spacing.md, borderBottom: `1px solid ${colors.border}` },
  title: { fontSize: 20, fontFamily: fonts.serif, fontWeight: 600, color: colors.text },
  draft: { fontSize: 9, fontFamily: fonts.sans, fontWeight: 600, letterSpacing: 1.5, color: colors.textDim, backgroundColor: colors.bgPanel, padding: '2px 8px', borderRadius: radii.pill },
  section: { marginBottom: 4 },
  sectionTitle: { fontSize: 11, fontFamily: fonts.sans, fontWeight: 600, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  sectionBody: { fontSize: 14, fontFamily: fonts.sans, color: colors.textSecondary, lineHeight: 1.6 },
  divider: { height: 1, backgroundColor: colors.border, margin: `${spacing.md}px 0` },
  budgetRange: { display: 'flex', alignItems: 'baseline', gap: 8 },
  budgetNum: { fontSize: 20, fontFamily: fonts.serif, fontWeight: 300, color: colors.text },
  budgetDash: { fontSize: 14, color: colors.textDim },
  budgetCurrency: { fontSize: 11, fontFamily: fonts.sans, color: colors.textDim },
  budgetNote: { fontSize: 11, fontFamily: fonts.sans, color: colors.textDim, fontStyle: 'italic', marginTop: 4 },
  actions: { display: 'flex', justifyContent: 'flex-end' },
  acceptBtn: { padding: '11px 28px', borderRadius: radii.sm, border: `2px solid ${colors.text}`, backgroundColor: colors.text, color: '#fff', fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease' },
};
