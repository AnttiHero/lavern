/**
 * Tabulate Output Extractor — pulls the JSON tabulate result from a
 * Tabulate workflow's finalOutput and validates it into a strict
 * TabulateResult.
 *
 * The orchestrator prompt asks for a single ```json fenced block. We're
 * lenient on:
 *   - JSON outside any fence (model forgot fences)
 *   - Multiple fences (model produced one then explained)
 *   - Trailing commas (light JSON5 tolerance)
 * We are NOT lenient on:
 *   - Missing required fields (tables, columns, rows, cells)
 *   - Wrong types
 *   - Empty tables array (zero tables = a real result, but signals a problem)
 */

import type {
  TabulateResult,
  ExtractedTable,
  TableColumn,
  TableRow,
  TableCell,
  CellType,
  CellValue,
  DefinedTerm,
  SpecialistReferral,
} from './tabulate-types.js';

// ── Public extractor ────────────────────────────────────────────────────

/**
 * Extract a TabulateResult from a Tabulate-workflow finalOutput.
 * Returns null if no valid JSON-shaped tabulate result is found —
 * caller should fall back to the LLM cleanup path or surface an error.
 */
export function extractTabulateResult(finalOutput: string): TabulateResult | null {
  if (!finalOutput) return null;

  // Try every JSON candidate in the output, take the first one that
  // validates as a TabulateResult.
  for (const jsonStr of findJsonCandidates(finalOutput)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try mild JSON5 cleanup — strip trailing commas before } or ]
      try {
        const cleaned = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        parsed = JSON.parse(cleaned);
      } catch {
        continue;
      }
    }

    const validated = validateTabulateResult(parsed);
    if (validated) return validated;
  }

  return null;
}

// ── JSON candidate scanner ──────────────────────────────────────────────

/**
 * Yield every JSON-object substring found in the text.
 * Order: fenced (```json … ```) first, then balanced top-level {…} blocks.
 */
function* findJsonCandidates(text: string): IterableIterator<string> {
  // Markdown-fenced JSON blocks first
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1].trim();
    if (inner.startsWith('{')) yield inner;
  }

  // Then balanced top-level {...} blocks (string-aware)
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        yield text.slice(start, i + 1);
        start = -1;
      }
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────────

const VALID_CELL_TYPES: ReadonlySet<CellType> = new Set([
  'string', 'number', 'boolean', 'date', 'currency', 'duration', 'enum', 'text',
]);

/**
 * Validate raw parsed JSON against the TabulateResult shape.
 * Returns the validated result on success, null on any structural problem.
 */
function validateTabulateResult(raw: unknown): TabulateResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // tables MUST be a non-undefined array. (Empty array = explicit "no tables found" — still valid.)
  if (!Array.isArray(r.tables)) return null;

  const tables: ExtractedTable[] = [];
  for (const t of r.tables) {
    const validated = validateTable(t);
    if (validated) tables.push(validated);
  }

  // No tables at all = signal of a bad extraction. Reject so caller falls back.
  if (tables.length === 0) return null;

  return {
    documentTitle: typeof r.documentTitle === 'string' ? r.documentTitle : 'Untitled',
    summary: typeof r.summary === 'string' ? r.summary : '',
    tables,
    definedTerms: validateDefinedTerms(r.definedTerms),
    specialistReferrals: validateSpecialistReferrals(r.specialistReferrals),
  };
}

function validateTable(raw: unknown): ExtractedTable | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;

  if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) return null;

  const columns: TableColumn[] = [];
  for (const c of t.columns) {
    const validated = validateColumn(c);
    if (validated) columns.push(validated);
  }
  if (columns.length === 0) return null;

  const rows: TableRow[] = [];
  for (const row of t.rows) {
    const validated = validateRow(row, columns);
    if (validated) rows.push(validated);
  }

  return {
    id: typeof t.id === 'string' && t.id.length > 0 ? t.id : `table-${Math.random().toString(16).slice(2, 8)}`,
    title: typeof t.title === 'string' ? t.title : 'Untitled table',
    source: typeof t.source === 'string' ? t.source : '',
    description: typeof t.description === 'string' ? t.description : '',
    columns,
    rows,
    notes: typeof t.notes === 'string' ? t.notes : undefined,
  };
}

function validateColumn(raw: unknown): TableColumn | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.key !== 'string' || c.key.length === 0) return null;
  if (typeof c.label !== 'string' || c.label.length === 0) return null;
  const type = typeof c.type === 'string' && VALID_CELL_TYPES.has(c.type as CellType)
    ? (c.type as CellType)
    : 'string';
  return {
    key: c.key,
    label: c.label,
    type,
    enum: Array.isArray(c.enum) ? c.enum.filter((v): v is string => typeof v === 'string') : undefined,
  };
}

function validateRow(raw: unknown, columns: TableColumn[]): TableRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cellsRaw = r.cells;
  if (!cellsRaw || typeof cellsRaw !== 'object') return null;
  const cellsObj = cellsRaw as Record<string, unknown>;

  const cells: Record<string, TableCell> = {};
  for (const col of columns) {
    const c = cellsObj[col.key];
    if (c === undefined) {
      // Allow missing — render as empty
      continue;
    }
    const validated = validateCell(c);
    if (validated) cells[col.key] = validated;
  }
  return { cells };
}

function validateCell(raw: unknown): TableCell | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!('value' in c)) return null;
  const value = c.value as CellValue;
  return {
    value,
    source: typeof c.source === 'string' ? c.source : '',
    confidence: typeof c.confidence === 'number'
      ? Math.max(0, Math.min(1, c.confidence))
      : 0.5,
  };
}

function validateDefinedTerms(raw: unknown): DefinedTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map(d => ({
      term: typeof d.term === 'string' ? d.term : '',
      meaning: typeof d.meaning === 'string' ? d.meaning : '',
      source: typeof d.source === 'string' ? d.source : '',
    }))
    .filter(d => d.term.length > 0);
}

function validateSpecialistReferrals(raw: unknown): SpecialistReferral[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(s => ({
      clause: typeof s.clause === 'string' ? s.clause : '',
      why: typeof s.why === 'string' ? s.why : '',
      specialist: typeof s.specialist === 'string' ? s.specialist : '',
    }))
    .filter(s => s.specialist.length > 0);
}
