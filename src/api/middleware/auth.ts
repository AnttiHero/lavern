/**
 * Authentication Middleware — Simple Bearer token auth for API clients.
 *
 * MVP implementation:
 * - In-memory client registry (persistent storage in future)
 * - Bearer token authentication
 * - Client identity attached to request for downstream use
 *
 * Usage:
 *   Authorization: Bearer shem_agent_abc123...
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'node:crypto';
import type { ClientIdentity } from '../../types/client.js';
import { createClientIdentity, generateApiKey } from '../../types/client.js';
import { CreateClientSchema, validateBody, type CreateClientBody } from './validation.js';

/**
 * In-memory client registry.
 * Maps API key hash → ClientIdentity.
 */
export class ClientRegistry {
  private clients = new Map<string, ClientIdentity>();
  private keyHashToClientId = new Map<string, string>();

  /**
   * Register a new client and return their API key.
   */
  registerClient(
    type: ClientIdentity['type'],
    options?: {
      name?: string;
      callbackUrl?: string;
      autoApproveThreshold?: number;
      capabilities?: string[];
    }
  ): { client: ClientIdentity; apiKey: string } {
    const id = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const apiKey = generateApiKey(type);
    const keyHash = hashApiKey(apiKey);

    const client = createClientIdentity(type, id, {
      name: options?.name,
      callbackUrl: options?.callbackUrl,
      autoApproveThreshold: options?.autoApproveThreshold,
      capabilities: options?.capabilities,
      apiKeyHash: keyHash,
    });

    this.clients.set(id, client);
    this.keyHashToClientId.set(keyHash, id);

    return { client, apiKey };
  }

  /**
   * Authenticate a client by API key.
   */
  authenticate(apiKey: string): ClientIdentity | null {
    const keyHash = hashApiKey(apiKey);
    const clientId = this.keyHashToClientId.get(keyHash);
    if (!clientId) return null;

    const client = this.clients.get(clientId);
    if (!client) return null;

    // Update last active
    client.lastActiveAt = new Date().toISOString();
    return client;
  }

  getClient(id: string): ClientIdentity | null {
    return this.clients.get(id) || null;
  }

  getAllClients(): ClientIdentity[] {
    return [...this.clients.values()];
  }

  removeClient(id: string): boolean {
    const client = this.clients.get(id);
    if (!client) return false;

    if (client.apiKeyHash) {
      this.keyHashToClientId.delete(client.apiKeyHash);
    }
    this.clients.delete(id);
    return true;
  }
}

/**
 * Hash an API key for storage.
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Create authentication middleware that validates Bearer tokens.
 * Returns a Fastify onRequest hook.
 *
 * Public path format:
 *   '/health'               — exact match, any method
 *   '/dashboard/'           — prefix match (trailing / + length > 1), any method
 *   'GET /api/sessions'     — exact match, GET only
 *   'GET /api/sessions/*'   — prefix match, GET only (trailing *)
 */
export function createAuthMiddleware(
  registry: ClientRegistry,
  publicPaths: string[] = ['/health', '/', '/api/clients'],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const urlPath = request.url.split('?')[0];

    const isPublic = publicPaths.some(p => {
      // Method-specific: "GET /api/sessions" or "GET /api/sessions/*"
      const spaceIdx = p.indexOf(' ');
      if (spaceIdx > 0) {
        const method = p.slice(0, spaceIdx);
        const path = p.slice(spaceIdx + 1);
        if (request.method !== method) return false;
        // Wildcard prefix: "GET /api/sessions/*" matches /api/sessions/abc/events
        if (path.endsWith('/*')) {
          const prefix = path.slice(0, -1); // "/api/sessions/"
          return urlPath.startsWith(prefix) || urlPath === path.slice(0, -2);
        }
        return urlPath === path;
      }
      // Prefix match: paths ending with / (longer than 1 char)
      if (p.endsWith('/') && p.length > 1) {
        return urlPath.startsWith(p);
      }
      // Exact match
      return urlPath === p;
    });
    if (isPublic) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      const err = new Error('Authentication required. Provide: Authorization: Bearer <api_key>');
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }

    const apiKey = authHeader.slice(7);
    const client = registry.authenticate(apiKey);
    if (!client) {
      const err = new Error('Invalid API key');
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }

    // Attach client identity to request for downstream use
    (request as FastifyRequest & { client?: ClientIdentity }).client = client;
  };
}

/**
 * Register authentication routes.
 */
export function registerAuthRoutes(
  fastify: FastifyInstance,
  registry: ClientRegistry
): void {
  // POST /api/clients — Register a new client
  fastify.post('/api/clients', async (request, reply) => {
    // Validate request body
    const body = validateBody<CreateClientBody>(CreateClientSchema, request, reply);
    if (!body) return; // 400 already sent

    const { client, apiKey } = registry.registerClient(body.type, {
      name: body.name,
      callbackUrl: body.callbackUrl,
      autoApproveThreshold: body.autoApproveThreshold,
      capabilities: body.capabilities,
    });

    return reply.status(201).send({
      clientId: client.id,
      type: client.type,
      name: client.name,
      apiKey, // Only returned once at registration
      message: 'Store this API key securely — it will not be shown again.',
    });
  });

  // GET /api/clients/:id — Get client info (no API key)
  fastify.get('/api/clients/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = registry.getClient(id);

    if (!client) {
      return reply.status(404).send({ error: `Client not found: ${id}` });
    }

    return reply.send({
      id: client.id,
      type: client.type,
      name: client.name,
      registeredAt: client.registeredAt,
      lastActiveAt: client.lastActiveAt,
      capabilities: client.capabilities,
      hasCallbackUrl: !!client.callbackUrl,
    });
  });

  // GET /api/clients — List all clients
  fastify.get('/api/clients', async (_request, reply) => {
    const clients = registry.getAllClients();
    return reply.send({
      clients: clients.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        registeredAt: c.registeredAt,
        lastActiveAt: c.lastActiveAt,
      })),
      total: clients.length,
    });
  });
}
