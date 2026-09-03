// ── Command Types ────────────────────────────────────────────────────────

export type DispatchCommand =
  | 'status'
  | 'findings'
  | 'scan'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'budget'
  | 'unknown';

// ── Command Parser ──────────────────────────────────────────────────────

export function parseCommand(input: string): DispatchCommand {
  const lower = input.toLowerCase().trim();

  if (/\b(pause)\b/.test(lower)) return 'pause';
  if (/\b(resume|unpause)\b/.test(lower)) return 'resume';
  if (/\b(scan|check|look)\b/.test(lower)) return 'scan';
  if (/\b(retry|failed|errors?)\b/.test(lower)) return 'retry';
  if (/\b(budget|spent|cost|money|balance)\b/.test(lower)) return 'budget';
  if (/\b(critical|flagged|findings?|issues?|problems?|risks?)\b/.test(lower)) return 'findings';
  if (/\b(status|how|what|update|report|summary)\b/.test(lower)) return 'status';

  return 'unknown';
}
