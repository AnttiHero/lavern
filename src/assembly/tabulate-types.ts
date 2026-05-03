/**
 * Tabulate Result Types — the structured shape produced by the Tabulate
 * workflow's orchestrator and consumed by the format converters and the
 * frontend table preview.
 *
 * Strict so the assembler can tell the difference between a half-formed
 * model output and a real result. The orchestrator prompt guarantees this
 * shape; we still validate at the assembler boundary.
 */

export type CellType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'currency'
  | 'duration'
  | 'enum'
  | 'text';

export interface CurrencyValue {
  amount: number;
  currency: string;
}

export interface DurationValue {
  count: number;
  unit: 'days' | 'months' | 'years' | 'business_days';
}

export type CellValue =
  | string
  | number
  | boolean
  | null
  | CurrencyValue
  | DurationValue;

/** A single cell with provenance + confidence. */
export interface TableCell {
  value: CellValue;
  /** Where in the source document this cell came from (e.g. "Schedule 1 row 3"). */
  source: string;
  /** Model self-rated confidence 0.0–1.0. Anything < 0.7 is flagged in the deliverable. */
  confidence: number;
}

/** A column definition. */
export interface TableColumn {
  /** Column key — used as the row[].cells map key. kebab_case or snake_case. */
  key: string;
  /** Human-readable header (rendered in the deliverable). */
  label: string;
  /** Type — drives format-converter rendering rules. */
  type: CellType;
  /** Optional — for type:'enum', the list of allowed values. */
  enum?: string[];
}

export interface TableRow {
  /** Map from column key → cell. Missing keys are rendered as empty. */
  cells: Record<string, TableCell>;
}

export interface ExtractedTable {
  /** kebab-case ID — used as the CSV filename + DOCX section anchor. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Where this table lives in the source document (e.g. "Schedule 2"). */
  source: string;
  /** One-sentence description. */
  description: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** Optional schema-level notes / footnotes the document had. */
  notes?: string;
}

export interface DefinedTerm {
  term: string;
  meaning: string;
  source: string;
}

export interface SpecialistReferral {
  clause: string;
  why: string;
  specialist: string;
}

export interface TabulateResult {
  documentTitle: string;
  summary: string;
  tables: ExtractedTable[];
  definedTerms: DefinedTerm[];
  specialistReferrals: SpecialistReferral[];
}
