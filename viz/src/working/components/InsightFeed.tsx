/**
 * InsightFeed — The conversation feed: watch your team work.
 *
 * v18: "The Team Chat Room" — ALL events render in the feed, not just
 *      high-value ones. Activity events (tool_used, agent_start, agent_stop)
 *      appear as lightweight ActivityCard messages. Reassurance cards appear
 *      during silent periods. The feed feels alive and continuous.
 *
 * Visual hierarchy:
 *   Rich cards  — FindingCard, ChallengeCard, etc. (white bg, borders, evidence)
 *   Activity    — ActivityCard (no bg, inline text — visually light)
 *   System      — WorkflowStepCard, ReassuranceCard (centered, serif italic)
 */

import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import type { StreamCard, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import type { FeedItem } from '../hooks/useReassuranceInjector.js';
import type { DebateThread } from '../hooks/useDebateThreads.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { useInsightCounts } from '../hooks/useInsightFilter.js';
import { FindingCard } from './FindingCard.js';
import { ChallengeCard } from './ChallengeCard.js';
import { ResponseCard } from './ResponseCard.js';
import { ResolutionCard } from './ResolutionCard.js';
import { QualityCheckCard } from './QualityCheckCard.js';
import { GateCard } from './GateCard.js';
import { WorkflowStepCard } from './WorkflowStepCard.js';
import { DebateThreadCard } from './DebateThreadCard.js';
import { AgentThinkingBubble } from './AgentThinkingBubble.js';
import { ActivityCard } from './ActivityCard.js';
import { ReassuranceCard } from './ReassuranceCard.js';
import { EmptyState } from './EmptyState.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';
import { streamCardEntrance } from '../styles/animations.js';

interface InsightFeedProps {
  cards: FeedItem[];
  team: AgentProfile[];
  onGateClick: () => void;
  isConnected: boolean;
  debateThreads: Map<string, DebateThread>;
  activeThinkingAgents?: Map<string, ActiveThinkingAgent>;
}

export function InsightFeed({
  cards,
  team,
  onGateClick,
  isConnected,
  debateThreads,
  activeThinkingAgents,
}: InsightFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build lookup maps
  const profileMap = useMemo(() => {
    const map = new Map<string, AgentProfile>();
    for (const p of team) map.set(p.role, p);
    return map;
  }, [team]);

  const resolveAgentName = (role: string): string => {
    return profileMap.get(role)?.displayName ?? role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const resolveAgentColor = (role: string): string => {
    const p = profileMap.get(role);
    if (!p) return colors.textMuted;
    return categoryColor(p.category);
  };

  // Auto-scroll to bottom on new cards or thinking agents
  const thinkingCount = activeThinkingAgents?.size ?? 0;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cards.length, thinkingCount]);

  // Insight counts for sticky counter — filter out reassurance items (not StreamCards)
  const streamOnly = useMemo(
    () => cards.filter((c): c is StreamCard => c.kind !== 'reassurance'),
    [cards],
  );
  const counts = useInsightCounts(streamOnly);

  return (
    <main style={styles.container} aria-label="Agent activity feed">
      {/* Sticky insight counter */}
      {(counts.findings > 0 || counts.debates > 0 || counts.checks > 0) && (
        <div style={styles.counterBar}>
          {counts.findings > 0 && (
            <span style={styles.counterItem}>
              <span style={styles.counterNum}>{counts.findings}</span>
              {' '}{counts.findings === 1 ? 'insight' : 'insights'}
            </span>
          )}
          {counts.debates > 0 && (
            <>
              <span style={styles.counterDot}>{'\u00B7'}</span>
              <span style={styles.counterItem}>
                <span style={styles.counterNum}>{counts.debates}</span>
                {' '}{counts.debates === 1 ? 'debate' : 'debates'}
              </span>
            </>
          )}
          {counts.checks > 0 && (
            <>
              <span style={styles.counterDot}>{'\u00B7'}</span>
              <span style={styles.counterItem}>
                <span style={styles.counterNum}>{counts.checks}</span>
                {' '}{counts.checks === 1 ? 'check' : 'checks'}
              </span>
            </>
          )}
        </div>
      )}

      {/* Feed */}
      <div ref={scrollRef} style={styles.stream} aria-live="polite" aria-relevant="additions">
        {cards.length === 0 && !thinkingCount ? (
          <EmptyState isConnected={isConnected} team={team} />
        ) : (
          <>
            {cards.map((card) => {
              // Stable keys: use unique card IDs where available, timestamp as fallback
              const key = card.kind === 'reassurance'
                ? `reassurance-${card.timestamp}`
                : 'findingId' in card ? `${card.kind}-${card.findingId}`
                : 'challengeId' in card ? `${card.kind}-${card.challengeId}`
                : 'responseId' in card ? `${card.kind}-${card.responseId}`
                : 'resolutionId' in card ? `${card.kind}-${card.resolutionId}`
                : 'agentId' in card ? `${card.kind}-${card.agentId}-${card.timestamp}`
                : `${card.kind}-${card.timestamp}`;

              // Reassurance messages (injected by useReassuranceInjector)
              if (card.kind === 'reassurance') {
                return (
                  <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                    <ReassuranceCard message={card.message} />
                  </motion.div>
                );
              }

              // Finding with debate thread → composite card
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

                // Activity events — lightweight speech bubble messages
                case 'agent_start':
                case 'agent_stop':
                case 'tool_used':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <ActivityCard card={card} profileMap={profileMap} />
                    </motion.div>
                  );

                case 'finding':
                  return (
                    <motion.div key={key} variants={streamCardEntrance} initial="hidden" animate="visible">
                      <FindingCard
                        card={card}
                        resolveAgentName={resolveAgentName}
                        agentColor={resolveAgentColor(card.agent)}
                        profile={profileMap.get(card.agent)}
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
                        profile={profileMap.get(card.challenger)}
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
                        profile={profileMap.get(card.responder)}
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

            {/* Active agent thinking bubbles — ephemeral, at bottom of feed */}
            {activeThinkingAgents && Array.from(activeThinkingAgents.entries()).map(([role, agent]) => (
              <motion.div
                key={`thinking-${role}`}
                variants={streamCardEntrance}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
              >
                <AgentThinkingBubble
                  agent={agent}
                  profile={profileMap.get(role)}
                />
              </motion.div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    overflow: 'hidden',
  },
  counterBar: {
    padding: '8px 20px',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  counterItem: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textMuted,
  },
  counterNum: {
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  counterDot: {
    fontSize: 10,
    color: colors.textDim,
    margin: '0 2px',
  },
  stream: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
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
    border: '1px solid rgba(196, 93, 62, 0.2)',
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
