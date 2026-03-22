/**
 * WebSocket Client — Connects to Lavern API server for real-time events.
 *
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Event parsing and dispatch
 * - Ping/pong keepalive
 * - Replay mode support
 */

import type { ShemEvent, WsMessage } from '../types/events.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WsClientOptions {
  onEvent: (event: ShemEvent) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onReplayComplete?: (count: number) => void;
  onError?: (message: string) => void;
}

export class ShemWsClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private options: WsClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastEventIndex = 0;

  constructor(options: WsClientOptions) {
    this.options = options;
  }

  /**
   * Connect to a live session's event stream.
   */
  connectToSession(sessionId: string, fromIndex = 0): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.url = `${protocol}//${host}/api/sessions/${sessionId}/events?from=${fromIndex}`;
    this.lastEventIndex = fromIndex;
    this.connect();
  }

  /**
   * Connect to a replay stream.
   */
  connectToReplay(sessionId: string, speed = 1.0): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.url = `${protocol}//${host}/api/replay/${sessionId}?speed=${speed}`;
    this.connect();
  }

  /**
   * Connect to an arbitrary WebSocket URL.
   * Used by Claw Mode and other non-session event streams.
   */
  connectToUrl(url: string, fromIndex = 0): void {
    this.url = url;
    this.lastEventIndex = fromIndex;
    this.connect();
  }

  /**
   * Disconnect and stop reconnection attempts.
   */
  disconnect(): void {
    this.stopReconnect();
    this.stopPing();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }

    this.options.onStatusChange('disconnected');
  }

  /**
   * Send a message to the server (for replay controls).
   */
  send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Replay controls.
   */
  setSpeed(speed: number): void {
    this.send({ type: 'set_speed', speed });
  }

  pause(): void {
    this.send({ type: 'pause' });
  }

  resume(): void {
    this.send({ type: 'resume' });
  }

  seek(index: number): void {
    this.send({ type: 'seek', index });
  }

  // ── Internal ────────────────────────────────────────────────────────

  private connect(): void {
    this.options.onStatusChange(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    // On reconnection, update the URL to resume from the last seen event index
    // so we don't replay the entire stream from the beginning.
    let connectUrl = this.url;
    if (this.reconnectAttempts > 0 && this.lastEventIndex > 0) {
      try {
        const parsed = new URL(connectUrl);
        if (parsed.searchParams.has('from')) {
          parsed.searchParams.set('from', String(this.lastEventIndex));
          connectUrl = parsed.toString();
        }
      } catch {
        // If URL parsing fails (e.g. relative URL), do a simple regex replace
        connectUrl = connectUrl.replace(/from=\d+/, `from=${this.lastEventIndex}`);
      }
    }

    try {
      this.ws = new WebSocket(connectUrl);
    } catch (err) {
      this.options.onError?.(`Failed to create WebSocket: ${err}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.options.onStatusChange('connected');
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // Ignore unparseable messages
      }
    };

    this.ws.onclose = (event) => {
      this.stopPing();

      if (event.code === 4004) {
        // Session not found — don't reconnect
        this.options.onError?.('Session not found');
        this.options.onStatusChange('disconnected');
        return;
      }

      this.options.onStatusChange('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'connected':
        // Connection metadata — nothing to display
        break;

      case 'live':
        this.lastEventIndex = msg.index;
        this.options.onEvent(msg.event);
        break;

      case 'replay':
        this.options.onEvent(msg.event);
        break;

      case 'replay_complete':
        this.options.onReplayComplete?.(msg.count);
        break;

      case 'replay_start':
        // Replay mode started
        break;

      case 'replay_end':
        // Replay finished
        break;

      case 'error':
        this.options.onError?.(msg.message || 'Unknown error');
        break;

      case 'pong':
        // Keepalive response
        break;

      case 'speed_changed':
      case 'paused':
      case 'resumed':
      case 'seeked':
        // Replay control messages — UI state managed elsewhere
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.options.onError?.('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.options.onStatusChange('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
