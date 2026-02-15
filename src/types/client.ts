/**
 * Client Identity Types — Supports both human and agent clients.
 *
 * Legal Singularity roadmap:
 * - Act 1: Remove lawyers → AI agents do the work
 * - Act 2: Remove clients → AI agents become the consumers
 * - Act 3: Remove the firm → fully autonomous legal services
 *
 * This module enables Act 2 by making clients first-class entities
 * that can be either humans or AI agents.
 */

export interface ClientIdentity {
  /** Client type: human uses the UI, agent uses the API. */
  type: 'human' | 'agent';

  /** Unique client identifier. */
  id: string;

  /** Display name. */
  name?: string;

  /** API key for authentication (hashed in storage). */
  apiKeyHash?: string;

  /** Agent-specific: Webhook URL for gate decisions. */
  callbackUrl?: string;

  /**
   * Agent-specific: Confidence threshold for auto-approval.
   * Gate decisions where the system confidence exceeds this
   * threshold are auto-approved without human review.
   */
  autoApproveThreshold?: number;

  /** Agent-specific: What this agent can do. */
  capabilities?: string[];

  /** When this client was registered. */
  registeredAt: string;

  /** Last activity timestamp. */
  lastActiveAt?: string;
}

/**
 * Create a new client identity with defaults.
 */
export function createClientIdentity(
  type: ClientIdentity['type'],
  id: string,
  options?: Partial<Omit<ClientIdentity, 'type' | 'id' | 'registeredAt'>>
): ClientIdentity {
  return {
    type,
    id,
    registeredAt: new Date().toISOString(),
    ...options,
  };
}

/**
 * API key generation for client authentication.
 * Format: shem_{type}_{random}
 */
export function generateApiKey(clientType: 'human' | 'agent'): string {
  const random = Array.from(
    { length: 32 },
    () => Math.random().toString(36).charAt(2)
  ).join('');
  return `shem_${clientType}_${random}`;
}
