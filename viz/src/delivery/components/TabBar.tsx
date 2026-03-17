/**
 * TabBar — Horizontal tab navigation for the delivery screen.
 *
 * Micro-delight: accent underline slides between tabs instead of
 * just appearing/disappearing. Uses refs to measure tab positions
 * and a CSS-transitioned indicator bar.
 */

import { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { useResponsive } from '../../hooks/useMediaQuery.js';
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
  const { isMobile } = useResponsive();
  const barRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<DeliveryTab, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const bar = barRef.current;
    const btn = tabRefs.current.get(activeTab);
    if (!bar || !btn) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - barRect.left,
      width: btnRect.width,
    });
    // Enable transition after first measurement
    if (!ready) requestAnimationFrame(() => setReady(true));
  }, [activeTab, ready]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on window resize
  useLayoutEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <nav ref={barRef} style={styles.bar} role="tablist" aria-label="Delivery sections">
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            ref={el => { if (el) tabRefs.current.set(tab.id, el); }}
            onClick={() => onTabChange(tab.id)}
            style={{
              ...styles.tab,
              color: isActive ? colors.text : colors.textMuted,
              fontWeight: isActive ? 600 : 500,
              ...(isMobile ? { padding: '12px 14px', fontSize: 12, minHeight: 44 } : {}),
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = colors.text; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = colors.textMuted; }}
          >
            {tab.label}
          </button>
        );
      })}
      {/* Sliding underline indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: indicator.left,
          width: indicator.width,
          height: 2,
          backgroundColor: colors.accent,
          borderRadius: 1,
          transition: ready ? 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          pointerEvents: 'none',
        }}
      />
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: spacing.xs,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: spacing.xxl,
    overflowX: 'auto' as const,
    position: 'relative' as const,
    WebkitOverflowScrolling: 'touch' as const,
    scrollSnapType: 'x mandatory' as const,
    scrollbarWidth: 'none' as const, // Firefox
    msOverflowStyle: 'none' as const, // IE/Edge
  },
  tab: {
    padding: '10px 20px',
    minHeight: 44,
    scrollSnapAlign: 'start' as const,
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: -1,
    transition: 'color 0.25s ease',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
};
