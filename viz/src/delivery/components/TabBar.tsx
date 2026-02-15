/**
 * TabBar — Horizontal tab navigation for the delivery screen.
 */

import { colors, fonts, spacing } from '../../staffing/styles/tokens.js';

export type DeliveryTab = 'certainty' | 'work' | 'story' | 'scorecard' | 'next-steps';

const TABS: { id: DeliveryTab; label: string }[] = [
  { id: 'certainty', label: 'Certainty' },
  { id: 'work', label: 'The Work' },
  { id: 'story', label: 'The Story' },
  { id: 'scorecard', label: 'The Scorecard' },
  { id: 'next-steps', label: 'Next Steps' },
];

interface Props {
  activeTab: DeliveryTab;
  onTabChange: (tab: DeliveryTab) => void;
}

export function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <div style={styles.bar}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            ...styles.tab,
            ...(activeTab === tab.id ? styles.tabActive : {}),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: spacing.xs,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: spacing.xxl,
    overflowX: 'auto' as const,
  },
  tab: {
    padding: '10px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    transition: 'color 0.15s ease, border-color 0.15s ease',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  tabActive: {
    color: colors.text,
    fontWeight: 600,
    borderBottomColor: colors.accent,
  },
};
