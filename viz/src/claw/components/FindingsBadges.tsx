/**
 * FindingsBadges — Inline critical/major/minor badge row.
 */

import { colors, radii } from '../../staffing/styles/tokens.js';

interface Props {
  findings: { critical: number; major: number; minor: number } | null;
}

export function FindingsBadges({ findings }: Props) {
  if (!findings) return <span style={{ color: colors.textDim }}>{'\u2014'}</span>;

  const { critical, major, minor } = findings;
  if (critical === 0 && major === 0 && minor === 0) {
    return <span style={{ color: colors.textDim, fontSize: 11 }}>Clean</span>;
  }

  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {critical > 0 && <span style={styles.critical}>{critical}C</span>}
      {major > 0 && <span style={styles.major}>{major}M</span>}
      {minor > 0 && <span style={styles.minor}>{minor}m</span>}
    </span>
  );
}

const base: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: radii.pill,
  fontSize: 10,
  fontWeight: 700,
};

const styles: Record<string, React.CSSProperties> = {
  critical: { ...base, backgroundColor: 'rgba(196, 93, 62, 0.12)', color: colors.danger },
  major: { ...base, backgroundColor: 'rgba(184, 134, 11, 0.1)', color: '#B8860B' },
  minor: { ...base, backgroundColor: colors.bgPanel, color: colors.textMuted },
};
