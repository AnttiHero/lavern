/**
 * ThinkingStream — Main center area: vertical scrollable feed of agent activity cards.
 *
 * v12: Threaded debates, tool_used cards, active thinking indicators.
 *      Challenge/response/resolution cards are absorbed into DebateThreadCards.
 *      tool_used events fill the silence between agent_start and first finding.
 *      Active thinking agents show live indicators at the bottom.
 */

import { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { StreamCard, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import type { DebateThread } from '../hooks/useDebateThreads.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { ThinkingCard } from './ThinkingCard.js';
import { FindingCard } from './FindingCard.js';
import { ChallengeCard } from './ChallengeCard.js';
import { ResponseCard } from './ResponseCard.js';
import { ResolutionCard } from './ResolutionCard.js';
import { QualityCheckCard } from './QualityCheckCard.js';
import { GateCard } from './GateCard.js';
import { WorkflowStepCard } from './WorkflowStepCard.js';
import { ToolUsedCard } from './ToolUsedCard.js';
import { ActiveThinkingCard } from './ActiveThinkingCard.js';
import { DebateThreadCard } from './DebateThreadCard.js';
import { EmptyState } from './EmptyState.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';
import { streamCardEntrance } from '../styles/animations.js';

interface ThinkingStreamProps {
  cards: StreamCard[];
  team: AgentProfile[];
  searchText: string;
  onSearchChange: (text: string) => void;
  onGateClick: () => void;
  isConnected: boolean;
  debateThreads: Map<string, DebateThread>;
  activeThinkingAgents: Map<string, ActiveThinkingAgent>;
}

export function ThinkingStream({
  cards,
  team,
  searchText,
  onSearchChange,
  onGateClick,
  isConnected,
  debateThreads,
  activeThinkingAgents,
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
  }, [cards.length, activeThinkingAgents.size]);

  // Active thinking agents as array for rendering
  const thinkingArray = useMemo(
    () => Array.from(activeThinkingAgents.values()),
    [activeThinkingAgents],
  );

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
        {cards.length === 0 && thinkingArray.length === 0 ? (
          <EmptyState isConnected={isConnected} />
        ) : (
          <>
            {cards.map((card, i) => {
              const key = `${card.kind}-${i}`;

              // If this finding has a debate thread, render DebateThreadCard instead
              if (card.kind === 'finding') {
                const thread = debateThreads.get(card.findingId);
                if (thread) {
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <DebateThreadCard thread={thread} profileMap={profileMap} />
                    </motion.div>
                  );
                }
              }

              switch (card.kind) {
                case 'workflow_step':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <WorkflowStepCard card={card} />
                    </motion.div>
                  );

                case 'agent_start':
                case 'agent_stop':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <ThinkingCard
                        card={card}
                        resolveAgentName={resolveAgentName}
                        agentColor={resolveAgentColor(card.role)}
                      />
                    </motion.div>
                  );

                case 'tool_used':
                  return (
                    <ToolUsedCard
                      key={key}
                      card={card}
                      resolveAgentName={resolveAgentName}
                      agentColor={card.agent ? resolveAgentColor(card.agent) : undefined}
                    />
                  );

                case 'finding':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <FindingCard
                        card={card}
                        resolveAgentName={resolveAgentName}
                        agentColor={resolveAgentColor(card.agent)}
                      />
                    </motion.div>
                  );

                case 'challenge':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <ChallengeCard
                        card={card}
                        resolveAgentName={resolveAgentName}
                        agentColor={resolveAgentColor(card.challenger)}
                      />
                    </motion.div>
                  );

                case 'response':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <ResponseCard
                        card={card}
                        resolveAgentName={resolveAgentName}
                        agentColor={resolveAgentColor(card.responder)}
                      />
                    </motion.div>
                  );

                case 'resolution':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <ResolutionCard card={card} />
                    </motion.div>
                  );

                case 'quality_check':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <QualityCheckCard card={card} />
                    </motion.div>
                  );

                case 'gate':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <GateCard card={card} onClick={onGateClick} />
                    </motion.div>
                  );

                case 'verification':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <div style={styles.verificationCard}>
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
                    </motion.div>
                  );

                case 'error':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <div style={styles.errorCard}>
                        <span style={styles.errorIcon}>!</span>
                        <span style={styles.errorText}>{card.message}</span>
                      </div>
                    </motion.div>
                  );

                default:
                  return null;
              }
            })}

            {/* Active thinking indicators — pinned at bottom of stream */}
            <AnimatePresence>
              {thinkingArray.map(agent => (
                <ActiveThinkingCard
                  key={agent.agentId}
                  agent={agent}
                  profile={profileMap.get(agent.role)}
                />
              ))}
            </AnimatePresence>
          </>
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
