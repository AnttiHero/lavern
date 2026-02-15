/**
 * Debate Log — Scrolling event feed showing findings, challenges, and resolutions.
 *
 * Warm editorial design — Inter font, white background, muted event colors.
 * Color-coded by severity and event type. Auto-scrolls to latest.
 */

import { useEffect, useRef } from 'react';
import type { ShemEvent } from '../types/events.js';
import { AGENT_LABELS } from '../types/events.js';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';

interface DebateLogProps {
  events: ShemEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  session_start: '#2E7D9C',
  session_end: '#8B6914',
  workflow_step: '#4A7C50',
  agent_start: '#2E7D9C',
  agent_stop: colors.textDim,
  finding_posted: '#B8860B',
  challenge_posted: '#C45D3E',
  response_posted: '#7B5EA7',
  debate_resolved: '#4A7C50',
  gate_requested: '#8B6914',
  gate_decided: '#8B6914',
  verification_run: '#7B5EA7',
  tool_used: colors.textDim,
  cost_update: colors.textDim,
  memory_saved: colors.textDim,
  error: '#C45D3E',
};

const SEVERITY_COLORS: Record<string, string> = {
  RED: '#C45D3E',
  YELLOW: '#B8860B',
  GREEN: '#4A7C50',
};

function formatEvent(event: ShemEvent): { text: string; color: string } {
  const color = EVENT_COLORS[event.type] || colors.textMuted;

  switch (event.type) {
    case 'session_start':
      return { text: `Session started: ${event.sessionId}`, color };
    case 'session_end':
      return { text: `Session complete! Cost: $${event.totalCost.toFixed(2)}`, color };
    case 'workflow_step':
      return { text: `Step: ${event.step}`, color };
    case 'agent_start':
      return { text: `${AGENT_LABELS[event.role] || event.role} started`, color };
    case 'agent_stop':
      return { text: `${AGENT_LABELS[event.role] || event.role} done (${(event.durationMs / 1000).toFixed(1)}s)`, color };
    case 'finding_posted':
      return {
        text: `${AGENT_LABELS[event.agent] || event.agent}: [${event.severity}] ${event.category}`,
        color: SEVERITY_COLORS[event.severity] || color,
      };
    case 'challenge_posted':
      return { text: `${AGENT_LABELS[event.challenger] || event.challenger} challenges ${event.targetFindingId}`, color };
    case 'debate_resolved':
      return { text: `Resolved: ${event.topic} (conf: ${(event.confidence * 100).toFixed(0)}%)`, color };
    case 'gate_requested':
      return { text: `Gate: ${event.gateType} \u2014 ${event.summary}`, color };
    case 'gate_decided':
      return { text: `Gate ${event.gateType}: ${event.decision}`, color };
    case 'verification_run':
      return { text: `Verification [${event.verificationType}]: ${event.passed ? 'Pass' : 'Fail'}`, color };
    case 'error':
      return { text: `Error: ${event.message}`, color };
    default:
      return { text: event.type, color };
  }
}

export function DebateLog({ events }: DebateLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Filter out low-signal events (tool_used, cost_update, memory_saved)
  const significantEvents = events.filter(
    (e) => !['tool_used', 'cost_update', 'memory_saved'].includes(e.type)
  );

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Event Log</h3>
      <div ref={scrollRef} style={styles.logContainer}>
        {significantEvents.length === 0 ? (
          <div style={styles.empty}>Waiting for events...</div>
        ) : (
          significantEvents.map((event, i) => {
            const { text, color } = formatEvent(event);
            const time = new Date(event.timestamp).toLocaleTimeString();

            return (
              <div key={i} style={styles.entry}>
                <span style={styles.time}>{time}</span>
                <span style={{ ...styles.text, color }}>{text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    height: '100%',
    backgroundColor: colors.bgCard,
    borderLeft: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  title: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    padding: '12px 12px 8px',
    textAlign: 'center',
    borderBottom: `1px solid ${colors.border}`,
  },
  logContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: 10,
  },
  empty: {
    color: colors.textDim,
    fontSize: 12,
    fontFamily: fonts.sans,
    textAlign: 'center',
    padding: 20,
  },
  entry: {
    display: 'flex',
    gap: 8,
    marginBottom: 5,
    lineHeight: '1.4',
  },
  time: {
    fontSize: 9,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
    paddingTop: 2,
  },
  text: {
    fontSize: 11,
    fontFamily: fonts.sans,
    wordBreak: 'break-word' as const,
    fontWeight: 400,
  },
};
