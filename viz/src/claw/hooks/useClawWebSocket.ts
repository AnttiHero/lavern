/**
 * useClawWebSocket — Real-time event stream for Claw Mode.
 *
 * Connects to GET /api/claw/events via WebSocket.
 * On claw_* events, calls update callbacks to merge into useClawData state.
 * Falls back gracefully when WebSocket unavailable (demo mode).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ShemWsClient, type ConnectionStatus } from '../../connection/ws-client.js';
import type { ShemEvent } from '../../types/events.js';

export interface ClawWebSocketCallbacks {
  onScanCompleted?: (newDocs: number, changedDocs: number) => void;
  onJobStarted?: (documentPath: string, trigger: string) => void;
  onJobCompleted?: (documentHash: string, findings: { critical: number; major: number; minor: number }, costUsd: number) => void;
  onJobFailed?: (documentHash: string, error: string) => void;
  onPauseChange?: (paused: boolean) => void;
  onBudgetWarning?: (percentUsed: number) => void;
  onEvent?: (event: ShemEvent) => void;
}

export interface ClawWebSocketState {
  connectionStatus: ConnectionStatus;
  connected: boolean;
}

export function useClawWebSocket(
  enabled: boolean,
  callbacks: ClawWebSocketCallbacks,
): ClawWebSocketState {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const clientRef = useRef<ShemWsClient | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleEvent = useCallback((event: ShemEvent) => {
    const cb = callbacksRef.current;
    cb.onEvent?.(event);

    switch (event.type) {
      case 'claw_scan_completed':
        cb.onScanCompleted?.(event.newDocs, event.changedDocs);
        break;
      case 'claw_job_started':
        cb.onJobStarted?.(event.documentPath, event.trigger);
        break;
      case 'claw_job_completed':
        cb.onJobCompleted?.(event.documentHash, event.findings, event.costUsd);
        break;
      case 'claw_job_failed':
        cb.onJobFailed?.(event.documentHash, event.error);
        break;
      case 'claw_paused':
        cb.onPauseChange?.(true);
        break;
      case 'claw_resumed':
        cb.onPauseChange?.(false);
        break;
      case 'claw_budget_warning':
        cb.onBudgetWarning?.(event.percentUsed);
        break;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      setConnectionStatus('disconnected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/claw/events`;

    const client = new ShemWsClient({
      onEvent: handleEvent,
      onStatusChange: setConnectionStatus,
    });

    client.connectToUrl(wsUrl);
    clientRef.current = client;

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [enabled, handleEvent]);

  return {
    connectionStatus,
    connected: connectionStatus === 'connected',
  };
}
