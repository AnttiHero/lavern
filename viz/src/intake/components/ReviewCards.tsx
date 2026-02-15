/**
 * ReviewCards — Conflict check + KYC results side-by-side.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface ConflictCheck {
  conflictFound: boolean;
  resolution?: string;
}

interface KycResult {
  clientVerified: boolean;
  riskLevel: string;
  flags: string[];
}

interface Props {
  conflictCheck: ConflictCheck;
  kyc: KycResult;
  onContinue: () => void;
  demoMode?: boolean;
}

const riskColors: Record<string, string> = {
  low: colors.success,
  medium: colors.warning,
  high: colors.danger,
};

export function ReviewCards({ conflictCheck, kyc, onContinue, demoMode }: Props) {
  return (
    <div style={styles.container}>
      {demoMode && (
        <div style={styles.demoBadge}>Demo Mode — API server not connected</div>
      )}
      <div style={styles.grid}>
        {/* Conflict Check */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Conflict Check</span>
            <span style={{
              ...styles.badge,
              backgroundColor: conflictCheck.conflictFound ? colors.danger : colors.success,
            }}>
              {conflictCheck.conflictFound ? 'Conflict Found' : 'Clear'}
            </span>
          </div>
          <div style={styles.cardBody}>
            {conflictCheck.resolution ?? 'No conflicts identified.'}
          </div>
        </div>

        {/* KYC Screening */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>KYC Screening</span>
            <span style={{
              ...styles.badge,
              backgroundColor: riskColors[kyc.riskLevel] ?? colors.textDim,
            }}>
              {kyc.riskLevel.toUpperCase()} RISK
            </span>
          </div>
          <div style={styles.cardBody}>
            {kyc.clientVerified
              ? 'Client identity verified.'
              : 'Client verification pending.'}
            {kyc.flags.length > 0 && (
              <div style={styles.flags}>
                {kyc.flags.map((f, i) => (
                  <div key={i} style={styles.flag}>{'\u26A0'} {f}</div>
                ))}
              </div>
            )}
            {kyc.flags.length === 0 && (
              <div style={styles.noFlags}>No flags raised.</div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.footer}>
        <button
          onClick={onContinue}
          style={styles.continueBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        >
          Review Engagement Terms {'\u2192'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  demoBadge: {
    fontSize: 10, fontFamily: fonts.sans, fontWeight: 500, color: colors.textDim,
    backgroundColor: colors.bgPanel, padding: '4px 12px', borderRadius: radii.pill,
    alignSelf: 'center', letterSpacing: 0.3,
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg },
  card: { backgroundColor: colors.bgCard, border: `1.5px solid ${colors.border}`, borderRadius: radii.sm, padding: spacing.lg, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { fontSize: 14, fontFamily: fonts.sans, fontWeight: 600, color: colors.text },
  badge: { fontSize: 9, fontFamily: fonts.sans, fontWeight: 600, letterSpacing: 1, color: '#fff', padding: '2px 8px', borderRadius: radii.sm },
  cardBody: { fontSize: 13, fontFamily: fonts.sans, color: colors.textSecondary, lineHeight: 1.5 },
  flags: { marginTop: 8 },
  flag: { fontSize: 12, fontFamily: fonts.sans, color: colors.warning, marginTop: 4 },
  noFlags: { fontSize: 12, fontFamily: fonts.sans, color: colors.textDim, fontStyle: 'italic', marginTop: 8 },
  footer: { display: 'flex', justifyContent: 'flex-end' },
  continueBtn: { padding: '12px 32px', borderRadius: radii.sm, border: `2px solid ${colors.text}`, backgroundColor: colors.text, color: '#fff', fontFamily: fonts.sans, fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' as const, cursor: 'pointer', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease' },
};
