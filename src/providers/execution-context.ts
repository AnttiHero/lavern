/**
 * Execution context — the provider and egress policy a session was created
 * with, carried explicitly to every session-scoped model call.
 *
 * Before this, crossProviderChat read the GLOBAL config.provider, so a
 * session that chose Mistral (EU) or local (zero egress) had its follow-up
 * work — conversation, revision, derivatives, reassembly — sent to whatever
 * the server default was. Callers must pass this context; the global is
 * only for work that has no session.
 */
import { config } from '../config.js';
import type { LLMProviderId } from './cross-provider-chat.js';

export interface ExecutionContext {
  readonly sessionId: string;
  readonly provider: LLMProviderId;
  /** Where the session's text is allowed to travel. */
  readonly egress: 'us' | 'eu' | 'none';
}

export function egressFor(provider: LLMProviderId): ExecutionContext['egress'] {
  return provider === 'local' ? 'none' : provider === 'mistral' ? 'eu' : 'us';
}

/** Immutable context for a live or archive-hydrated session. */
export function executionContextFor(session: { id: string; provider?: string | null }): ExecutionContext {
  const provider = (session.provider ?? config.provider) as LLMProviderId;
  return Object.freeze({ sessionId: session.id, provider, egress: egressFor(provider) });
}
