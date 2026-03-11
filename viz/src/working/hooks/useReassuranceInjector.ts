/**
 * useReassuranceInjector — Injects warm reassurance messages into the feed.
 *
 * Monitors the stream for gaps between "high-value" events (findings, debates,
 * gates, quality checks). When >25 seconds elapse without a high-value event,
 * injects a phase-appropriate reassurance message into the feed.
 *
 * Returns a FeedItem[] that interleaves StreamCards with reassurance items.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { StreamCard } from './useWorkingState.js';
import type { WorkflowStep } from '../../types/events.js';
import { PHASE_DESCRIPTIONS } from '../data/phase-descriptions.js';

/** A reassurance message injected into the feed during silences. */
export interface ReassuranceItem {
  kind: 'reassurance';
  message: string;
  timestamp: string;
}

export type FeedItem = StreamCard | ReassuranceItem;

const HIGH_VALUE_KINDS = new Set([
  'finding', 'challenge', 'response', 'resolution',
  'gate', 'quality_check', 'verification', 'verification_report',
  'workflow_step', 'error',
]);

const SILENCE_THRESHOLD_MS = 25_000;

/** Generic reassurance messages for when phase-specific ones run out. */
const GENERIC_MESSAGES = [
  'Everything is working normally \u2014 your team is being thorough',
  'Complex analysis requires deep thinking \u2014 this is expected',
  'Your agents are carefully examining every detail',
  'Good work takes time \u2014 quality over speed',
];

export function useReassuranceInjector(
  streamCards: StreamCard[],
  currentStep: WorkflowStep,
): FeedItem[] {
  const [reassurances, setReassurances] = useState<ReassuranceItem[]>([]);
  const messageIndexRef = useRef(0);
  const lastHighValueTimeRef = useRef(Date.now());
  const lastInjectionTimeRef = useRef(0);

  // Track the last high-value event timestamp
  useEffect(() => {
    for (let i = streamCards.length - 1; i >= 0; i--) {
      if (HIGH_VALUE_KINDS.has(streamCards[i].kind)) {
        lastHighValueTimeRef.current = Date.now();
        break;
      }
    }
  }, [streamCards]);

  // Periodic check for silence gaps
  useEffect(() => {
    const timer = setInterval(() => {
      const sinceLastHighValue = Date.now() - lastHighValueTimeRef.current;
      const sinceLastInjection = Date.now() - lastInjectionTimeRef.current;

      // Only inject if there's been sufficient silence AND we haven't
      // injected recently (avoid flooding)
      if (
        sinceLastHighValue > SILENCE_THRESHOLD_MS &&
        sinceLastInjection > SILENCE_THRESHOLD_MS &&
        streamCards.length > 0 // Don't inject before any events
      ) {
        const phase = PHASE_DESCRIPTIONS[currentStep];
        const phaseMessages = phase?.silenceMessages ?? [];
        const allMessages = [...phaseMessages, ...GENERIC_MESSAGES];

        const message = allMessages[messageIndexRef.current % allMessages.length];
        messageIndexRef.current++;
        lastInjectionTimeRef.current = Date.now();

        setReassurances(prev => {
          const next = [...prev, { kind: 'reassurance' as const, message, timestamp: new Date().toISOString() }];
          // Cap at 50 reassurance messages to prevent unbounded memory growth
          return next.length > 50 ? next.slice(next.length - 30) : next;
        });
      }
    }, 5_000); // Check every 5 seconds

    return () => clearInterval(timer);
  }, [currentStep, streamCards.length]);

  // Reset when step changes — clear stale reassurances to prevent memory leak
  useEffect(() => {
    messageIndexRef.current = 0;
    lastHighValueTimeRef.current = Date.now();
    lastInjectionTimeRef.current = 0;
    setReassurances([]);
  }, [currentStep]);

  // Merge stream cards + reassurance items via single-pass merge (O(n+m))
  return useMemo(() => {
    if (reassurances.length === 0) return streamCards;

    const merged: FeedItem[] = [];
    let ri = 0; // reassurance index

    for (let si = 0; si < streamCards.length; si++) {
      const cardTime = new Date(streamCards[si].timestamp).getTime();
      // Insert any reassurances that belong before this stream card
      while (ri < reassurances.length && new Date(reassurances[ri].timestamp).getTime() <= cardTime) {
        merged.push(reassurances[ri]);
        ri++;
      }
      merged.push(streamCards[si]);
    }

    // Append remaining reassurances (those after all stream cards)
    while (ri < reassurances.length) {
      merged.push(reassurances[ri]);
      ri++;
    }

    return merged;
  }, [streamCards, reassurances]);
}
