/**
 * useNarrativeStatus — Generates contextual status messages for the HeartbeatBand.
 *
 * Priority-based message rotation:
 *   1. Phase description (first 10s after a phase transition)
 *   2. Active agent task description (rotate every 8s)
 *   3. Finding count narrative (when findings exist)
 *   4. Silence reassurance (>15s since last event)
 *   5. Generic team reassurance (>30s since last event)
 *
 * The hook ensures the user ALWAYS sees something meaningful and never
 * stares at a frozen screen wondering if the system is stuck.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { WorkflowStep } from '../../types/events.js';
import type { ActiveThinkingAgent } from './useWorkingState.js';
import { PHASE_DESCRIPTIONS } from '../data/phase-descriptions.js';

const ROTATION_INTERVAL_MS = 8_000;

interface NarrativeOptions {
  currentStep: WorkflowStep;
  activeThinkingAgents: Map<string, ActiveThinkingAgent>;
  lastEventTimestamp: string | null;
  findingCount: number;
  teamSize: number;
}

export function useNarrativeStatus({
  currentStep,
  activeThinkingAgents,
  lastEventTimestamp,
  findingCount,
  teamSize,
}: NarrativeOptions): string {
  const [rotationIndex, setRotationIndex] = useState(0);
  const prevStepRef = useRef(currentStep);

  // Reset rotation when phase changes
  useEffect(() => {
    if (currentStep !== prevStepRef.current) {
      setRotationIndex(0);
      prevStepRef.current = currentStep;
    }
  }, [currentStep]);

  // Rotate messages on interval
  useEffect(() => {
    const timer = setInterval(() => {
      setRotationIndex(prev => prev + 1);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Calculate silence duration
  const [silenceSec, setSilenceSec] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastEventTimestamp) {
        const elapsed = (Date.now() - new Date(lastEventTimestamp).getTime()) / 1000;
        setSilenceSec(Math.floor(elapsed));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastEventTimestamp]);

  // Reset silence counter when new events arrive
  useEffect(() => {
    setSilenceSec(0);
  }, [lastEventTimestamp]);

  // Build the message queue
  const message = useMemo(() => {
    // WorkflowStep is a free string — guard against unknown steps
    const phase = PHASE_DESCRIPTIONS[currentStep] ?? null;
    const stepLabel = currentStep.replace(/_/g, ' ');
    const activeAgents = Array.from(activeThinkingAgents.values());
    const messages: string[] = [];

    // Priority 1: Phase description (always first in queue)
    messages.push(phase?.description ?? `Your team is working on: ${stepLabel}`);

    // Priority 2: Active agent tasks
    for (const agent of activeAgents) {
      const name = agent.role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (agent.task) {
        // Truncate long task descriptions
        const task = agent.task.length > 80 ? agent.task.slice(0, 77) + '...' : agent.task;
        messages.push(`${name} is working: ${task}`);
      }
    }

    // Priority 3: Finding count narrative
    if (findingCount > 0) {
      const plural = findingCount === 1 ? 'insight' : 'insights';
      messages.push(`${findingCount} ${plural} found so far — your team is building a complete picture`);
    }

    // Priority 4: Silence reassurance
    if (silenceSec > 15 && phase?.silenceMessages) {
      messages.push(...phase.silenceMessages);
    }

    // Priority 5: Generic reassurance (for really long silences)
    if (silenceSec > 30) {
      const agentCount = activeAgents.length || 1;
      if (agentCount > 1) {
        messages.push(`${agentCount} agents are working together on your document`);
      } else {
        messages.push('Your specialist is working on your document');
      }
      messages.push('Complex analysis requires deep thinking — this is normal');
    }

    // Pick message based on rotation index
    if (messages.length === 0) return phase?.statusVerb ?? `Working on ${stepLabel}...`;
    return messages[rotationIndex % messages.length];
  }, [currentStep, activeThinkingAgents, findingCount, silenceSec, rotationIndex]);

  return message;
}
