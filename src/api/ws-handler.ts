/**
 * WebSocket Event Handler — Bridges ShemEventBus to WebSocket clients.
 *
 * Subscribes to a session's EventBus and sends serialized ShemEvents
 * to connected WebSocket clients. Supports:
 * - Live event streaming
 * - Late-joining clients (event replay from index)
 * - Connection keepalive (ping/pong)
 * - Graceful cleanup on disconnect
 */

import type { WebSocket } from '@fastify/websocket';
import type { SessionState } from '../session/session-state.js';
import type { ShemEvent } from '../events/event-bus.js';

interface WsClientState {
  sessionId: string;
  lastEventIndex: number;
  alive: boolean;
}

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
  const state: WsClientState = {
    sessionId: session.id,
    lastEventIndex: fromIndex,
    alive: true,
  };

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

  // Handle incoming messages from client (e.g., ping, request replay)
  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'ping') {
        safeSend(socket, { type: 'pong', timestamp: new Date().toISOString() });
      } else if (msg.type === 'replay_request') {
        const from = typeof msg.fromIndex === 'number' ? msg.fromIndex : 0;
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
    state.alive = false;
    session.events.off('event', onEvent);
  });

  socket.on('error', () => {
    state.alive = false;
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
    setTimeout(playNext, delay);
  }

  // Start playback
  playNext();

  // Cleanup
  socket.on('close', () => {
    playing = false;
  });
  socket.on('error', () => {
    playing = false;
  });
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
