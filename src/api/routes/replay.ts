/**
 * Replay & Audit Routes — Replay past sessions, browse audit logs.
 *
 * GET  /api/audit-logs            — List available audit log files
 * GET  /api/audit-logs/:sessionId — Get parsed audit entries for a session
 * GET  /api/replay/:sessionId     — WebSocket replay of a session's events
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readAuditFile, readAuditFileMeta, verifyAuditChain } from '../../utils/audit-persistence.js';
import { attachReplayStream } from '../ws-handler.js';
import type { ShemEvent } from '../../events/event-bus.js';
import { getArchivedSessionById } from '../../db/database.js';

const DEFAULT_AUDIT_DIR = './audit-logs';

/** Audit follow-up: ownership guard. Audit logs contain the full prompt
 *  + every agent decision + every tool call. Treating them as
 *  auth-required-but-globally-readable was the same BOLA pattern as the
 *  archive-list bug closed earlier. Look up the session's owner from
 *  session_archive and compare to the requesting user. */
function getRequestUserId(request: FastifyRequest): string | undefined {
  return (request as FastifyRequest & { userId?: string }).userId;
}

function userOwnsSession(sessionId: string, userId: string | undefined): boolean {
  if (!userId) return false;
  const archived = getArchivedSessionById(sessionId);
  // Pre-archive (in-flight) sessions don't have a row yet — fall back to
  // deny-by-default. Users replay COMPLETED sessions, not running ones.
  if (!archived) return false;
  // Sessions without an owner (legacy / anonymous) → fail closed.
  if (!archived.user_id) return false;
  return archived.user_id === userId;
}

export function registerReplayRoutes(
  fastify: FastifyInstance,
  auditDir: string = DEFAULT_AUDIT_DIR
): void {

  // ── GET /api/audit-logs — List available audit log files ───────────

  fastify.get('/api/audit-logs', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const resolvedDir = path.resolve(auditDir);

    if (!fs.existsSync(resolvedDir)) {
      return reply.send({ logs: [], total: 0, auditDir: resolvedDir });
    }

    const files = fs.readdirSync(resolvedDir)
      .filter((f) => f.endsWith('.jsonl'))
      // Owner-scope: only list sessions the requesting user owns.
      .filter((f) => userOwnsSession(f.replace('.jsonl', ''), userId))
      .map((f) => {
        const filePath = path.join(resolvedDir, f);
        const stat = fs.statSync(filePath);
        const sessionId = f.replace('.jsonl', '');

        // Read only first and last lines for metadata (avoid parsing entire file)
        const meta = readAuditFileMeta(filePath);

        return {
          sessionId,
          filename: f,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          entries: meta.entries,
          startedAt: meta.first?.timestamp as string | undefined,
          endedAt: meta.last?.type === 'session_end' ? meta.last.timestamp as string : undefined,
          complete: meta.last?.type === 'session_end',
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return reply.send({ logs: files, total: files.length, auditDir: resolvedDir });
  });

  // ── GET /api/audit-logs/:sessionId — Parsed audit entries ──────────

  fastify.get('/api/audit-logs/:sessionId', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const { sessionId } = request.params as { sessionId: string };
    // Prevent path traversal — sessionId must be alphanumeric/hyphens/underscores only
    if (!/^[\w-]+$/.test(sessionId)) {
      return reply.status(400).send({ error: 'Invalid session ID format' });
    }
    // Owner-only — audit log contains full prompt + agent decisions.
    if (!userOwnsSession(sessionId, userId)) {
      return reply.status(404).send({ error: `Audit log not found: ${sessionId}` });
    }
    const filePath = path.join(path.resolve(auditDir), `${sessionId}.jsonl`);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: `Audit log not found: ${sessionId}` });
    }

    const entries = readAuditFile(filePath);
    const chain = verifyAuditChain(filePath);

    return reply.send({
      sessionId,
      entries,
      totalEntries: entries.length,
      chainVerification: chain,
    });
  });

  // ── GET /api/replay/:sessionId — WebSocket replay ─────────────────

  fastify.get('/api/replay/:sessionId', { websocket: true }, (socket, request) => {
    const userId = getRequestUserId(request);
    const { sessionId } = request.params as { sessionId: string };
    // Prevent path traversal
    if (!/^[\w-]+$/.test(sessionId)) {
      socket.send(JSON.stringify({ error: 'Invalid session ID format' }));
      socket.close();
      return;
    }
    // Owner-only WebSocket replay. Cookies usually traverse WS handshakes
    // when same-origin, so userId will be populated; if not, fail closed.
    if (!userOwnsSession(sessionId, userId)) {
      socket.send(JSON.stringify({ error: `Audit log not found: ${sessionId}` }));
      socket.close(4004, 'Audit log not found');
      return;
    }
    const filePath = path.join(path.resolve(auditDir), `${sessionId}.jsonl`);

    if (!fs.existsSync(filePath)) {
      socket.send(JSON.stringify({ error: `Audit log not found: ${sessionId}` }));
      socket.close(4004, 'Audit log not found');
      return;
    }

    // Parse audit entries and convert to ShemEvents for replay
    const rawEntries = readAuditFile(filePath);
    const events = auditEntriesToEvents(rawEntries);

    // Support ?speed=N query parameter
    const query = request.query as { speed?: string };
    const parsedSpeed = query.speed ? parseFloat(query.speed) : 1.0;
    const speed = Number.isFinite(parsedSpeed) && parsedSpeed > 0 ? parsedSpeed : 1.0;

    attachReplayStream(socket, events, speed);
  });
}

/**
 * Convert raw audit JSONL entries into ShemEvents for replay.
 * Audit entries are richer than events, so we map them to the
 * event types the visualization understands.
 */
function auditEntriesToEvents(entries: unknown[]): ShemEvent[] {
  const events: ShemEvent[] = [];

  for (const raw of entries) {
    const entry = raw as Record<string, unknown>;
    const timestamp = (entry.timestamp as string) || new Date().toISOString();

    if (entry.type === 'session_start') {
      events.push({
        type: 'session_start',
        sessionId: (entry.sessionId as string) || '',
        document: '',
        timestamp,
      });
    } else if (entry.type === 'session_end') {
      const summary = entry.summary as Record<string, unknown> | undefined;
      events.push({
        type: 'session_end',
        sessionId: (summary?.sessionId as string) || '',
        totalCost: (summary?.totalCostUsd as number) || 0,
        duration: 0,
        timestamp,
      });
    } else if (entry.action) {
      const action = entry.action as string;

      // Parse action string for event type hints
      if (action.startsWith('SubagentStart:')) {
        const role = action.replace('SubagentStart: ', '').split(' (')[0];
        events.push({
          type: 'agent_start',
          agentId: `replay-${events.length}`,
          role,
          task: '',
          timestamp,
        });
      } else if (action.startsWith('SubagentStop:')) {
        const parts = action.replace('SubagentStop: ', '').split(' (');
        const role = parts[0];
        const durationStr = parts[1]?.replace('s)', '') || '0';
        events.push({
          type: 'agent_stop',
          agentId: `replay-${events.length}`,
          role,
          durationMs: (Number.isFinite(parseFloat(durationStr)) ? parseFloat(durationStr) : 0) * 1000,
          timestamp,
        });
      } else if (action.includes('WorkflowStep:')) {
        const step = action.split('WorkflowStep: ')[1]?.trim();
        if (step) {
          events.push({
            type: 'workflow_step',
            step: step as ShemEvent extends { type: 'workflow_step' } ? ShemEvent['step'] : never,
            previousStep: '' as never,
            timestamp,
          });
        }
      } else {
        // Generic tool_used event for all other audit entries
        events.push({
          type: 'tool_used',
          tool: (entry.toolName as string) || action,
          agent: entry.agentRole as string | undefined,
          timestamp,
        });
      }
    }
  }

  return events;
}
