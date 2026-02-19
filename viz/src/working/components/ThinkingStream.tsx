/**
 * ThinkingStream — Main center area: vertical scrollable feed of agent activity cards.
 *
 * v11: Removed narrator. Added challenge, response, quality_check card types.
 * Shows substantive agent thinking, not tool-call plumbing.
 */

import { useEffect, useRef, useMemo } from 'react';
import type { StreamCard } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { ThinkingCard } from './ThinkingCard.js';
import { FindingCard } from './FindingCard.js';
import { ChallengeCard } from './ChallengeCard.js';
import { ResponseCard } from './ResponseCard.js';
import { ResolutionCard } from './ResolutionCard.js';
import { QualityCheckCard } from './QualityCheckCard.js';
import { GateCard } from './GateCard.js';
import { WorkflowStepCard } from './WorkflowStepCard.js';
import { EmptyState } from './EmptyState.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';

interface ThinkingStreamProps {
  cards: StreamCard[];
  team: AgentProfile[];
  searchText: string;
  onSearchChange: (text: string) => void;
  onGateClick: () => void;
  isConnected: boolean;
}

export function ThinkingStream({
  cards,
  team,
  searchText,
  onSearchChange,
  onGateClick,
  isConnected,
}: ThinkingStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build lookup maps
  const profileMap = useMemo(() => {
    const map = new Map<string, AgentProfile>();
    for (const p of team) map.set(p.role, p);
    return map;
  }, [team]);

  const resolveAgentName = (role: string): string => {
    return profileMap.get(role)?.displayName ?? role.replace(/-/g, ' ');
  };

  const resolveAgentColor = (role: string): string => {
    const p = profileMap.get(role);
    return p ? categoryColor(p.category) : colors.textMuted;
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cards.length]);

  return (
    <div style={styles.container}>
      {/* Search bar */}
      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder="Search events..."
          value={searchText}
          onChange={e => onSearchChange(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Stream */}
      <div ref={scrollRef} style={styles.stream}>
        {cards.length === 0 ? (
          <EmptyState isConnected={isConnected} />
        ) : (
          cards.map((card, i) => {
            const key = `${card.kind}-${i}`;

            switch (card.kind) {
              case 'workflow_step':
                return <WorkflowStepCard key={key} card={card} />;

              case 'agent_start':
              case 'agent_stop':
                return (
                  <ThinkingCard
                    key={key}
                    card={card}
                    resolveAgentName={resolveAgentName}
                    agentColor={resolveAgentColor(card.role)}
                  />
                );

              case 'finding':
                return (
                  <FindingCard
                    key={key}
                    card={card}
                    resolveAgentName={resolveAgentName}
                    agentColor={resolveAgentColor(card.agent)}
                  />
                );

              case 'challenge':
                return (
                  <ChallengeCard
                    key={key}
                    card={card}
                    resolveAgentName={resolveAgentName}
                    agentColor={resolveAgentColor(card.challenger)}
                  />
                );

              case 'response':
                return (
                  <ResponseCard
                    key={key}
                    card={card}
                    resolveAgentName={resolveAgentName}
                    agentColor={resolveAgentColor(card.responder)}
                  />
                );

              case 'resolution':
                return <ResolutionCard key={key} card={card} />;

              case 'quality_check':
                return <QualityCheckCard key={key} card={card} />;

              case 'gate':
                return <GateCard key={key} card={card} onClick={onGateClick} />;

              case 'verification':
                return (
                  <div key={key} style={styles.verificationCard}>
                    <span style={styles.verificationIcon}>
                      {card.passed ? '\u2713' : '\u2717'}
                    </span>
                    <span style={styles.verificationText}>
                      {card.verificationType}: {card.passed ? 'Passed' : 'Failed'}
                    </span>
                    <span style={styles.verificationConf}>
                      {Math.round(card.confidence * 100)}%
                    </span>
                  </div>
                );

              case 'error':
                return (
                  <div key={key} style={styles.errorCard}>
                    <span style={styles.errorIcon}>!</span>
                    <span style={styles.errorText}>{card.message}</span>
                  </div>
                );

              default:
                return null;
            }
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
  },
  searchBar: {
    padding: '10px 16px',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  searchInput: {
    width: '100%',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    padding: '7px 12px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  stream: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  verificationCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '8px 14px',
  },
  verificationIcon: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.specialist,
  },
  verificationText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    flex: 1,
  },
  verificationConf: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(196, 93, 62, 0.05)',
    border: `1px solid rgba(196, 93, 62, 0.2)`,
    borderRadius: radii.md,
    padding: '8px 14px',
  },
  errorIcon: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: colors.danger,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  errorText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    flex: 1,
  },
};
