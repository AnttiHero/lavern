/**
 * useInsightFilter — Stream card filter for the conversation feed.
 *
 * v18: The filter is now a pass-through. All events (including tool_used,
 * agent_start, agent_stop) are shown in the feed as lightweight activity
 * messages via ActivityCard. This is the single most impactful change in
 * the Working view redesign — it ensures users ALWAYS see their agents
 * working, even during long analysis phases with no findings.
 */

import { useMemo } from 'react';
import type { StreamCard } from './useWorkingState.js';

export function useInsightFilter(streamCards: StreamCard[]): StreamCard[] {
  return useMemo(() => streamCards, [streamCards]);
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
