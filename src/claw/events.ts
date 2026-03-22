/**
 * ClawEventBus — Singleton event bus for Claw Mode.
 *
 * Claw runs as a daemon, not within user sessions. This singleton
 * ShemEventBus instance is shared across the processor, watcher,
 * and API routes so that WebSocket clients see real-time updates.
 */

import { ShemEventBus } from '../events/event-bus.js';

/** Singleton instance. Created once on import, shared across the process. */
export const clawEventBus = new ShemEventBus();
