/**
 * InsightFeed — Main center area: scrollable feed of HIGH-VALUE insight cards only.
 *
 * v16: Replaced ThinkingStream. Removed all noise:
 *   - tool_used cards (invisible — feeds HeartbeatBand orb tooltips)
 *   - agent_start/stop cards (invisible — feeds HeartbeatBand orb glow)
 *   - search bar (removed)
 *   - ActiveThinkingCards at bottom (moved to HeartbeatBand narrative)
 *
 * Kept: findings, debate threads, quality checks, gates, resolutions,
 *       workflow transitions, verifications, errors.
 *
 * Added: sticky insight counter at top.
 */

import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import type { StreamCard } from '../hooks/useWorkingState.js';
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
import { EmptyState } from './EmptyState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import { streamCardEntrance } from '../styles/animations.js';

interface InsightFeedProps {
  cards: StreamCard[];
  team: AgentProfile[];
  onGateClick: () => void;
  isConnected: boolean;
  debateThreads: Map<string, DebateThread>;
}

export function InsightFeed({
  cards,
  team,
  onGateClick,
  isConnected,
  debateThreads,
}: InsightFeedProps) {
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
    if (!p) return colors.textMuted;
    if (p.category === 'lawyer') return colors.lawyer;
    if (p.category === 'specialist') return colors.specialist;
    if (p.category === 'infrastructure') return colors.infrastructure;
    if (p.category === 'orchestrator') return colors.orchestrator;
    return colors.textMuted;
  };

  // Auto-scroll to bottom on new cards
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cards.length]);

  // Insight counts for sticky counter
  const counts = useInsightCounts(cards);

  return (
    <div style={styles.container}>
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
              <span style={styles.counterDot}>·</span>
              <span style={styles.counterItem}>
                <span style={styles.counterNum}>{counts.debates}</span>
                {' '}{counts.debates === 1 ? 'debate' : 'debates'}
              </span>
            </>
          )}
          {counts.checks > 0 && (
            <>
              <span style={styles.counterDot}>·</span>
              <span style={styles.counterItem}>
                <span style={styles.counterNum}>{counts.checks}</span>
                {' '}{counts.checks === 1 ? 'check' : 'checks'}
              </span>
            </>
          )}
        </div>
      )}

      {/* Feed */}
      <div ref={scrollRef} style={styles.stream}>
        {cards.length === 0 ? (
          <EmptyState isConnected={isConnected} />
        ) : (
          cards.map((card, i) => {
            const key = `${card.kind}-${i}`;

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
    gap: 10,
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
