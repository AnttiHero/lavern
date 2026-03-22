/**
 * Client Registry — Multi-client isolation for Claw Mode.
 *
 * Each client gets their own subdirectory under ~/.lavern/clients/{clientId}/
 * with isolated: profile.json, state.json, precedents.json, delivery/
 *
 * The registry tracks all configured clients and provides access to
 * their individual resources. The default client (backward compatible)
 * uses the root ~/.lavern/ directory.
 *
 * Directory structure:
 *   ~/.lavern/
 *     profile.json              ← default client (backward compatible)
 *     state.json
 *     clients/
 *       acme-corp/
 *         profile.json
 *         state.json
 *         precedents.json
 *         delivery/
 *       startup-inc/
 *         profile.json
 *         state.json
 *         ...
 *     clients.json              ← client registry index
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonFile, writeJsonFileAtomic, ensureDir } from '../utils/fs-helpers.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { ClawProfile } from './types.js';

const logger = createLogger('CLIENT-REGISTRY');

// ── Types ────────────────────────────────────────────────────────────────

export interface ClientEntry {
  id: string;                    // Kebab-case identifier
  name: string;                  // Display name (e.g., "Acme Corporation")
  dir: string;                   // Absolute path to client directory
  createdAt: string;
  active: boolean;               // Can be deactivated without deletion
}

export interface ClientRegistryState {
  clients: ClientEntry[];
  version: number;
}

// ── Registry ────────────────────────────────────────────────────────────

const REGISTRY_FILE = 'clients.json';

export class ClientRegistry {
  private state: ClientRegistryState;
  private registryPath: string;
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? config.claw.dir;
    this.registryPath = path.join(this.baseDir, REGISTRY_FILE);
    ensureDir(this.baseDir);
    this.state = readJsonFile<ClientRegistryState>(this.registryPath, { clients: [], version: 1 });
  }

  save(): void {
    writeJsonFileAtomic(this.registryPath, this.state);
  }

  // ── Client Management ─────────────────────────────────────────────────

  /**
   * Register a new client. Creates their isolated directory structure.
   */
  addClient(name: string, profile: ClawProfile): ClientEntry {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    if (this.state.clients.some(c => c.id === id)) {
      throw new Error(`Client already exists: ${id}`);
    }

    const clientDir = path.join(this.baseDir, 'clients', id);
    ensureDir(clientDir);
    ensureDir(path.join(clientDir, 'delivery'));
    ensureDir(path.join(clientDir, 'logs'));

    // Write client profile
    writeJsonFileAtomic(path.join(clientDir, 'profile.json'), profile);

    const entry: ClientEntry = {
      id,
      name,
      dir: clientDir,
      createdAt: new Date().toISOString(),
      active: true,
    };

    this.state.clients.push(entry);
    this.save();

    logger.info('Client added', { id, name, dir: clientDir });
    return entry;
  }

  /**
   * Get a client by ID. Returns undefined if not found.
   */
  getClient(id: string): ClientEntry | undefined {
    return this.state.clients.find(c => c.id === id);
  }

  /**
   * List all clients (optionally filtered by active status).
   */
  listClients(activeOnly = true): ClientEntry[] {
    return activeOnly
      ? this.state.clients.filter(c => c.active)
      : this.state.clients;
  }

  /**
   * Deactivate a client (preserves data, stops processing).
   */
  deactivateClient(id: string): boolean {
    const client = this.state.clients.find(c => c.id === id);
    if (!client) return false;
    client.active = false;
    this.save();
    logger.info('Client deactivated', { id });
    return true;
  }

  /**
   * Reactivate a previously deactivated client.
   */
  activateClient(id: string): boolean {
    const client = this.state.clients.find(c => c.id === id);
    if (!client) return false;
    client.active = true;
    this.save();
    logger.info('Client activated', { id });
    return true;
  }

  /**
   * Get the directory for a client's isolated data.
   * Falls back to the default (root) directory for the default client.
   */
  getClientDir(clientId?: string): string {
    if (!clientId || clientId === 'default') {
      return this.baseDir; // Backward compatible — root directory
    }
    const client = this.getClient(clientId);
    if (!client) throw new Error(`Unknown client: ${clientId}`);
    return client.dir;
  }

  /**
   * Load a client's profile from their directory.
   */
  loadClientProfile(clientId?: string): ClawProfile | null {
    const dir = this.getClientDir(clientId);
    const profilePath = path.join(dir, 'profile.json');
    if (!fs.existsSync(profilePath)) return null;
    return readJsonFile<ClawProfile>(profilePath, null as any);
  }

  /**
   * Get summary of all clients.
   */
  get summary(): { total: number; active: number; inactive: number } {
    const active = this.state.clients.filter(c => c.active).length;
    return {
      total: this.state.clients.length,
      active,
      inactive: this.state.clients.length - active,
    };
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

let _instance: ClientRegistry | null = null;

export function getClientRegistry(): ClientRegistry {
  if (!_instance) {
    _instance = new ClientRegistry();
  }
  return _instance;
}

export function resetClientRegistry(): void {
  _instance = null;
}
