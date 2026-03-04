/**
 * TabBar — Horizontal tab navigation for the delivery screen.
 */

import { colors, fonts, spacing } from '../../staffing/styles/tokens.js';

export type DeliveryTab = 'work' | 'review' | 'story' | 'scorecard' | 'next-steps' | 'conversation';

const TABS: { id: DeliveryTab; label: string }[] = [
  { id: 'work', label: 'The Work' },
  { id: 'review', label: 'The Review' },
  { id: 'story', label: 'The Story' },
  { id: 'scorecard', label: 'The Scorecard' },
  { id: 'next-steps', label: 'Next Steps' },
  { id: 'conversation', label: 'Ask the Team' },
];

interface Props {
  activeTab: DeliveryTab;
  onTabChange: (tab: DeliveryTab) => void;
}

export function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <div style={styles.bar}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              ...styles.tab,
              ...(isActive ? styles.tabActive : {}),
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = colors.text; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = colors.textMuted; }}
          >
            {tab.label}
          </button>
        );
      })}
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
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: -1,
    transition: 'color 0.25s ease, border-bottom-color 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  tabActive: {
    color: colors.text,
    fontWeight: 600,
    borderBottom: `2px solid ${colors.accent}`,
  },
};
