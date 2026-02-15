/**
 * AgentChip — Individual agent in the TeamPanel sidebar.
 *
 * Shows category color dot, display name, status indicator.
 * Clickable to filter the thinking stream.
 */

import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus } from '../hooks/useWorkingState.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';

interface AgentChipProps {
  profile: AgentProfile;
  status: AgentStatus | undefined;
  isFiltered: boolean;
  onClick: () => void;
}

const STATUS_DOT: Record<string, { bg: string; animate: boolean }> = {
  idle: { bg: colors.textDim, animate: false },
  active: { bg: colors.success, animate: true },
  complete: { bg: colors.sonnet, animate: false },
};

export function AgentChip({ profile, status, isFiltered, onClick }: AgentChipProps) {
  const catColor = categoryColor(profile.category);
  const st = status?.status ?? 'idle';
  const dotStyle = STATUS_DOT[st] ?? STATUS_DOT.idle;

  return (
    <button
      onClick={onClick}
      style={{
        ...styles.chip,
        backgroundColor: isFiltered ? colors.bgPanel : 'transparent',
        borderColor: isFiltered ? colors.borderSelected : 'transparent',
      }}
    >
      <div style={{ ...styles.colorDot, backgroundColor: catColor }} />
      <div style={styles.info}>
        <span style={styles.name}>{profile.displayName}</span>
        {status?.lastActivity && (
          <span style={styles.activity}>{status.lastActivity}</span>
        )}
      </div>
      <div
        style={{
          ...styles.statusDot,
          backgroundColor: dotStyle.bg,
          boxShadow: dotStyle.animate ? `0 0 0 3px rgba(74, 124, 80, 0.2)` : 'none',
        }}
      />
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 10px',
    border: '1px solid transparent',
    borderRadius: radii.md,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
    fontFamily: fonts.sans,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.textSecondary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  activity: {
    fontSize: 10,
    color: colors.textDim,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background-color 0.3s ease',
  },
};
