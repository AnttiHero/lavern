/**
 * FindingsBadges — Inline critical/major/minor badge row.
 */

import { radii } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';

interface Props {
  findings: { critical: number; major: number; minor: number } | null;
}

export function FindingsBadges({ findings }: Props) {
  if (!findings) return <span style={{ color: CLAW.textDim }}>{'\u2014'}</span>;

  const { critical, major, minor } = findings;
  if (critical === 0 && major === 0 && minor === 0) {
    return <span style={{ color: CLAW.success, fontSize: 11 }}>Clean</span>;
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
  critical: { ...base, backgroundColor: CLAW.dangerBg, color: CLAW.danger },
  major: { ...base, backgroundColor: CLAW.amberBg, color: CLAW.amber },
  minor: { ...base, backgroundColor: CLAW.surface, color: CLAW.textMuted },
};
