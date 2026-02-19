/**
 * useStreamFilter — Filter the thinking stream by agent and/or text search.
 */

import { useState, useMemo } from 'react';
import type { StreamCard } from './useWorkingState.js';

function getCardAgent(card: StreamCard): string | undefined {
  switch (card.kind) {
    case 'agent_start':
    case 'agent_stop':
      return card.role;
    case 'finding':
      return card.agent;
    case 'challenge':
      return card.challenger;
    case 'response':
      return card.responder;
    default:
      return undefined;
  }
}

function getCardText(card: StreamCard): string {
  switch (card.kind) {
    case 'workflow_step':
      return card.step;
    case 'agent_start':
      return `${card.role} ${card.task}`;
    case 'agent_stop':
      return card.role;
    case 'finding':
      return `${card.agent} ${card.category} ${card.severity} ${card.content}`;
    case 'challenge':
      return `${card.challenger} ${card.challengeText}`;
    case 'response':
      return `${card.responder} ${card.responseText}`;
    case 'resolution':
      return `${card.topic} ${card.resolution} ${card.winningPosition}`;
    case 'gate':
      return `${card.gateType} ${card.summary}`;
    case 'verification':
      return `${card.verificationType} ${card.passed ? 'pass' : 'fail'}`;
    case 'quality_check':
      return `${card.step} ${card.passed ? 'pass' : 'fail'} ${card.failureReasons.join(' ')}`;
    case 'error':
      return card.message;
  }
}

export function useStreamFilter(cards: StreamCard[]) {
  const [filterByAgent, setFilterByAgent] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const filteredCards = useMemo(() => {
    let result = cards;

    if (filterByAgent) {
      result = result.filter(c => {
        const agent = getCardAgent(c);
        // Always show workflow steps, gates, resolutions, and quality checks regardless of agent filter
        if (c.kind === 'workflow_step' || c.kind === 'gate' || c.kind === 'resolution' || c.kind === 'quality_check') return true;
        return agent === filterByAgent;
      });
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(c => getCardText(c).toLowerCase().includes(q));
    }

    return result;
  }, [cards, filterByAgent, searchText]);

  return {
    filteredCards,
    filterByAgent,
    setFilterByAgent,
    searchText,
    setSearchText,
  };
}
