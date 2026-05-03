/**
 * ReviseModal — Partner-style review loop.
 *
 * The user (partner) writes notes on the work product, the team produces
 * a revised version (vN+1). Stack semantics: every revision is preserved,
 * v1 is always the original delivery.
 *
 * UX shape:
 *   - Single textarea (the partner's notes)
 *   - Optional quick-suggestion chips (one-click common edits)
 *   - Submit → loading state with elapsed timer (~30-60s typical)
 *   - On success: parent receives the new revision, modal closes
 *   - On error: inline message, retry-able
 */

import { useEffect, useRef, useState } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Revision {
  version: number;
  document: string;
  instructions: string;
  createdAt: string;
  costUsd: number;
}

interface Props {
  sessionId: string;
  /** The current latest version number — the next revision will be N+1. */
  currentVersion: number;
  onClose: () => void;
  onRevised: (rev: Revision) => void;
}

const QUICK_CHIPS: Array<{ label: string; insert: string }> = [
  { label: 'Tighten language', insert: 'Tighten the language throughout — shorter sentences, fewer adverbs, drop hedging like "may" or "could." Keep the substance identical.' },
  { label: 'More plain English', insert: 'Rewrite in plainer English so a non-lawyer can follow it. Keep all defined terms and citations exactly as they are.' },
  { label: 'Add executive summary', insert: 'Add a 3-4 sentence Executive Summary at the very top, before the existing first heading. Capture the headline finding, the recommendation, and the highest-priority risk.' },
  { label: 'Cite specific clauses', insert: 'For every claim or finding, cite the specific clause number from the source document in parentheses, e.g. "(Clause 4.2)".' },
  { label: 'More skeptical', insert: 'Take a more skeptical posture on the counterparty\'s positions. Where the document accepts a clause as "standard," push harder — flag what could go wrong and what to negotiate.' },
];

const MAX_CHARS = 8_000;

export function ReviseModal({ sessionId, currentVersion, onClose, onRevised }: Props) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startedAtRef = useRef<number>(0);
  // Audit fix M14: track mount + active fetch so we can cancel cleanly.
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // Focus the textarea on mount.
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Mount/unmount lifecycle — abort any in-flight revise on close.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try { abortRef.current?.abort(); } catch { /* ignore */ }
    };
  }, []);

  // Tick elapsed timer while loading.
  useEffect(() => {
    if (!loading) return;
    startedAtRef.current = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(timer);
  }, [loading]);

  // ESC closes (only when not loading).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  const insertChip = (text: string) => {
    setNotes(prev => prev.trim() ? prev.trim() + '\n\n' + text : text);
    textareaRef.current?.focus();
  };

  const submit = async () => {
    const trimmed = notes.trim();
    if (!trimmed) {
      setError('Add at least a sentence describing what to change.');
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      setError(`Notes are ${trimmed.length.toLocaleString()} chars — keep it under ${MAX_CHARS.toLocaleString()}.`);
      return;
    }
    setLoading(true);
    setError(null);
    setElapsedMs(0);
    // Fresh AbortController per submission so retries cancel the prior call.
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/sessions/${sessionId}/revise`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: trimmed }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.details || `Server returned ${res.status}.`);
      }
      const rev = await res.json() as Revision;
      // Guard against late callbacks after the user closed the modal.
      if (!mountedRef.current) return;
      onRevised(rev);
      onClose();
    } catch (err) {
      // Aborted = the user closed the modal; don't show an error.
      if ((err as Error)?.name === 'AbortError' || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const charCount = notes.length;
  const overLimit = charCount > MAX_CHARS;
  const nextVersion = currentVersion + 1;

  return (
    <div
      style={styles.backdrop}
      onClick={() => !loading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="revise-modal-title"
    >
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.overline}>Partner Review · v{currentVersion} → v{nextVersion}</div>
          <h2 id="revise-modal-title" style={styles.title}>Send back for revision</h2>
          <p style={styles.subtitle}>
            Mark up the draft. Your notes go to a senior associate who will produce v{nextVersion},
            preserving everything you don't call out.
          </p>
        </div>

        {/* Body — textarea + chips */}
        <div style={styles.body}>
          {!loading && (
            <div style={styles.chipsRow} role="group" aria-label="Quick suggestions">
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => insertChip(chip.insert)}
                  style={styles.chip}
                  disabled={loading}
                >
                  + {chip.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={notes}
            onChange={e => { setNotes(e.target.value); if (error) setError(null); }}
            placeholder={`e.g. "The Section 3 risk discussion buries the headline — lead with the cap exposure. Drop the long footnote on indemnification — it duplicates Section 5."`}
            disabled={loading}
            rows={10}
            style={{
              ...styles.textarea,
              borderColor: error ? colors.danger : overLimit ? colors.danger : colors.border,
              opacity: loading ? 0.6 : 1,
            }}
            aria-label="Partner's notes for revision"
          />

          <div style={styles.meta}>
            <span style={{ ...styles.charCount, color: overLimit ? colors.danger : colors.textDim }}>
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
            <span style={styles.metaHint}>~$0.50 · 30-60s</span>
          </div>

          {error && (
            <div style={styles.errorBox} role="alert">
              {error}
            </div>
          )}

          {loading && (
            <div style={styles.loadingBox} role="status" aria-live="polite">
              <div style={styles.spinner} />
              <div style={styles.loadingContent}>
                <div style={styles.loadingTitle}>Producing v{nextVersion}…</div>
                <div style={styles.loadingSub}>
                  Reading your notes, preserving the rest verbatim · {elapsedSec}s elapsed
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — actions */}
        <div style={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={styles.cancelBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || overLimit || !notes.trim()}
            style={{
              ...styles.submitBtn,
              opacity: (loading || overLimit || !notes.trim()) ? 0.5 : 1,
              cursor: (loading || overLimit || !notes.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Sending…' : `Send to associate →`}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes revise-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(20, 18, 14, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: spacing.lg,
    backdropFilter: 'blur(2px)',
  },
  modal: {
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 30px 80px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.12)',
  },
  header: {
    padding: `${spacing.xl}px ${spacing.xxl}px ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
  overline: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: 400,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.3,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: `${spacing.sm}px 0 0 0`,
  },
  body: {
    padding: `${spacing.lg}px ${spacing.xxl}px ${spacing.lg}px`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  chip: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.pill,
    padding: '5px 11px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  textarea: {
    width: '100%',
    fontSize: 14,
    fontFamily: fonts.sans,
    lineHeight: 1.6,
    color: colors.text,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: spacing.md,
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s ease',
  },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    fontFamily: fonts.mono,
  },
  charCount: {
    color: colors.textDim,
  },
  metaHint: {
    color: colors.textDim,
  },
  errorBox: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    border: `1px solid rgba(196, 93, 62, 0.25)`,
    borderRadius: radii.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    lineHeight: 1.5,
  },
  loadingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.accentLight,
    border: `1px solid ${colors.accentMid}`,
    borderRadius: radii.sm,
  },
  spinner: {
    width: 18,
    height: 18,
    border: `2px solid ${colors.accentMid}`,
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'revise-spin 0.9s linear infinite',
    flexShrink: 0,
  },
  loadingContent: { flex: 1, minWidth: 0 },
  loadingTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  loadingSub: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    marginTop: 2,
  },
  footer: {
    padding: `${spacing.md}px ${spacing.xxl}px ${spacing.xl}px`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    borderTop: `1px solid ${colors.border}`,
  },
  cancelBtn: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '8px 18px',
    cursor: 'pointer',
    minHeight: 36,
  },
  submitBtn: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: colors.accent,
    border: 'none',
    borderRadius: radii.sm,
    padding: '8px 22px',
    minHeight: 36,
    transition: 'opacity 0.15s ease',
  },
};
