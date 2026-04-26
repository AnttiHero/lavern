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

/** Agent currently thinking — derived from agent_start / tool_used / agent_stop. */
export interface ActiveThinkingAgent {
  agentId: string;
  role: string;
  task: string;
  startTimestamp: string;
  toolsUsed: string[];
}

export type StreamCard =
  | { kind: 'workflow_step'; step: WorkflowStep; previousStep: WorkflowStep; timestamp: string }
  | { kind: 'agent_start'; agentId: string; role: string; task: string; timestamp: string }
  | { kind: 'agent_stop'; agentId: string; role: string; durationMs: number; timestamp: string }
  | { kind: 'tool_used'; tool: string; agent?: string; timestamp: string }
  | { kind: 'finding'; findingId: string; agent: string; category: string; severity: Severity; confidence: number; content: string; evidence: string[]; timestamp: string }
  | { kind: 'challenge'; challengeId: string; challenger: string; targetFindingId: string; challengeText: string; evidence: string[]; timestamp: string }
  | { kind: 'response'; responseId: string; responder: string; challengeId: string; accepted: boolean; responseText: string; revisedPosition?: string; timestamp: string }
  | { kind: 'resolution'; resolutionId: string; topic: string; resolution: string; confidence: number; winningPosition: string; evidenceWeight: string; escalationNeeded: boolean; timestamp: string }
  | { kind: 'gate'; gateType: string; summary: string; details: string; timestamp: string; decided?: boolean; decision?: string }
  | { kind: 'verification'; verificationType: string; passed: boolean; confidence: number; timestamp: string }
  | { kind: 'quality_check'; step: string; passed: boolean; score: number; iteration: number; failureReasons: string[]; revisionGuidance: string[]; timestamp: string }
  | { kind: 'verification_pass_started'; pass: string; passIndex: number; totalPasses: number; timestamp: string }
  | { kind: 'verification_pass_completed'; pass: string; passIndex: number; score: number; criticalCount: number; majorCount: number; minorCount: number; timestamp: string }
  | { kind: 'verification_finding'; findingId: string; pass: string; severity: string; location: string; description: string; autoFixable: boolean; timestamp: string }
  | { kind: 'verification_report'; verdict: string; overallScore: number; totalFindings: number; timestamp: string }
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
  activeThinkingAgents: Map<string, ActiveThinkingAgent>;
  findingCounts: Map<string, number>;
  /** Timestamp of the most recent event (for staleness detection). */
  lastEventTimestamp: string | null;
  /** True when the session was not found on the server (expired or evicted). */
  sessionExpired: boolean;
  /** True when the session ended due to an error (orchestrator failure, LLM error, etc.). */
  sessionFailed: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useWorkingState(onSessionEnd?: () => void, teamRoles: string[] = []) {
  const wsClientRef = useRef<ShemWsClient | null>(null);
  const completionFiredRef = useRef(false);
  const sessionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timestamp when 'delivered' step was first detected (for assembly wait timeout). */
  const deliveredAtRef = useRef<number | null>(null);
  /** Stable ref for current sessionId (accessible inside handleEvent without deps). */
  const sessionIdRef = useRef<string | undefined>(undefined);
  // Stable ref for onSessionEnd to avoid restarting effects when callback identity changes
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionFailed, setSessionFailed] = useState(false);
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
    setEvents(prev => {
      const next = [...prev, event];
      if (next.length > 2000) return next.slice(next.length - 1500);
      return next;
    });

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
    } else if (event.type === 'error') {
      // Detect fatal session errors (orchestrator, assembler, or session-level failures)
      const fatalSources = ['orchestrator', 'session', 'document-assembler'];
      if (event.source && fatalSources.includes(event.source)) {
        setSessionFailed(true);
      }
    } else if (event.type === 'session_end') {
      setCompletedSteps(prev =>
        prev.includes('delivered') ? prev : [...prev, 'delivered']
      );
      setCurrentStep('delivered');

      if (sessionIdRef.current?.startsWith('demo-session-')) {
        // Demo sessions: just show the delivered state — user clicks "View Results" to proceed
      } else {
        // Live sessions: don't transition yet — periodic poll will confirm
        // assembledDocument is ready before navigating to Delivery
        if (!deliveredAtRef.current) deliveredAtRef.current = Date.now();
      }
    }
  }, []);

  // Stable ref for handleEvent to avoid re-creating WS client on every render
  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  // ── WebSocket client ──────────────────────────────────────────────────

  useEffect(() => {
    const client = new ShemWsClient({
      onEvent: (event: ShemEvent) => handleEventRef.current(event),
      onStatusChange: setConnectionStatus,
      onReplayComplete: () => {},
      onError: (msg) => {
        console.error('WebSocket error:', msg);
        if (msg === 'Session not found') {
          setSessionExpired(true);
          return; // Don't add to event stream — show dedicated UI instead
        }
        // Surface WS errors in the event stream so users see them in the feed
        handleEventRef.current({
          type: 'error',
          message: msg,
          source: 'websocket',
          timestamp: new Date().toISOString(),
        } as ShemEvent);
      },
    });

    wsClientRef.current = client;
    return () => {
      client.disconnect();
      if (sessionEndTimerRef.current !== null) {
        clearTimeout(sessionEndTimerRef.current);
        sessionEndTimerRef.current = null;
      }
    };
  }, []);

  // ── Sync session state ────────────────────────────────────────────────

  const syncSessionState = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`, { credentials: 'include' });
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
    sessionIdRef.current = id;
    deliveredAtRef.current = null;
    setSessionExpired(false);
    setSessionFailed(false);
    setIsReplay(false);
    setEvents([]);
    setCurrentStep('intake');
    setCompletedSteps([]);
    setCost(undefined);
    setPendingGate(null);
    completionFiredRef.current = false;

    // Demo sessions are handled by useDemoSimulator — skip WS connection
    if (id.startsWith('demo-session-')) {
      setConnectionStatus('connected');
      return;
    }

    wsClientRef.current?.connectToSession(id);
    setTimeout(() => syncSessionState(id), 500);
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
    sessionIdRef.current = undefined;
    deliveredAtRef.current = null;
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

  // ── Periodic completion check ─────────────────────────────────────────
  // Polls the session API to detect completion AND confirm the assembled
  // document is ready before transitioning to Delivery. This ensures the
  // user never sees an "assembling document" spinner on the Delivery screen.

  useEffect(() => {
    if (!sessionId || sessionId.startsWith('demo-session-') || completionFiredRef.current) return;

    // v0.14.5: was 30s — way too aggressive. LLM assembly on long contexts
    // can legitimately take 60–180s. With Counsel's deterministic fast-path
    // it's near-instant, but Review / Full-Bench still go through the LLM.
    // Set to 5 min: at that point we transition with whatever the backend has,
    // since the assembler has a 90s timeout + 1 retry = max ~3 min anyway.
    const MAX_ASSEMBLY_WAIT_MS = 300_000;

    const poll = setInterval(async () => {
      if (completionFiredRef.current) { clearInterval(poll); return; }
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();

        const step = data.workflow?.currentStep;
        const steps = data.workflow?.completedSteps ?? [];
        const isDelivered = step === 'delivered' || steps.includes('delivered');

        // Always sync visible state (step progress, cost) while on Working screen
        if (data.workflow?.currentStep) setCurrentStep(data.workflow.currentStep);
        if (data.workflow?.completedSteps?.length) setCompletedSteps(data.workflow.completedSteps);
        if (data.cost) setCost({ accumulated: data.cost.accumulated, budget: data.cost.budget });

        if (isDelivered) {
          // Record when we first saw 'delivered'
          if (!deliveredAtRef.current) deliveredAtRef.current = Date.now();

          const hasAssembledDoc = !!data.assembledDocument && data.assembledDocument.length > 100;
          const waitedMs = Date.now() - deliveredAtRef.current;

          // Transition when: assembled document is ready, OR 2-min fallback exceeded
          if ((hasAssembledDoc || waitedMs > MAX_ASSEMBLY_WAIT_MS) && !completionFiredRef.current) {
            completionFiredRef.current = true;
            clearInterval(poll);
            if (onSessionEndRef.current) setTimeout(onSessionEndRef.current, 1500);
          }
        }
      } catch { /* ignore */ }
    }, 3_000);

    return () => clearInterval(poll);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Demo simulator ──────────────────────────────────────────────────

  useDemoSimulator({ sessionId, teamRoles, onEvent: handleEvent });

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
          statuses.set(event.agent, {
            ...existing,
            eventCount: existing.eventCount + 1,
            lastActivity: `[${event.severity}] ${event.category}`,
          });
        }
      } else if (event.type === 'challenge_posted') {
        const existing = statuses.get(event.challenger);
        if (existing) {
          statuses.set(event.challenger, {
            ...existing,
            eventCount: existing.eventCount + 1,
            lastActivity: 'Challenging...',
          });
        }
      }
    }

    // Mark currently active agents
    for (const role of activeAgents) {
      const s = statuses.get(role);
      if (s) s.status = 'active';
    }

    // Fallback: if workflow has reached 'delivered', force-complete any stuck agents
    const hasDelivered = events.some(e => e.type === 'workflow_step' && e.step === 'delivered');
    if (hasDelivered) {
      for (const role of activeAgents) {
        const s = statuses.get(role);
        if (s && s.status === 'active') {
          s.status = 'complete';
          s.lastActivity = 'Done';
        }
      }
    }

    // Timeout: if an agent has been active for >10 minutes with no events, mark as timed out
    const now = Date.now();
    const AGENT_TIMEOUT_MS = 10 * 60 * 1000;
    for (const role of activeAgents) {
      const s = statuses.get(role);
      if (!s || s.status !== 'active') continue;
      // Find last event for this agent
      let lastEventTime = 0;
      for (const e of events) {
        if (('role' in e && e.role === role) || ('agent' in e && e.agent === role)) {
          const t = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
          lastEventTime = Math.max(lastEventTime, t);
        }
      }
      if (lastEventTime > 0 && now - lastEventTime > AGENT_TIMEOUT_MS) {
        s.status = 'complete';
        s.lastActivity = 'Timed out';
      }
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
          // Find the matching gate card and mark it decided (immutable update)
          for (let i = cards.length - 1; i >= 0; i--) {
            const c = cards[i];
            if (c.kind === 'gate' && c.gateType === event.gateType && !c.decided) {
              cards[i] = { ...c, decided: true, decision: event.decision };
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

        case 'verification_pass_started':
          cards.push({
            kind: 'verification_pass_started',
            pass: event.pass,
            passIndex: event.passIndex,
            totalPasses: event.totalPasses,
            timestamp: event.timestamp,
          });
          break;

        case 'verification_pass_completed':
          cards.push({
            kind: 'verification_pass_completed',
            pass: event.pass,
            passIndex: event.passIndex,
            score: event.score,
            criticalCount: event.criticalCount,
            majorCount: event.majorCount,
            minorCount: event.minorCount,
            timestamp: event.timestamp,
          });
          break;

        case 'verification_finding':
          cards.push({
            kind: 'verification_finding',
            findingId: event.findingId,
            pass: event.pass,
            severity: event.severity,
            location: event.location,
            description: event.description,
            autoFixable: event.autoFixable,
            timestamp: event.timestamp,
          });
          break;

        case 'verification_report_compiled':
          cards.push({
            kind: 'verification_report',
            verdict: event.verdict,
            overallScore: event.overallScore,
            totalFindings: event.totalFindings,
            timestamp: event.timestamp,
          });
          break;

        case 'tool_used':
          cards.push({
            kind: 'tool_used',
            tool: event.tool,
            agent: event.agent,
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

        // cost_update, memory_saved, session_start, session_end
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

  // ── Derived: active thinking agents (live thinking indicator) ───────

  const activeThinkingAgents = useMemo(() => {
    const agents = new Map<string, ActiveThinkingAgent>();
    for (const event of events) {
      if (event.type === 'agent_start') {
        agents.set(event.role, {
          agentId: event.agentId,
          role: event.role,
          task: event.task,
          startTimestamp: event.timestamp,
          toolsUsed: [],
        });
      } else if (event.type === 'agent_stop') {
        agents.delete(event.role);
      } else if (event.type === 'tool_used' && event.agent) {
        const a = agents.get(event.agent);
        if (a) a.toolsUsed = [...a.toolsUsed, event.tool];
      }
    }
    return agents;
  }, [events]);

  // ── Derived: finding counts per agent ───────────────────────────────

  const findingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      if (event.type === 'finding_posted') {
        counts.set(event.agent, (counts.get(event.agent) ?? 0) + 1);
      }
    }
    return counts;
  }, [events]);

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
    activeThinkingAgents,
    findingCounts,
    lastEventTimestamp: events.length > 0 ? events[events.length - 1].timestamp : null,
    sessionExpired,
    sessionFailed,
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
