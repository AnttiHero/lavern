/**
 * ClawTabBar — Tab navigation with amber underline.
 */

import { fonts, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';

export type ClawTab = 'overview' | 'documents' | 'deliveries' | 'precedents' | 'config';

const TABS: { id: ClawTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'precedents', label: 'Precedents' },
  { id: 'config', label: 'Configuration' },
];

interface Props {
  activeTab: ClawTab;
  onTabChange: (tab: ClawTab) => void;
  documentCount: number;
  deliveryCount: number;
  precedentCount: number;
}

export function ClawTabBar({ activeTab, onTabChange, documentCount, deliveryCount, precedentCount }: Props) {
  return (
    <div style={styles.bar}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const count = tab.id === 'documents' ? documentCount
          : tab.id === 'deliveries' ? deliveryCount
          : tab.id === 'precedents' ? precedentCount
          : 0;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = CLAW.text; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = CLAW.textMuted; }}
          >
            {tab.label}
            {count > 0 && (
              <span style={{
                ...styles.badge,
                backgroundColor: isActive ? CLAW.accentBg : CLAW.surface,
                color: isActive ? CLAW.accent : CLAW.textDim,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: 2,
    borderBottom: `1px solid ${CLAW.border}`,
    marginBottom: spacing.xl,
    overflowX: 'auto' as const,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    color: CLAW.textMuted,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: -1,
    transition: 'color 0.25s ease, border-bottom-color 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  tabActive: {
    color: CLAW.text,
    fontWeight: 600,
    borderBottom: `2px solid ${CLAW.accent}`,
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    padding: '1px 6px',
    borderRadius: 999,
  },
};
