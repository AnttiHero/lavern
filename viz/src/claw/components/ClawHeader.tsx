/**
 * ClawHeader — Dark hero zone. "The Night Shift."
 */

import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { DaemonPulse } from './DaemonPulse.js';

interface Props {
  company: string;
  jurisdiction: string;
  industry: string;
  daemon: { installed: boolean; running: boolean; pid?: number };
  demoMode: boolean;
  onBack: () => void;
}

export function ClawHeader({ company, jurisdiction, industry, daemon, demoMode, onBack }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.topRow}>
        <button
          onClick={onBack}
          style={styles.backBtn}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(250,249,246,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {'\u2190'} Back
        </button>
        <DaemonPulse
          running={demoMode ? true : daemon.running}
          installed={demoMode ? true : daemon.installed}
          pid={demoMode ? 42847 : daemon.pid}
          inverted
        />
      </div>

      <h1 style={styles.title}>The Night Shift.</h1>
      <p style={styles.subtitle}>
        {company} {'\u00B7'} {jurisdiction} {'\u00B7'} {industry}
      </p>

      {demoMode && (
        <div style={styles.demoBanner}>
          Demo mode {'\u2014'} no backend connected
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: radii.lg,
    padding: `${spacing.xl}px ${spacing.xl}px ${spacing.lg}px`,
    marginBottom: spacing.md,
    position: 'relative',
    overflow: 'hidden',
    borderBottom: '1px solid rgba(196, 93, 62, 0.2)',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backBtn: {
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: '1.5px solid rgba(250, 249, 246, 0.2)',
    backgroundColor: 'transparent',
    color: 'rgba(250, 249, 246, 0.7)',
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: 300,
    fontStyle: 'italic' as const,
    color: 'rgba(250, 249, 246, 0.9)',
    margin: '0 0 6px',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.35)',
    margin: 0,
  },
  demoBanner: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 500,
    letterSpacing: 0.5,
    color: 'rgba(184, 134, 11, 0.7)',
    marginTop: spacing.md,
    padding: '4px 10px',
    backgroundColor: 'rgba(184, 134, 11, 0.08)',
    borderRadius: radii.sm,
    display: 'inline-block',
  },
};
