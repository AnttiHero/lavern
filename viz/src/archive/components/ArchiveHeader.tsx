/**
 * ArchiveHeader — Back button, page title, search bar.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  onBack: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  demoMode: boolean;
}

export function ArchiveHeader({ onBack, searchQuery, onSearchChange, demoMode }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.topRow}>
        <button
          onClick={onBack}
          style={styles.backBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >
          {'\u2190'} Back
        </button>
        <h1 style={styles.title}>
          Lavern <span style={{ fontStyle: 'italic' }}>Archive</span>
        </h1>
        <div style={{ width: 80 }} />
      </div>

      {/* Search bar */}
      <div style={styles.searchWrap}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={demoMode ? 'Search requires backend connection' : 'Search across all knowledge...'}
          disabled={demoMode}
          style={{
            ...styles.searchInput,
            opacity: demoMode ? 0.4 : 1,
            cursor: demoMode ? 'not-allowed' : 'text',
          }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: spacing.xxl,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backBtn: {
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: 300,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.5,
  },
  searchWrap: {
    maxWidth: 640,
    margin: '0 auto',
  },
  searchInput: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgInput,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.text,
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box' as const,
  },
};
