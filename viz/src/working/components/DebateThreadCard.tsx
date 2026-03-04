/**
 * DebateThreadCard — Composite thread: Finding → indented Challenges/Responses → Resolution.
 *
 * Open (unresolved) threads pulse with amber left border.
 * Resolved threads are collapsible — collapsed by default to keep the stream scannable.
 * Children receive avatar profiles for the speech-bubble layout.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { DebateThread } from '../hooks/useDebateThreads.js';
import { FindingCard } from './FindingCard.js';
import { ChallengeCard } from './ChallengeCard.js';
import { ResponseCard } from './ResponseCard.js';
import { ResolutionCard } from './ResolutionCard.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';

interface DebateThreadCardProps {
  thread: DebateThread;
  profileMap: Map<string, AgentProfile>;
}

export function DebateThreadCard({ thread, profileMap }: DebateThreadCardProps) {
  // Resolved threads start collapsed
  const [expanded, setExpanded] = useState(thread.isOpen);

  const resolveAgentName = (role: string): string =>
    profileMap.get(role)?.displayName ?? role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const resolveAgentColor = (role: string): string => {
    const p = profileMap.get(role);
    return p ? categoryColor(p.category) : colors.textMuted;
  };

  const exchangeCount = thread.exchanges.length;
  const isResolved = !!thread.resolution;

  return (
    <div style={{
      ...styles.container,
      animation: thread.isOpen ? 'openDebatePulse 2s ease-in-out infinite' : undefined,
      borderColor: thread.isOpen ? colors.warning : colors.border,
    }}>
      {/* Finding (always visible) */}
      <div style={styles.findingWrapper}>
        <FindingCard
          card={thread.finding}
          resolveAgentName={resolveAgentName}
          agentColor={resolveAgentColor(thread.finding.agent)}
          profile={profileMap.get(thread.finding.agent)}
        />
      </div>

      {/* Thread summary / toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.toggleBar}
      >
        <span style={styles.threadIcon}>
          {thread.isOpen ? '\u25CB' : '\u25CF'}
        </span>
        <span style={{
          ...styles.threadLabel,
          color: thread.isOpen ? colors.warning : colors.success,
        }}>
          {thread.isOpen ? 'Active debate' : 'Resolved'}
        </span>
        <span style={styles.threadMeta}>
          {exchangeCount} exchange{exchangeCount !== 1 ? 's' : ''}
        </span>
        <span style={styles.chevron}>
          {expanded ? '\u25B4' : '\u25BE'}
        </span>
      </button>

      {/* Exchanges + Resolution (collapsible) */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={styles.exchangeContainer}
          >
            {thread.exchanges.map((exchange, i) => (
              <div key={i} style={styles.exchangeGroup}>
                {/* Indented challenge */}
                <div style={styles.indented}>
                  <ChallengeCard
                    card={exchange.challenge}
                    resolveAgentName={resolveAgentName}
                    agentColor={resolveAgentColor(exchange.challenge.challenger)}
                    profile={profileMap.get(exchange.challenge.challenger)}
                  />
                </div>

                {/* Indented response */}
                {exchange.response && (
                  <div style={styles.indented}>
                    <ResponseCard
                      card={exchange.response}
                      resolveAgentName={resolveAgentName}
                      agentColor={resolveAgentColor(exchange.response.responder)}
                      profile={profileMap.get(exchange.response.responder)}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Resolution bar */}
            {isResolved && thread.resolution && (
              <div style={styles.resolutionWrapper}>
                <ResolutionCard card={thread.resolution} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'border-color 0.3s ease',
  },
  findingWrapper: {
    padding: '10px 10px 0 10px',
  },
  toggleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    backgroundColor: colors.bgPanel,
    border: 'none',
    borderTop: `1px solid ${colors.border}`,
    cursor: 'pointer',
    fontFamily: fonts.sans,
    width: '100%',
    textAlign: 'left' as const,
    transition: 'background-color 0.15s ease',
  },
  threadIcon: {
    fontSize: 8,
    flexShrink: 0,
    color: colors.textDim,
  },
  threadLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  threadMeta: {
    fontSize: 10,
    color: colors.textDim,
    flex: 1,
  },
  chevron: {
    fontSize: 10,
    color: colors.textDim,
    flexShrink: 0,
  },
  exchangeContainer: {
    overflow: 'hidden',
  },
  exchangeGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '4px 0',
  },
  indented: {
    marginLeft: 52,
    paddingRight: 10,
  },
  resolutionWrapper: {
    padding: '4px 10px 8px 10px',
  },
};
