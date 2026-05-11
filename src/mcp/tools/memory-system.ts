/**
 * Memory System MCP Tool — Boris's CLAUDE.md insight applied to law.
 *
 * v3: Refactored to factory pattern — memoryDir comes from SessionState.
 * Events emitted on memory writes for visualization.
 *
 * Four memory tiers:
 * 1. Session Memory: Current run state (handled by audit trail)
 * 2. Matter Memory: Per-document context that persists across runs
 * 3. Institutional Memory (LEGAL.md): Cross-session learnings
 * 4. Precedent Memory: Successful transformation patterns
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'node:path';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import { readJsonFile, writeJsonFileAtomic, ensureDir } from '../../utils/fs-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Structured tags for memory filtering. All fields optional for backward compat. */
export interface MemoryTags {
  agentRole?: string;        // e.g., 'contract-reviewer'
  engagementType?: string;   // e.g., 'review', 'adversarial'
  documentType?: string;     // e.g., 'NDA', 'ToS'
  jurisdiction?: string;     // e.g., 'US', 'EU'
  custom?: string[];         // free-form tags
}

export interface InstitutionalMemoryEntry {
  id: string;
  category: 'lesson' | 'preference' | 'rule' | 'pattern' | 'warning';
  content: string;
  source: string;
  addedAt: string;
  usageCount: number;
  // v4: Feedback loop extensions (backward-compatible — old files get defaults via migrateMemory)
  effectiveness: number;       // 0-1, updated by feedback loop (default: 0.5)
  lastUsedAt?: string;
  usedInSessions: string[];
  outcomes: { sessionId: string; timestamp: string; applied: boolean; outcomeScore: number; notes?: string }[];
  /** Structured tags for filtered retrieval. */
  tags?: MemoryTags;
}

interface MatterMemoryEntry {
  documentHash: string;
  documentName: string;
  context: Record<string, unknown>;
  findings: string[];
  decisions: string[];
  lastUpdated: string;
}

/** Lighthouse Phase 5: precedent lifecycle status.
 *  Today only `deprecated: boolean` exists. The status field gives us a
 *  third state — `confirmed` — which the Curator promotes to after a
 *  precedent has been seen ≥ CONFIRM_THRESHOLD times with consistent
 *  verdicts. Reader prompts weight `confirmed` precedents higher. */
export type PrecedentStatus = 'tentative' | 'confirmed' | 'deprecated';

export interface PrecedentEntry {
  id: string;
  documentType: string;
  jurisdiction: string;
  patternName: string;
  description: string;
  beforeSnippet: string;
  afterSnippet: string;
  qualityScore: number;
  addedAt: string;
  // v4: Feedback loop extensions (backward-compatible — old files get defaults via migratePrecedent)
  timesUsed: number;
  timesQueried: number;
  effectivenessScore: number;  // weighted moving average (default: qualityScore/4)
  outcomes: { sessionId: string; timestamp: string; applied: boolean; scoreDelta: number; verificationPassed: boolean; notes?: string }[];
  deprecated: boolean;
  deprecationReason?: string;
  /** Structured tags for filtered retrieval. */
  tags?: MemoryTags;
  // ── v5 (lighthouse): lifecycle status ────────────────────────────────
  /** Lifecycle status. Old rows migrate to 'tentative'. The Curator
   *  consolidation pass promotes recurring patterns to 'confirmed'. */
  status?: PrecedentStatus;
  /** ISO timestamp when status was last changed. */
  statusUpdatedAt?: string;
}

// ── Migration helpers (backward-compatible with v3 JSON files) ────────

export function migrateMemory(entry: Partial<InstitutionalMemoryEntry>): InstitutionalMemoryEntry {
  return {
    id: entry.id || 'IM-000',
    category: entry.category || 'lesson',
    content: entry.content || '',
    source: entry.source || 'unknown',
    addedAt: entry.addedAt || new Date().toISOString(),
    usageCount: entry.usageCount ?? 0,
    effectiveness: entry.effectiveness ?? 0.5,
    lastUsedAt: entry.lastUsedAt,
    usedInSessions: entry.usedInSessions ?? [],
    outcomes: entry.outcomes ?? [],
    tags: entry.tags,  // undefined if absent — backward compatible
  };
}

export function migratePrecedent(entry: Partial<PrecedentEntry>): PrecedentEntry {
  // Auto-populate tags from existing fields for untagged precedents
  const autoTags: MemoryTags | undefined = entry.tags ?? (
    (entry.documentType && entry.documentType !== 'unknown') || (entry.jurisdiction && entry.jurisdiction !== 'unknown')
      ? {
          documentType: entry.documentType !== 'unknown' ? entry.documentType : undefined,
          jurisdiction: entry.jurisdiction !== 'unknown' ? entry.jurisdiction : undefined,
        }
      : undefined
  );

  // Lighthouse v5: existing rows default to 'tentative'. If deprecated=true,
  // status is normalized to 'deprecated' so callers can switch on a single field.
  const status: PrecedentStatus = entry.status
    ?? (entry.deprecated ? 'deprecated' : 'tentative');

  return {
    id: entry.id || 'P-000',
    documentType: entry.documentType || 'unknown',
    jurisdiction: entry.jurisdiction || 'unknown',
    patternName: entry.patternName || 'unknown',
    description: entry.description || '',
    beforeSnippet: entry.beforeSnippet || '',
    afterSnippet: entry.afterSnippet || '',
    qualityScore: entry.qualityScore ?? 0,
    addedAt: entry.addedAt || new Date().toISOString(),
    timesUsed: entry.timesUsed ?? 0,
    timesQueried: entry.timesQueried ?? 0,
    effectivenessScore: entry.effectivenessScore ?? (entry.qualityScore ?? 0) / 4,
    outcomes: entry.outcomes ?? [],
    deprecated: entry.deprecated ?? false,
    deprecationReason: entry.deprecationReason,
    tags: autoTags,
    status,
    statusUpdatedAt: entry.statusUpdatedAt,
  };
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createMemoryTools(session: SessionState) {
  const memoryDir = session.memoryDir;

  const addToInstitutionalMemory = tool(
    'add_institutional_memory',
    'Add a learning to institutional memory (LEGAL.md). Use when an agent discovers something that should improve future runs.',
    {
      category: z.enum(['lesson', 'preference', 'rule', 'pattern', 'warning'])
        .describe('Category of the memory'),
      content: z.string()
        .describe('The memory content — what was learned'),
      source: z.string()
        .describe('Where this came from: agent name, session ID, or human feedback'),
      agent_role: z.string().optional()
        .describe('Role of the agent creating this memory (for tagged retrieval)'),
      engagement_type: z.string().optional()
        .describe('Type of engagement: review, adversarial, counsel, etc.'),
      document_type: z.string().optional()
        .describe('Type of document this relates to: NDA, ToS, etc.'),
      jurisdiction: z.string().optional()
        .describe('Jurisdiction this relates to: US, EU, UK, etc.'),
      custom_tags: z.array(z.string()).optional()
        .describe('Additional free-form tags'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'institutional.json');

      // Build tags from optional arguments
      const tags: MemoryTags | undefined = (args.agent_role || args.engagement_type || args.document_type || args.jurisdiction || args.custom_tags?.length)
        ? {
            agentRole: args.agent_role,
            engagementType: args.engagement_type,
            documentType: args.document_type,
            jurisdiction: args.jurisdiction,
            custom: args.custom_tags,
          }
        : undefined;

      // Retry loop to handle concurrent read-modify-write races.
      // writeJsonFileAtomic uses tmp-then-rename which is atomic at the FS level,
      // but two concurrent reads can produce stale data. A simple retry mitigates this.
      let entry!: InstitutionalMemoryEntry;
      let retries = 2;
      while (retries >= 0) {
        const memories = readJsonFile<InstitutionalMemoryEntry[]>(filePath, []);
        entry = {
          id: `IM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          category: args.category,
          content: args.content,
          source: args.source,
          addedAt: new Date().toISOString(),
          usageCount: 0,
          effectiveness: 0.5,
          usedInSessions: [],
          outcomes: [],
          tags,
        };
        memories.push(entry);
        try {
          writeJsonFileAtomic(filePath, memories);
          break;
        } catch (e) {
          if (retries === 0) throw e;
          retries--;
          await new Promise(r => setTimeout(r, 50));
        }
      }

      session.events.emitEvent({
        type: 'memory_saved',
        memoryType: 'institutional',
        key: `${args.category}:${entry.id}`,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Added to institutional memory: ${entry.id} [${args.category}] \u2014 "${args.content.slice(0, 80)}..."`,
        }],
      };
    }
  );

  const queryInstitutionalMemory = tool(
    'query_institutional_memory',
    'Search institutional memory for relevant learnings.',
    {
      category: z.enum(['lesson', 'preference', 'rule', 'pattern', 'warning', 'all']).optional()
        .describe('Filter by category, or "all" for everything'),
      keyword: z.string().optional()
        .describe('Search keyword to filter memories'),
      agent_role: z.string().optional()
        .describe('Filter by agent role tag'),
      engagement_type: z.string().optional()
        .describe('Filter by engagement type tag'),
      document_type: z.string().optional()
        .describe('Filter by document type tag'),
      jurisdiction: z.string().optional()
        .describe('Filter by jurisdiction tag'),
      tag: z.string().optional()
        .describe('Filter by any custom tag'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'institutional.json');
      let memories = readJsonFile<InstitutionalMemoryEntry[]>(filePath, []);

      if (args.category && args.category !== 'all') {
        memories = memories.filter(m => m.category === args.category);
      }
      if (args.keyword) {
        const kw = args.keyword.toLowerCase();
        memories = memories.filter(m => m.content.toLowerCase().includes(kw));
      }
      // Tag-based filtering
      if (args.agent_role) {
        memories = memories.filter(m => m.tags?.agentRole === args.agent_role);
      }
      if (args.engagement_type) {
        memories = memories.filter(m => m.tags?.engagementType === args.engagement_type);
      }
      if (args.document_type) {
        memories = memories.filter(m => m.tags?.documentType === args.document_type);
      }
      if (args.jurisdiction) {
        memories = memories.filter(m => m.tags?.jurisdiction === args.jurisdiction);
      }
      if (args.tag) {
        memories = memories.filter(m => m.tags?.custom?.includes(args.tag!));
      }

      // Update usage counts — best-effort, don't fail the query on write race
      if (memories.length > 0) {
        // Track which memories were queried in this session (for feedback loop)
        for (const m of memories) {
          session.queriedMemoryIds.add(m.id);
        }
        try {
          const all = readJsonFile<InstitutionalMemoryEntry[]>(filePath, []);
          for (const m of memories) {
            const orig = all.find(a => a.id === m.id);
            if (orig) orig.usageCount++;
          }
          writeJsonFileAtomic(filePath, all);
        } catch { /* concurrent write race — usage count update is non-critical */ }
      }

      if (memories.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No institutional memories found matching criteria. This is expected for first runs \u2014 memories accumulate over time.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Institutional Memory (${memories.length} entries)\n\n${memories.map(m => {
            const tagStr = m.tags ? ` {${Object.entries(m.tags).filter(([, v]) => v != null && (!Array.isArray(v) || v.length > 0)).map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(',') : v}`).join(' ')}}` : '';
            return `### ${m.id} [${m.category.toUpperCase()}]${tagStr}\n${m.content}\n_Source: ${m.source} | Added: ${m.addedAt} | Used: ${m.usageCount}x_`;
          }).join('\n\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const saveMatterMemory = tool(
    'save_matter_memory',
    'Save context about a specific document/matter for future reference.',
    {
      document_name: z.string().describe('Name or identifier of the document'),
      document_hash: z.string().describe('Hash or unique ID for the document'),
      context_key: z.string().describe('What aspect to remember'),
      context_value: z.string().describe('The value to remember'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'matters', `${args.document_hash}.json`);
      const matter = readJsonFile<MatterMemoryEntry>(filePath, {
        documentHash: args.document_hash,
        documentName: args.document_name,
        context: {},
        findings: [],
        decisions: [],
        lastUpdated: '',
      });

      matter.context[args.context_key] = args.context_value;
      matter.lastUpdated = new Date().toISOString();
      writeJsonFileAtomic(filePath, matter);

      session.events.emitEvent({
        type: 'memory_saved',
        memoryType: 'matter',
        key: `${args.document_hash}:${args.context_key}`,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Saved matter memory for "${args.document_name}": ${args.context_key} = "${String(args.context_value).slice(0, 60)}..."`,
        }],
      };
    }
  );

  const loadMatterMemory = tool(
    'load_matter_memory',
    'Load previously saved context about a document/matter.',
    {
      document_hash: z.string().describe('Hash or unique ID for the document'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'matters', `${args.document_hash}.json`);
      const matter = readJsonFile<MatterMemoryEntry | null>(filePath, null);

      if (!matter) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No prior matter memory found for this document. This is a fresh analysis.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Matter Memory: ${matter.documentName}\n\n**Last Updated**: ${matter.lastUpdated}\n\n### Context\n${Object.entries(matter.context).map(([k, v]) => `- **${k}**: ${String(v)}`).join('\n')}\n\n### Prior Findings\n${matter.findings.length > 0 ? matter.findings.map(f => `- ${f}`).join('\n') : '(none recorded)'}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const savePrecedent = tool(
    'save_precedent',
    'Save a successful transformation as a precedent pattern.',
    {
      document_type: z.string().describe('Type of document'),
      jurisdiction: z.string().describe('Jurisdiction'),
      pattern_name: z.string().describe('Name for this pattern'),
      description: z.string().describe('Description'),
      before_snippet: z.string().describe('Sample of original text'),
      after_snippet: z.string().describe('Sample of transformed text'),
      quality_score: z.number().describe('Quality score 0-4'),
      agent_role: z.string().optional()
        .describe('Role of the agent saving this precedent (for tagged retrieval)'),
      engagement_type: z.string().optional()
        .describe('Type of engagement: review, adversarial, counsel, etc.'),
      custom_tags: z.array(z.string()).optional()
        .describe('Additional free-form tags'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'precedents.json');
      const precedents = readJsonFile<PrecedentEntry[]>(filePath, []);

      const entry: PrecedentEntry = {
        id: `P-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        documentType: args.document_type,
        jurisdiction: args.jurisdiction,
        patternName: args.pattern_name,
        description: args.description,
        beforeSnippet: args.before_snippet,
        afterSnippet: args.after_snippet,
        qualityScore: args.quality_score,
        addedAt: new Date().toISOString(),
        timesUsed: 0,
        timesQueried: 0,
        effectivenessScore: args.quality_score / 4,
        outcomes: [],
        deprecated: false,
        tags: {
          documentType: args.document_type !== 'unknown' ? args.document_type : undefined,
          jurisdiction: args.jurisdiction !== 'unknown' ? args.jurisdiction : undefined,
          agentRole: args.agent_role,
          engagementType: args.engagement_type,
          custom: args.custom_tags,
        },
      };
      precedents.push(entry);
      writeJsonFileAtomic(filePath, precedents);

      // Track for report card
      session.precedentsSaved.push(entry.id);

      session.events.emitEvent({
        type: 'memory_saved',
        memoryType: 'precedent',
        key: `${args.document_type}:${args.pattern_name}`,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Saved precedent: ${entry.id} "${args.pattern_name}" (${args.document_type}, ${args.jurisdiction}, score: ${args.quality_score}/4)`,
        }],
      };
    }
  );

  const queryPrecedents = tool(
    'query_precedents',
    'Search for relevant precedent transformations. Deprecated precedents are excluded by default.',
    {
      document_type: z.string().optional().describe('Filter by document type'),
      jurisdiction: z.string().optional().describe('Filter by jurisdiction'),
      min_quality: z.number().optional().describe('Minimum quality score (default: 3.0)'),
      include_deprecated: z.boolean().optional().describe('Include deprecated precedents (default: false)'),
      agent_role: z.string().optional().describe('Filter by creating agent role tag'),
      engagement_type: z.string().optional().describe('Filter by engagement type tag'),
      tag: z.string().optional().describe('Filter by any custom tag'),
    },
    async (args) => {
      const filePath = path.join(memoryDir, 'precedents.json');
      let precedents = readJsonFile<Partial<PrecedentEntry>[]>(filePath, []).map(migratePrecedent);

      // Filter deprecated by default
      if (!args.include_deprecated) {
        precedents = precedents.filter(p => !p.deprecated);
      }
      if (args.document_type) {
        precedents = precedents.filter(p => p.documentType === args.document_type);
      }
      if (args.jurisdiction) {
        precedents = precedents.filter(p => p.jurisdiction === args.jurisdiction);
      }
      // Tag-based filtering
      if (args.agent_role) {
        precedents = precedents.filter(p => p.tags?.agentRole === args.agent_role);
      }
      if (args.engagement_type) {
        precedents = precedents.filter(p => p.tags?.engagementType === args.engagement_type);
      }
      if (args.tag) {
        precedents = precedents.filter(p => p.tags?.custom?.includes(args.tag!));
      }
      const minQ = args.min_quality ?? 3.0;
      precedents = precedents.filter(p => p.qualityScore >= minQ);
      precedents.sort((a, b) => b.effectivenessScore - a.effectivenessScore);

      // Track for report card
      for (const p of precedents) {
        if (!session.precedentsQueried.includes(p.id)) {
          session.precedentsQueried.push(p.id);
        }
      }

      if (precedents.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No precedents found matching criteria. Transformation will proceed without precedent guidance.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Relevant Precedents (${precedents.length} found)\n\n**Rule: The live source document ALWAYS outranks stored precedent.** Precedents are advisory context from prior reviews. If a precedent says "this clause type is standard" but the actual document contains non-standard language, trust the document.\n\n${precedents.slice(0, 5).map(p => {
            const tagParts: string[] = [];
            if (p.tags?.agentRole) tagParts.push(`agent:${p.tags.agentRole}`);
            if (p.tags?.engagementType) tagParts.push(`engagement:${p.tags.engagementType}`);
            if (p.tags?.custom?.length) tagParts.push(...p.tags.custom.map((t: string) => `#${t}`));
            const tagStr = tagParts.length > 0 ? ` {${tagParts.join(' ')}}` : '';
            return `### ${p.id}: ${p.patternName} (${p.qualityScore}/4)${tagStr}\n**Type**: ${p.documentType} | **Jurisdiction**: ${p.jurisdiction}\n${p.description}\n\n**Before**: "${p.beforeSnippet.slice(0, 150)}..."\n**After**: "${p.afterSnippet.slice(0, 150)}..."`;
          }).join('\n\n---\n\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [
    addToInstitutionalMemory,
    queryInstitutionalMemory,
    saveMatterMemory,
    loadMatterMemory,
    savePrecedent,
    queryPrecedents,
  ];
}
