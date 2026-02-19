/**
 * useWorkingState — Central state hook for the Working screen.
 *
 * Manages WebSocket connection, event processing, and derived state
 * (agent statuses, stream cards, workflow progress, cost, gates).
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ShemWsClient, type ConnectionStatus } from '../../connection/ws-client.js';
import type { ShemEvent, WorkflowStep, Severity } from '../../types/events.js';
import { useDemoSimulator } from './useDemoSimulator.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface AgentStatus {
  role: string;
  status: 'idle' | 'active' | 'complete';
  eventCount: number;
  lastActivity: string;
  taskDescription?: string;
  totalDurationMs: number;
}

export type StreamCard =
  | { kind: 'workflow_step'; step: WorkflowStep; previousStep: WorkflowStep; timestamp: string }
  | { kind: 'agent_start'; agentId: string; role: string; task: string; timestamp: string }
  | { kind: 'agent_stop'; agentId: string; role: string; durationMs: number; timestamp: string }
  | { kind: 'finding'; findingId: string; agent: string; category: string; severity: Severity; confidence: number; content: string; evidence: string[]; timestamp: string }
  | { kind: 'challenge'; challengeId: string; challenger: string; targetFindingId: string; challengeText: string; evidence: string[]; timestamp: string }
  | { kind: 'response'; responseId: string; responder: string; challengeId: string; accepted: boolean; responseText: string; revisedPosition?: string; timestamp: string }
  | { kind: 'resolution'; resolutionId: string; topic: string; resolution: string; confidence: number; winningPosition: string; evidenceWeight: string; escalationNeeded: boolean; timestamp: string }
  | { kind: 'gate'; gateType: string; summary: string; details: string; timestamp: string; decided?: boolean; decision?: string }
  | { kind: 'verification'; verificationType: string; passed: boolean; confidence: number; timestamp: string }
  | { kind: 'quality_check'; step: string; passed: boolean; score: number; iteration: number; failureReasons: string[]; revisionGuidance: string[]; timestamp: string }
  | { kind: 'error'; message: string; source?: string; timestamp: string };

export interface WorkingState {
  connectionStatus: ConnectionStatus;
  sessionId: string | undefined;
  isReplay: boolean;
  replayPaused: boolean;
  replaySpeed: number;
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  cost: { accumulated: number; budget: number } | undefined;
  pendingGate: { gateType: string; summary: string; details: string } | null;
  events: ShemEvent[];
  agentStatuses: Map<string, AgentStatus>;
  streamCards: StreamCard[];
  activeAgentCount: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useWorkingState(onSessionEnd?: () => void, teamRoles: string[] = []) {
  const wsClientRef = useRef<ShemWsClient | null>(null);

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isReplay, setIsReplay] = useState(false);
  const [replayPaused, setReplayPaused] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  // Workflow
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('intake');
  const [completedSteps, setCompletedSteps] = useState<WorkflowStep[]>([]);

  // Cost
  const [cost, setCost] = useState<{ accumulated: number; budget: number } | undefined>();

  // Gate
  const [pendingGate, setPendingGate] = useState<{
    gateType: string;
    summary: string;
    details: string;
  } | null>(null);

  // Raw events
  const [events, setEvents] = useState<ShemEvent[]>([]);

  // ── Event processing ─────────────────────────────────────────────────

  const handleEvent = useCallback((event: ShemEvent) => {
    setEvents(prev => [...prev, event]);

    if (event.type === 'workflow_step') {
      setCurrentStep(event.step);
      setCompletedSteps(prev =>
        prev.includes(event.previousStep) ? prev : [...prev, event.previousStep]
      );
    } else if (event.type === 'cost_update') {
      setCost({ accumulated: event.totalUsd, budget: event.budgetUsd });
    } else if (event.type === 'gate_requested') {
      setPendingGate({
        gateType: event.gateType,
        summary: event.summary,
        details: event.details,
      });
    } else if (event.type === 'gate_decided') {
      setPendingGate(null);
    } else if (event.type === 'session_end') {
      setCompletedSteps(prev =>
        prev.includes('delivered') ? prev : [...prev, 'delivered']
      );
      if (onSessionEnd) {
        setTimeout(onSessionEnd, 2000);
      }
    }
  }, [onSessionEnd]);

  // ── WebSocket client ──────────────────────────────────────────────────

  useEffect(() => {
    const client = new ShemWsClient({
      onEvent: handleEvent,
      onStatusChange: setConnectionStatus,
      onReplayComplete: (count) => {
        console.log(`Replay complete: ${count} events`);
      },
      onError: (msg) => {
        console.error('WebSocket error:', msg);
      },
    });

    wsClientRef.current = client;
    return () => { client.disconnect(); };
  }, [handleEvent]);

  // ── Sync session state ────────────────────────────────────────────────

  const syncSessionState = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.workflow?.currentStep) setCurrentStep(data.workflow.currentStep);
      if (data.workflow?.completedSteps?.length) setCompletedSteps(data.workflow.completedSteps);
      if (data.cost) setCost({ accumulated: data.cost.accumulated, budget: data.cost.budget });
      if (data.pendingGate) {
        setPendingGate({
          gateType: data.pendingGate.gateType,
          summary: data.pendingGate.summary,
          details: data.pendingGate.details,
        });
      }
    } catch { /* ignore */ }
  }, []);

  // ── Connection handlers ───────────────────────────────────────────────

  const connectToSession = useCallback((id: string) => {
    setSessionId(id);
    setIsReplay(false);
    setEvents([]);
    setCurrentStep('intake');
    setCompletedSteps([]);
    setCost(undefined);
    setPendingGate(null);

    if (id.startsWith('demo-session-')) {
      // Demo mode: skip WS connection, set status to connected
      setConnectionStatus('connected');
    } else {
      wsClientRef.current?.connectToSession(id);
      setTimeout(() => syncSessionState(id), 500);
    }
  }, [syncSessionState]);

  const connectToReplay = useCallback((id: string) => {
    setSessionId(id);
    setIsReplay(true);
    setEvents([]);
    setCurrentStep('intake');
    setCompletedSteps([]);
    setCost(undefined);
    setPendingGate(null);
    wsClientRef.current?.connectToReplay(id);
  }, []);

  const disconnect = useCallback(() => {
    wsClientRef.current?.disconnect();
    setSessionId(undefined);
    setConnectionStatus('disconnected');
    setEvents([]);
    setCurrentStep('intake');
    setCompletedSteps([]);
    setCost(undefined);
    setPendingGate(null);
    setIsReplay(false);
  }, []);

  const dismissGate = useCallback(() => {
    setPendingGate(null);
  }, []);

  // Replay controls
  const pause = useCallback(() => {
    wsClientRef.current?.pause();
    setReplayPaused(true);
  }, []);

  const resume = useCallback(() => {
    wsClientRef.current?.resume();
    setReplayPaused(false);
  }, []);

  const setSpeed = useCallback((speed: number) => {
    wsClientRef.current?.setSpeed(speed);
    setReplaySpeed(speed);
  }, []);

  // ── Auto-connect on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      const storedSessionId = sessionStorage.getItem('shem-session-id');
      if (storedSessionId) {
        connectToSession(storedSessionId);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Demo simulator (fires fake events when session is demo-session-*) ─

  useDemoSimulator({
    sessionId,
    teamRoles,
    onEvent: handleEvent,
  });

  // ── Derived: agent statuses ───────────────────────────────────────────

  const agentStatuses = useMemo(() => {
    const statuses = new Map<string, AgentStatus>();
    const activeAgents = new Set<string>();

    for (const event of events) {
      if (event.type === 'agent_start') {
        activeAgents.add(event.role);
        const existing = statuses.get(event.role);
        statuses.set(event.role, {
          role: event.role,
          status: 'active',
          eventCount: (existing?.eventCount ?? 0) + 1,
          lastActivity: 'Working...',
          taskDescription: event.task,
          totalDurationMs: existing?.totalDurationMs ?? 0,
        });
      } else if (event.type === 'agent_stop') {
        activeAgents.delete(event.role);
        const existing = statuses.get(event.role);
        statuses.set(event.role, {
          role: event.role,
          status: 'complete',
          eventCount: (existing?.eventCount ?? 0) + 1,
          lastActivity: `Done (${(event.durationMs / 1000).toFixed(1)}s)`,
          taskDescription: existing?.taskDescription,
          totalDurationMs: (existing?.totalDurationMs ?? 0) + event.durationMs,
        });
      } else if (event.type === 'finding_posted') {
        const existing = statuses.get(event.agent);
        if (existing) {
          existing.eventCount++;
          existing.lastActivity = `[${event.severity}] ${event.category}`;
        }
      } else if (event.type === 'challenge_posted') {
        const existing = statuses.get(event.challenger);
        if (existing) {
          existing.eventCount++;
          existing.lastActivity = 'Challenging...';
        }
      }
    }

    // Mark currently active agents
    for (const role of activeAgents) {
      const s = statuses.get(role);
      if (s) s.status = 'active';
    }

    return statuses;
  }, [events]);

  // ── Derived: stream cards ─────────────────────────────────────────────

  const streamCards = useMemo(() => {
    const cards: StreamCard[] = [];

    for (const event of events) {
      switch (event.type) {
        case 'workflow_step':
          cards.push({
            kind: 'workflow_step',
            step: event.step,
            previousStep: event.previousStep,
            timestamp: event.timestamp,
          });
          break;

        case 'agent_start':
          cards.push({
            kind: 'agent_start',
            agentId: event.agentId,
            role: event.role,
            task: event.task,
            timestamp: event.timestamp,
          });
          break;

        case 'agent_stop':
          cards.push({
            kind: 'agent_stop',
            agentId: event.agentId,
            role: event.role,
            durationMs: event.durationMs,
            timestamp: event.timestamp,
          });
          break;

        case 'finding_posted':
          cards.push({
            kind: 'finding',
            findingId: event.findingId,
            agent: event.agent,
            category: event.category,
            severity: event.severity,
            confidence: event.confidence,
            content: event.content ?? '',
            evidence: event.evidence ?? [],
            timestamp: event.timestamp,
          });
          break;

        case 'challenge_posted':
          cards.push({
            kind: 'challenge',
            challengeId: event.challengeId,
            challenger: event.challenger,
            targetFindingId: event.targetFindingId,
            challengeText: event.challengeText ?? '',
            evidence: event.evidence ?? [],
            timestamp: event.timestamp,
          });
          break;

        case 'response_posted':
          cards.push({
            kind: 'response',
            responseId: event.responseId,
            responder: event.responder,
            challengeId: event.challengeId,
            accepted: event.accepted,
            responseText: event.responseText ?? '',
            revisedPosition: event.revisedPosition,
            timestamp: event.timestamp,
          });
          break;

        case 'debate_resolved':
          cards.push({
            kind: 'resolution',
            resolutionId: event.resolutionId,
            topic: event.topic,
            resolution: event.resolution,
            confidence: event.confidence,
            winningPosition: event.winningPosition ?? '',
            evidenceWeight: event.evidenceWeight ?? '',
            escalationNeeded: event.escalationNeeded ?? false,
            timestamp: event.timestamp,
          });
          break;

        case 'gate_requested':
          cards.push({
            kind: 'gate',
            gateType: event.gateType,
            summary: event.summary,
            details: event.details,
            timestamp: event.timestamp,
          });
          break;

        case 'gate_decided': {
          // Find the matching gate card and mark it decided
          for (let i = cards.length - 1; i >= 0; i--) {
            const c = cards[i];
            if (c.kind === 'gate' && c.gateType === event.gateType && !c.decided) {
              c.decided = true;
              c.decision = event.decision;
              break;
            }
          }
          break;
        }

        case 'verification_run':
          cards.push({
            kind: 'verification',
            verificationType: event.verificationType,
            passed: event.passed,
            confidence: event.confidence,
            timestamp: event.timestamp,
          });
          break;

        case 'quality_check_result':
          cards.push({
            kind: 'quality_check',
            step: event.step,
            passed: event.passed,
            score: event.score,
            iteration: event.iteration,
            failureReasons: event.failureReasons ?? [],
            revisionGuidance: event.revisionGuidance ?? [],
            timestamp: event.timestamp,
          });
          break;

        case 'error':
          cards.push({
            kind: 'error',
            message: event.message,
            source: event.source,
            timestamp: event.timestamp,
          });
          break;

        // tool_used, cost_update, memory_saved, session_start, session_end
        // are processed for side effects only — not shown in stream
      }
    }

    return cards;
  }, [events]);

  const activeAgentCount = useMemo(() => {
    let count = 0;
    for (const s of agentStatuses.values()) {
      if (s.status === 'active') count++;
    }
    return count;
  }, [agentStatuses]);

  // ── Return ────────────────────────────────────────────────────────────

  const state: WorkingState = {
    connectionStatus,
    sessionId,
    isReplay,
    replayPaused,
    replaySpeed,
    currentStep,
    completedSteps,
    cost,
    pendingGate,
    events,
    agentStatuses,
    streamCards,
    activeAgentCount,
  };

  return {
    state,
    connectToSession,
    connectToReplay,
    disconnect,
    dismissGate,
    pause,
    resume,
    setSpeed,
  };
}
