/**
 * DeliveryHeader — Top bar for the delivery screen.
 * Logo, matter badge, back/skip navigation.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { LavernIlluminated } from '../../components/LavernIlluminated.js';

interface Props {
  matterNumber?: string;
  matterType?: string;
  jurisdiction?: string;
  onBack: () => void;
  onSkip?: () => void;
}

export function DeliveryHeader({ matterNumber, matterType, jurisdiction, onBack, onSkip }: Props) {
  return (
    <div style={styles.header}>
      <button
        onClick={onBack}
        style={styles.navBtn}
        onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
      >{'\u2190'} Back</button>
      <div style={styles.center}>
        <div style={styles.logoType}><LavernIlluminated color={colors.textMuted} /></div>
        <h1 style={styles.title}>Lavern <span style={{ fontStyle: 'italic' }}>Delivery</span></h1>
        {matterNumber && (
          <div style={styles.matterBadge}>
            {matterNumber}
            {matterType ? ` \u00B7 ${matterType.replace(/_/g, ' ')}` : ''}
            {jurisdiction ? ` \u00B7 ${jurisdiction}` : ''}
          </div>
        )}
      </div>
      {onSkip ? (
        <button
          onClick={onSkip}
          style={styles.navBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >Skip {'\u2192'}</button>
      ) : (
        <div style={{ width: 60 }} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  navBtn: {
    padding: '10px 16px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  center: { textAlign: 'center' as const, flex: 1, minWidth: 0, overflow: 'hidden' as const },
  logoType: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
  },
  title: {
    fontSize: 36,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: '8px 0 0',
    letterSpacing: -0.5,
  },
  matterBadge: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    marginTop: 8,
    textTransform: 'capitalize' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
};
