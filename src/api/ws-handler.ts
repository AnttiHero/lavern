/**
 * WebSocket Event Handler — Bridges ShemEventBus to WebSocket clients.
 *
 * Subscribes to a session's EventBus and sends serialized ShemEvents
 * to connected WebSocket clients. Supports:
 * - Live event streaming
 * - Late-joining clients (event replay from index)
 * - Connection keepalive (ping/pong)
 * - Graceful cleanup on disconnect
 * - Global connection tracking with max cap (200 concurrent)
 * - Periodic zombie connection sweep (90s no-pong timeout)
 */

import type { WebSocket } from '@fastify/websocket';
import type { SessionState } from '../session/session-state.js';
import type { ShemEvent } from '../events/event-bus.js';
import { config } from '../config.js';

// ── Global Connection Tracking ──────────────────────────────────────────

const MAX_WS_CONNECTIONS = config.maxWsConnections;

interface WsClientState {
  sessionId: string;
  lastEventIndex: number;
  alive: boolean;
  lastPongAt: number;
  socket: WebSocket;
  connectedAt: number;
}

const activeConnections = new Set<WsClientState>();

/** Get current connection count. */
export function getWsConnectionCount(): number {
  return activeConnections.size;
}

/** Periodic zombie sweep — clean up connections that haven't responded to pings. */
const ZOMBIE_SWEEP_INTERVAL_MS = 30_000; // 30 seconds
const ZOMBIE_TIMEOUT_MS = 90_000; // 90 seconds without pong

const zombieSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const state of activeConnections) {
    if (now - state.lastPongAt > ZOMBIE_TIMEOUT_MS) {
      // Zombie connection — terminate
      state.alive = false;
      activeConnections.delete(state);
      try { state.socket.terminate(); } catch { /* best effort */ }
    }
  }
}, ZOMBIE_SWEEP_INTERVAL_MS);
zombieSweepTimer.unref(); // Don't keep the process alive

/**
 * Set up a WebSocket connection for streaming session events.
 *
 * @param socket - The WebSocket connection
 * @param session - The session to stream events from
 * @param fromIndex - Start replaying events from this index (0 = all history)
 */
export function attachEventStream(
  socket: WebSocket,
  session: SessionState,
  fromIndex = 0
): void {
  // Enforce connection cap
  if (activeConnections.size >= MAX_WS_CONNECTIONS) {
    safeSend(socket, { type: 'error', message: `Server at WebSocket capacity (${MAX_WS_CONNECTIONS} connections). Try again later.` });
    socket.close(1013, 'Try again later'); // 1013 = Try Again Later
    return;
  }

  const state: WsClientState = {
    sessionId: session.id,
    lastEventIndex: fromIndex,
    alive: true,
    lastPongAt: Date.now(),
    socket,
    connectedAt: Date.now(),
  };

  // Track globally
  activeConnections.add(state);

  // Send metadata on connect
  const meta = {
    type: 'connected',
    sessionId: session.id,
    eventCount: session.events.getEventCount(),
    replayFrom: fromIndex,
    timestamp: new Date().toISOString(),
  };
  safeSend(socket, meta);

  // Replay missed events for late-joining clients
  if (fromIndex < session.events.getEventCount()) {
    const missedEvents = session.events.getEventsSince(fromIndex);
    for (const event of missedEvents) {
      safeSend(socket, { type: 'replay', event });
      state.lastEventIndex++;
    }
    safeSend(socket, { type: 'replay_complete', count: missedEvents.length });
  }

  // Subscribe to live events
  const onEvent = (event: ShemEvent) => {
    state.lastEventIndex++;
    safeSend(socket, { type: 'live', event, index: state.lastEventIndex });
  };

  session.events.on('event', onEvent);

  // ── Server-initiated heartbeat ──────────────────────────────────────
  // Ping every 30s using the WebSocket protocol-level ping frame.
  // If the client doesn't respond with a pong within 60s, assume the
  // connection is dead and terminate it so the event listener is freed.
  const HEARTBEAT_INTERVAL_MS = 30_000;
  const HEARTBEAT_TIMEOUT_MS = 60_000;

  socket.on('pong', () => {
    state.lastPongAt = Date.now();
  });

  const heartbeatTimer = setInterval(() => {
    if (socket.readyState !== 1) {
      // Socket no longer open — clean up
      clearInterval(heartbeatTimer);
      state.alive = false;
      activeConnections.delete(state);
      session.events.off('event', onEvent);
      return;
    }

    if (Date.now() - state.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
      // No pong received within timeout — terminate dead connection
      clearInterval(heartbeatTimer);
      state.alive = false;
      activeConnections.delete(state);
      session.events.off('event', onEvent);
      socket.terminate();
      return;
    }

    // Send protocol-level ping (client auto-responds with pong)
    try {
      socket.ping();
    } catch {
      // ping() can throw if socket transitions between readyState check and call
      clearInterval(heartbeatTimer);
      state.alive = false;
      activeConnections.delete(state);
      session.events.off('event', onEvent);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Handle incoming messages from client (e.g., ping, request replay)
  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'ping') {
        safeSend(socket, { type: 'pong', timestamp: new Date().toISOString() });
      } else if (msg.type === 'replay_request') {
        const rawFrom = typeof msg.fromIndex === 'number' ? msg.fromIndex : 0;
        const from = Number.isFinite(rawFrom) && rawFrom >= 0 ? Math.floor(rawFrom) : 0;
        const events = session.events.getEventsSince(from);
        for (const event of events) {
          safeSend(socket, { type: 'replay', event });
        }
        safeSend(socket, { type: 'replay_complete', count: events.length });
      }
    } catch {
      // Ignore malformed messages
    }
  });

  // Cleanup on close
  socket.on('close', () => {
    clearInterval(heartbeatTimer);
    state.alive = false;
    activeConnections.delete(state);
    session.events.off('event', onEvent);
  });

  socket.on('error', () => {
    clearInterval(heartbeatTimer);
    state.alive = false;
    activeConnections.delete(state);
    session.events.off('event', onEvent);
  });
}

/**
 * Set up a WebSocket for replaying events from a session's audit log.
 * Plays back events at adjustable speed.
 */
export function attachReplayStream(
  socket: WebSocket,
  events: ShemEvent[],
  speed = 1.0
): void {
  let index = 0;
  let playing = true;
  let currentSpeed = speed;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const meta = {
    type: 'replay_start',
    totalEvents: events.length,
    speed: currentSpeed,
    timestamp: new Date().toISOString(),
  };
  safeSend(socket, meta);

  // Handle speed/pause/resume commands from client
  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'set_speed') {
        currentSpeed = Math.max(0.1, Math.min(10, msg.speed || 1));
        safeSend(socket, { type: 'speed_changed', speed: currentSpeed });
      } else if (msg.type === 'pause') {
        playing = false;
        safeSend(socket, { type: 'paused', index });
      } else if (msg.type === 'resume') {
        playing = true;
        safeSend(socket, { type: 'resumed', index });
        playNext();
      } else if (msg.type === 'seek') {
        index = Math.max(0, Math.min(events.length - 1, msg.index || 0));
        safeSend(socket, { type: 'seeked', index });
      }
    } catch {
      // Ignore malformed messages
    }
  });

  function playNext(): void {
    if (!playing || index >= events.length) {
      if (index >= events.length) {
        safeSend(socket, { type: 'replay_end', totalEvents: events.length });
      }
      return;
    }

    const event = events[index];
    safeSend(socket, { type: 'replay', event, index, total: events.length });
    index++;

    // Calculate delay based on speed (base: 200ms per event)
    const delay = Math.max(20, 200 / currentSpeed);
    pendingTimer = setTimeout(playNext, delay);
  }

  // Cleanup: stop playback and clear timer on disconnect or error
  const cleanup = () => {
    playing = false;
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);

  // Start playback
  playNext();
}

function safeSend(socket: WebSocket, data: unknown): void {
  try {
    if (socket.readyState === 1) { // WebSocket.OPEN
      socket.send(JSON.stringify(data));
    }
  } catch {
    // Ignore send errors on closed sockets
  }
}
