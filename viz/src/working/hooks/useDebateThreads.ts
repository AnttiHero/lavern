/**
 * useDebateThreads — Groups finding → challenge → response → resolution
 * into visual conversation threads.
 *
 * Input:  flat streamCards[]
 * Output: debateThreads Map + threadedStream[] (with challenge/response/resolution
 *         absorbed into their parent thread, removed from the flat stream).
 */

import { useMemo } from 'react';
import type { StreamCard } from './useWorkingState.js';

type FindingCard = Extract<StreamCard, { kind: 'finding' }>;
type ChallengeCard = Extract<StreamCard, { kind: 'challenge' }>;
type ResponseCard = Extract<StreamCard, { kind: 'response' }>;
type ResolutionCard = Extract<StreamCard, { kind: 'resolution' }>;

export interface DebateExchange {
  challenge: ChallengeCard;
  response?: ResponseCard;
}

export interface DebateThread {
  findingId: string;
  finding: FindingCard;
  exchanges: DebateExchange[];
  resolution?: ResolutionCard;
  /** True when there are unresolved challenges. */
  isOpen: boolean;
}

export function useDebateThreads(streamCards: StreamCard[]) {
  return useMemo(() => {
    const threads = new Map<string, DebateThread>();
    const challengeToThread = new Map<string, string>();
    const absorbedIndices = new Set<number>();

    for (let i = 0; i < streamCards.length; i++) {
      const card = streamCards[i];

      if (card.kind === 'finding') {
        threads.set(card.findingId, {
          findingId: card.findingId,
          finding: card,
          exchanges: [],
          resolution: undefined,
          isOpen: false,
        });
      } else if (card.kind === 'challenge') {
        const thread = threads.get(card.targetFindingId);
        if (thread) {
          thread.exchanges.push({ challenge: card });
          thread.isOpen = true;
          challengeToThread.set(card.challengeId, card.targetFindingId);
          absorbedIndices.add(i);
        }
      } else if (card.kind === 'response') {
        const findingId = challengeToThread.get(card.challengeId);
        if (findingId) {
          const thread = threads.get(findingId);
          if (thread) {
            const exchange = thread.exchanges.find(
              e => e.challenge.challengeId === card.challengeId,
            );
            if (exchange) {
              exchange.response = card;
              absorbedIndices.add(i);
            }
          }
        }
      } else if (card.kind === 'resolution') {
        // Heuristic: match resolution to most recent finding with unresolved exchanges.
        // Try category-based matching first, then fall back to recency.
        let bestMatch: string | null = null;
        const topicLower = card.topic.toLowerCase();

        for (const [findingId, thread] of threads) {
          if (thread.resolution) continue;
          if (thread.exchanges.length === 0) continue;
          const catLower = thread.finding.category.toLowerCase();
          if (catLower.includes(topicLower) || topicLower.includes(catLower)) {
            bestMatch = findingId;
            break;
          }
        }

        if (!bestMatch) {
          for (const [findingId, thread] of threads) {
            if (thread.resolution) continue;
            if (thread.exchanges.length > 0) bestMatch = findingId;
          }
        }

        if (bestMatch) {
          const thread = threads.get(bestMatch);
          if (thread) {
            thread.resolution = card;
            thread.isOpen = false;
            absorbedIndices.add(i);
          }
        }
      }
    }

    // Build threadedStream — same as streamCards but with absorbed cards removed.
    // Findings that have threads remain (rendered as DebateThreadCard by the UI).
    const threadedStream: StreamCard[] = [];
    for (let i = 0; i < streamCards.length; i++) {
      if (!absorbedIndices.has(i)) {
        threadedStream.push(streamCards[i]);
      }
    }

    // Only include threads that have at least one exchange
    const debateThreads = new Map<string, DebateThread>();
    for (const [id, thread] of threads) {
      if (thread.exchanges.length > 0) {
        debateThreads.set(id, thread);
      }
    }

    return { debateThreads, threadedStream };
  }, [streamCards]);
}
