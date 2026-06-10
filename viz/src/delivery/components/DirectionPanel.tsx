import { useMemo, useState } from 'react';
import { useDocumentUpload, type FrontendParsedDocument } from '../../briefing/hooks/useDocumentUpload.js';
import type { DeliveryData, DirectionBlocker } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

type ContinuationScope = 'high_level' | 'section_by_section' | 'responding_report';

interface Props {
  data: DeliveryData;
}

const SCOPE_LABELS: Record<ContinuationScope, string> = {
  high_level: 'High-level critique',
  section_by_section: 'Section-by-section',
  responding_report: 'Responding report',
};

function loadStoredParsedDocs(): FrontendParsedDocument[] {
  try {
    const raw = sessionStorage.getItem('shem-parsed-docs');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is FrontendParsedDocument => {
      return typeof d === 'object' && d !== null && typeof (d as { id?: unknown }).id === 'string';
    }) : [];
  } catch {
    return [];
  }
}

function uniqueDocs(docs: FrontendParsedDocument[]): FrontendParsedDocument[] {
  const seen = new Set<string>();
  const result: FrontendParsedDocument[] = [];
  for (const doc of docs) {
    const key = doc.id || `${doc.name}:${doc.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(doc);
  }
  return result.slice(0, 20);
}

function initialAnswers(blockers: DirectionBlocker[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const blocker of blockers) {
    if (blocker.id === 'deliverable_type') next[blocker.id] = SCOPE_LABELS.high_level;
    if (blocker.id === 'proposed_format') next[blocker.id] = blocker.options?.[0] ?? '';
  }
  return next;
}

function scopeFromLabel(label: string): ContinuationScope {
  if (/responding/i.test(label)) return 'responding_report';
  if (/section/i.test(label)) return 'section_by_section';
  return 'high_level';
}

function renderField(
  blocker: DirectionBlocker,
  value: string,
  onChange: (value: string) => void,
) {
  if (blocker.answerType === 'choice') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={styles.select}>
        <option value="">Choose</option>
        {(blocker.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (blocker.answerType === 'date') {
    return <input type="date" value={value} onChange={e => onChange(e.target.value)} style={styles.input} />;
  }

  if (blocker.answerType === 'textarea') {
    return <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={styles.textarea} />;
  }

  return <input type="text" value={value} onChange={e => onChange(e.target.value)} style={styles.input} />;
}

export function DirectionPanel({ data }: Props) {
  const blockers = data.directionRequest?.blockers ?? [];
  const storedParsedDocs = useMemo(loadStoredParsedDocs, []);
  const upload = useDocumentUpload();
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(blockers));
  const [scope, setScope] = useState<ContinuationScope>(() => scopeFromLabel(answers.deliverable_type ?? ''));
  const [instructions, setInstructions] = useState('');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachedDocs = uniqueDocs([...storedParsedDocs, ...upload.parsedDocuments]);
  const visibleBlockers = blockers.filter(b => b.id !== 'deliverable_type');
  const missingRequired = blockers.filter(b => b.required && !(answers[b.id] ?? '').trim());
  const canSubmit = missingRequired.length === 0 && !upload.parsing && !submitting;

  const setAnswer = (id: string, value: string) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const setScopeAndAnswer = (nextScope: ContinuationScope) => {
    setScope(nextScope);
    setAnswer('deliverable_type', SCOPE_LABELS[nextScope]);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${data.sessionId}/continue`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          documents: attachedDocs,
          documentNotes,
          instructions,
          continuationScope: scope,
          deadline: answers.deadline,
          budgetEnvelope: answers.budget_envelope,
        }),
      });
      const body = await res.json().catch(() => ({})) as { sessionId?: string; error?: string; message?: string };
      if (!res.ok || !body.sessionId) {
        throw new Error(body.error || body.message || 'Unable to continue this matter.');
      }

      try {
        sessionStorage.setItem('shem-continuation-of', data.sessionId);
        sessionStorage.setItem('shem-session-id', body.sessionId);
        sessionStorage.setItem('shem-parsed-docs', JSON.stringify(attachedDocs));
        sessionStorage.removeItem('shem-from-archive');
      } catch {
        sessionStorage.setItem('shem-session-id', body.sessionId);
      }
      window.location.hash = '#/working';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue this matter.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!data.directionRequest) return null;

  return (
    <section id="direction-panel" style={styles.panel}>
      <div style={styles.overline}>Needs Direction</div>
      <h3 style={styles.title}>Answer blockers and continue</h3>
      <p style={styles.copy}>
        Intake is complete. Lavern needs these details before it dispatches the specialist bench.
      </p>

      <div style={styles.scopeRow} role="group" aria-label="Continuation scope">
        {(Object.keys(SCOPE_LABELS) as ContinuationScope[]).map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setScopeAndAnswer(key)}
            style={{ ...styles.scopeBtn, ...(scope === key ? styles.scopeBtnActive : {}) }}
          >
            {SCOPE_LABELS[key]}
          </button>
        ))}
      </div>

      <div style={styles.fields}>
        {visibleBlockers.map(blocker => (
          <label key={blocker.id} style={styles.field}>
            <span style={styles.label}>{blocker.label}</span>
            {renderField(blocker, answers[blocker.id] ?? '', value => setAnswer(blocker.id, value))}
          </label>
        ))}
      </div>

      <div
        style={{ ...styles.dropZone, ...(upload.isDragOver ? styles.dropZoneActive : {}) }}
        onDrop={upload.handleDrop}
        onDragOver={upload.handleDragOver}
        onDragLeave={upload.handleDragLeave}
      >
        <input
          ref={upload.inputRef}
          type="file"
          multiple
          onChange={upload.handleFileInput}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={upload.openFilePicker} style={styles.attachBtn}>
          Attach documents
        </button>
        <span style={styles.dropText}>
          {upload.parsing ? 'Parsing documents...' : 'Drop files here or choose files'}
        </span>
      </div>

      {storedParsedDocs.length > 0 && (
        <div style={styles.carryForward}>
          Carrying forward {storedParsedDocs.length} parsed document{storedParsedDocs.length === 1 ? '' : 's'} from the original intake.
        </div>
      )}

      {upload.error && <div style={styles.error} role="alert">{upload.error}</div>}

      {upload.documents.length > 0 && (
        <div style={styles.docList}>
          {upload.documents.map(doc => (
            <label key={doc.id} style={styles.docNote}>
              <span style={styles.docName}>{doc.name}</span>
              <textarea
                value={documentNotes[doc.id] ?? ''}
                onChange={e => setDocumentNotes(prev => ({ ...prev, [doc.id]: e.target.value }))}
                placeholder="What is this document, and why does it matter?"
                rows={2}
                style={styles.noteTextarea}
              />
              <button type="button" onClick={() => upload.removeDocument(doc.id)} style={styles.removeBtn}>
                Remove
              </button>
            </label>
          ))}
        </div>
      )}

      <label style={styles.field}>
        <span style={styles.label}>What should the team know?</span>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={5}
          style={styles.textarea}
          placeholder="Add explanations, changes, priorities, or anything the specialists should pay attention to."
        />
      </label>

      {error && <div style={styles.error} role="alert">{error}</div>}
      {missingRequired.length > 0 && (
        <div style={styles.missing}>
          {missingRequired.length} required item{missingRequired.length === 1 ? '' : 's'} remaining.
        </div>
      )}

      <div style={styles.actions}>
        <button type="button" onClick={submit} disabled={!canSubmit} style={{ ...styles.submitBtn, ...(!canSubmit ? styles.submitBtnDisabled : {}) }}>
          {submitting ? 'Starting continuation...' : 'Answer blockers & continue'}
        </button>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    border: `1px solid ${colors.borderSelected}`,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    boxShadow: '0 12px 40px rgba(0,0,0,0.06)',
  },
  overline: {
    fontSize: 10,
    fontWeight: 700,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.text,
    margin: 0,
    lineHeight: 1.2,
  },
  copy: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: '10px 0 20px',
  },
  scopeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 8,
    marginBottom: spacing.lg,
  },
  scopeBtn: {
    minHeight: 38,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    backgroundColor: colors.bgPanel,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  scopeBtnActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
    color: '#fff',
  },
  fields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 38,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    backgroundColor: '#fff',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 13,
    padding: '8px 10px',
  },
  select: {
    minHeight: 38,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    backgroundColor: '#fff',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 13,
    padding: '8px 10px',
  },
  textarea: {
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    backgroundColor: '#fff',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 1.6,
    padding: 10,
    resize: 'vertical',
  },
  dropZone: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    border: `1px dashed ${colors.border}`,
    borderRadius: radii.sm,
    backgroundColor: colors.bgPanel,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  dropZoneActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(196, 95, 63, 0.06)',
  },
  attachBtn: {
    border: `1px solid ${colors.borderSelected}`,
    borderRadius: radii.sm,
    backgroundColor: '#fff',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 14px',
    cursor: 'pointer',
  },
  dropText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  carryForward: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  docList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  docNote: {
    display: 'grid',
    gridTemplateColumns: 'minmax(150px, 1fr) minmax(260px, 2fr) auto',
    gap: spacing.sm,
    alignItems: 'start',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    backgroundColor: '#fff',
    padding: spacing.sm,
  },
  docName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 700,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingTop: 8,
  },
  noteTextarea: {
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.text,
    padding: 8,
    resize: 'vertical',
  },
  removeBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
    padding: '8px 4px',
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  missing: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  submitBtn: {
    minHeight: 42,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    padding: '0 20px',
    cursor: 'pointer',
  },
  submitBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
};
