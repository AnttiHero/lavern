/**
 * Authentication Middleware — Dual auth for API clients + browser users.
 *
 * Two authentication paths:
 * 1. Bearer token (API clients / agents): Authorization: Bearer shem_agent_abc123...
 * 2. Cookie (browser users): lavern_token=<token> (HttpOnly, set by /api/auth/login)
 *
 * If neither is present and the path isn't public, returns 401.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'node:crypto';
import type { ClientIdentity } from '../../types/client.js';
import { createClientIdentity, generateApiKey } from '../../types/client.js';
import { CreateClientSchema, validateBody, type CreateClientBody } from './validation.js';
import { isUrlSafe } from '../../utils/url-safety.js';
import { getUserByToken as dbGetUserByToken, saveApiClient, getApiClientByKeyHash, getAllApiClients, removeApiClient as dbRemoveApiClient, updateApiClientLastActive } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AUTH');

/**
 * SQLite-backed client registry with in-memory cache for fast lookups.
 * Survives server restarts — clients are loaded from DB on construction.
 */
export class ClientRegistry {
  private clients = new Map<string, ClientIdentity>();
  private keyHashToClientId = new Map<string, string>();
  private _loaded = false;

  /**
   * Load all clients from SQLite into memory cache.
   * Call this after initDatabase() during server startup.
   */
  loadFromDb(): void {
    if (this._loaded) return;
    try {
      const dbClients = getAllApiClients();
      for (const row of dbClients) {
        try {
          const client: ClientIdentity = {
            type: row.type as 'human' | 'agent',
            id: row.id,
            name: row.name || undefined,
            apiKeyHash: row.api_key_hash,
            callbackUrl: row.callback_url || undefined,
            autoApproveThreshold: row.auto_approve_threshold ?? undefined,
            capabilities: JSON.parse(row.capabilities || '[]'),
            registeredAt: row.created_at,
            lastActiveAt: row.last_active_at || undefined,
          };
          this.clients.set(client.id, client);
          this.keyHashToClientId.set(row.api_key_hash, client.id);
        } catch {
          logger.warn('Skipping corrupt client row', { id: row.id });
        }
      }
      if (dbClients.length > 0) {
        logger.info(`Loaded ${dbClients.length} API client${dbClients.length === 1 ? '' : 's'} from database`);
      }
    } catch {
      // DB not initialized yet — that's OK, we'll work in-memory only
      logger.info('Database not available — client registry running in-memory only');
    }
    this._loaded = true;
  }

  /**
   * Register a new client and return their API key.
   * Persists to SQLite so it survives restarts.
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
    const id = `client-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const apiKey = generateApiKey(type);
    const keyHash = hashApiKey(apiKey);

    const client = createClientIdentity(type, id, {
      name: options?.name,
      callbackUrl: options?.callbackUrl,
      autoApproveThreshold: options?.autoApproveThreshold,
      capabilities: options?.capabilities,
      apiKeyHash: keyHash,
    });

    // Persist to SQLite
    try {
      saveApiClient({
        id: client.id,
        type: client.type,
        name: client.name || '',
        apiKeyHash: keyHash,
        callbackUrl: client.callbackUrl,
        autoApproveThreshold: client.autoApproveThreshold,
        capabilities: client.capabilities,
        registeredAt: client.registeredAt,
      });
    } catch (err) {
      logger.error('Failed to persist client to database', { error: err });
      // Continue — in-memory still works
    }

    // Update memory cache
    this.clients.set(id, client);
    this.keyHashToClientId.set(keyHash, id);

    return { client, apiKey };
  }

  /**
   * Authenticate a client by API key.
   * Checks memory cache first, falls back to SQLite for keys created before this boot.
   */
  authenticate(apiKey: string): ClientIdentity | null {
    const keyHash = hashApiKey(apiKey);

    // Fast path: memory cache
    let clientId = this.keyHashToClientId.get(keyHash);
    if (clientId) {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastActiveAt = new Date().toISOString();
        // Async update — fire and forget (don't slow down auth)
        try { updateApiClientLastActive(client.id); } catch { /* best effort */ }
        return client;
      }
    }

    // Slow path: check SQLite (for clients registered before cache was loaded)
    try {
      const row = getApiClientByKeyHash(keyHash);
      if (row) {
        const client: ClientIdentity = {
          type: row.type as 'human' | 'agent',
          id: row.id,
          name: row.name || undefined,
          apiKeyHash: row.api_key_hash,
          callbackUrl: row.callback_url || undefined,
          autoApproveThreshold: row.auto_approve_threshold ?? undefined,
          capabilities: JSON.parse(row.capabilities || '[]'),
          registeredAt: row.created_at,
          lastActiveAt: new Date().toISOString(),
        };
        // Populate cache
        this.clients.set(client.id, client);
        this.keyHashToClientId.set(keyHash, client.id);
        try { updateApiClientLastActive(client.id); } catch { /* best effort */ }
        return client;
      }
    } catch { /* DB not ready */ }

    return null;
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

    // Remove from SQLite
    try { dbRemoveApiClient(id); } catch { /* best effort */ }

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
 * Parse the lavern_token from a cookie header string.
 */
export function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').find(c => c.trim().startsWith('lavern_token='));
  if (!match) return null;
  const idx = match.indexOf('=');
  return idx >= 0 ? match.slice(idx + 1).trim() || null : null;
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
  publicPaths: string[] = ['/health', '/'],
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
        // but NOT the base path itself (e.g., /api/sessions).
        if (path.endsWith('/*')) {
          const prefix = path.slice(0, -1); // "/api/sessions/"
          return urlPath.startsWith(prefix);
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
    if (isPublic) {
      // Bug fix: even on public routes, opportunistically populate
      // request.userId from the cookie (or Bearer) so that PER-ROUTE
      // ownership checks can work. Previously the early return meant
      // a logged-in user hitting `GET /api/sessions/:id/download` (a
      // public capability-token route) had request.userId === undefined,
      // and any `checkSessionOwnership()` call would 404 even with a
      // valid cookie. We try both auth paths and silently ignore any
      // failure — the route is public; auth is best-effort here.
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const apiKey = authHeader.slice(7).trim();
        if (apiKey) {
          const client = registry.authenticate(apiKey);
          if (client) {
            (request as FastifyRequest & { client?: ClientIdentity; userId?: string }).client = client;
            (request as FastifyRequest & { userId?: string }).userId = client.id;
          }
        }
      } else {
        const cookieToken = parseCookieToken(request.headers.cookie);
        if (cookieToken) {
          try {
            const user = dbGetUserByToken(cookieToken);
            if (user) {
              (request as FastifyRequest & { userId?: string; user?: { id: string; email: string; displayName: string } }).userId = user.id;
              (request as FastifyRequest & { user?: { id: string; email: string; displayName: string } }).user = {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
              };
            }
          } catch {
            // Public route — auth failure is fine, fall through.
          }
        }
      }
      return;
    }

    // Path 1: Bearer token auth (API clients / agents)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const apiKey = authHeader.slice(7).trim();
      if (apiKey) {
        const client = registry.authenticate(apiKey);
        if (client) {
          (request as FastifyRequest & { client?: ClientIdentity; userId?: string }).client = client;
          (request as FastifyRequest & { userId?: string }).userId = client.id;
          return;
        }
      }
    }

    // Path 2: Cookie-based auth (browser users)
    const cookieToken = parseCookieToken(request.headers.cookie);
    if (cookieToken) {
      try {
        const user = dbGetUserByToken(cookieToken);
        if (user) {
          (request as FastifyRequest & { userId?: string; user?: { id: string; email: string; displayName: string } }).userId = user.id;
          (request as FastifyRequest & { user?: { id: string; email: string; displayName: string } }).user = {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
          };
          return;
        }
      } catch {
        // DB not ready yet or token invalid — fall through to 401
      }
    }

    // Neither auth method succeeded
    const err = new Error('Authentication required. Provide: Authorization: Bearer <api_key> or login via /api/auth/login');
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
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

    // SSRF prevention — validate callbackUrl points to a public host before
    // we store it. Otherwise an attacker can register a client with
    // callbackUrl=http://169.254.169.254/... and use any webhook-mode
    // session as a metadata-service exfil channel.
    if (body.callbackUrl && !isUrlSafe(body.callbackUrl)) {
      return reply.status(400).send({
        error: 'Invalid callbackUrl',
        details: 'callbackUrl must be an HTTPS URL pointing to a public host. Private IPs, localhost, and link-local addresses are blocked.',
      });
    }

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
