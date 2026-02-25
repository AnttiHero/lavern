/**
 * useInsightFilter — Filters stream cards to only show high-value insights.
 *
 * SHOWN: findings, debates, quality checks, gates, resolutions, verifications,
 *        workflow transitions, errors.
 * HIDDEN: tool_used, agent_start, agent_stop — pure noise to human clients.
 *
 * The hidden events still flow through useWorkingState and feed the HeartbeatBand
 * (agent orbs, narrative status) — they're just not rendered as cards.
 */

import { useMemo } from 'react';
import type { StreamCard } from './useWorkingState.js';

const NOISE_KINDS = new Set(['tool_used', 'agent_start', 'agent_stop']);

export function useInsightFilter(streamCards: StreamCard[]): StreamCard[] {
  return useMemo(
    () => streamCards.filter(card => !NOISE_KINDS.has(card.kind)),
    [streamCards],
  );
}

/** Count insight cards by category for the sticky counter. */
export function useInsightCounts(insightCards: StreamCard[]) {
  return useMemo(() => {
    let findings = 0;
    let debates = 0;
    let checks = 0;

    for (const card of insightCards) {
      switch (card.kind) {
        case 'finding':
          findings++;
          break;
        case 'challenge':
        case 'response':
        case 'resolution':
          debates++;
          break;
        case 'quality_check':
        case 'verification':
          checks++;
          break;
      }
    }

    return { findings, debates, checks };
  }, [insightCards]);
}
