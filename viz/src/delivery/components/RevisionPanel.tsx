/**
 * RevisionPanel — Version selector + "Send back for revision" CTA.
 *
 * Stack semantics:
 *   - v1 is always the original delivery.
 *   - v2..vN are partner-driven revisions. Each preserves what was not called out.
 *   - All versions are kept; user can switch between them.
 *
 * Lives above the document preview in TheWorkTab. Manages its own state for
 * the revision list + selected version. When the user revises, it calls back
 * to the parent so the preview can swap to the new version's content.
 */

import { useEffect, useState, useCallback } from 'react';
import { ReviseModal } from './ReviseModal.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface RevisionMeta {
  version: number;
  instructions: string;
  createdAt: string;
  costUsd: number;
  chars: number;
}

interface FullRevision {
  version: number;
  document: string;
  instructions: string;
  createdAt: string;
  costUsd: number;
}

interface Props {
  sessionId: string;
  /** When the active version changes (or the user revises), the parent
   *  receives the current document text to render in the preview. Pass
   *  `null` to fall back to the original `data.finalOutput`. */
  onActiveDocumentChange: (doc: string | null, version: number | null) => void;
}

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

export function RevisionPanel({ sessionId, onActiveDocumentChange }: Props) {
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render anything for demo sessions.
  const isDemo = sessionId.startsWith('demo-session');

  // Fetch list on mount.
  const fetchList = useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/revisions`, { credentials: 'include' });
      if (!res.ok) return; // Silent — feature is opt-in
      const body = await res.json();
      const list = (body.revisions ?? []) as RevisionMeta[];
      setRevisions(list);
    } catch {
      // Silent — never break the delivery view if revisions list fails.
    }
  }, [sessionId, isDemo]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Load a specific version's full document into the preview.
  const loadVersion = useCallback(async (v: number) => {
    setLoadingActive(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/revisions/${v}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Could not load v${v}.`);
      const rev = await res.json() as FullRevision;
      setActiveVersion(v);
      onActiveDocumentChange(rev.document, v);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingActive(false);
    }
  }, [sessionId, onActiveDocumentChange]);

  const showOriginal = useCallback(() => {
    setActiveVersion(null);
    onActiveDocumentChange(null, null);
  }, [onActiveDocumentChange]);

  const onRevised = useCallback((rev: FullRevision) => {
    // Optimistic insert + activate the new version for instant feedback.
    setRevisions(prev => {
      const next = [...prev];
      if (!next.some(r => r.version === 1)) {
        next.push({ version: 1, instructions: '', createdAt: rev.createdAt, costUsd: 0, chars: 0 });
      }
      next.push({
        version: rev.version,
        instructions: rev.instructions,
        createdAt: rev.createdAt,
        costUsd: rev.costUsd,
        chars: rev.document.length,
      });
      return next.sort((a, b) => a.version - b.version);
    });
    setActiveVersion(rev.version);
    onActiveDocumentChange(rev.document, rev.version);
    // Audit fix M15: reconcile with the server. Backend now rejects /revise
    // on hydrated archive sessions (audit fix C2), so a successful response
    // here means the revision IS persisted server-side — refetch is safe and
    // ensures pills reflect canonical state on reload.
    fetchList();
  }, [onActiveDocumentChange, fetchList]);

  if (isDemo) return null;

  const latestVersion = revisions.length > 0
    ? Math.max(...revisions.map(r => r.version))
    : 1;
  const hasRevisions = revisions.some(r => r.version > 1);

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        {/* Left: revision pills */}
        <div style={styles.pills} role="tablist" aria-label="Document revisions">
          {hasRevisions && (
            <>
              <button
                role="tab"
                aria-selected={activeVersion === null}
                onClick={showOriginal}
                style={{
                  ...styles.pill,
                  ...(activeVersion === null ? styles.pillActive : {}),
                }}
                disabled={loadingActive}
              >
                Original (v1)
              </button>
              {revisions.filter(r => r.version > 1).map(r => (
                <button
                  key={r.version}
                  role="tab"
                  aria-selected={activeVersion === r.version}
                  onClick={() => loadVersion(r.version)}
                  style={{
                    ...styles.pill,
                    ...(activeVersion === r.version ? styles.pillActive : {}),
                  }}
                  title={r.instructions ? `${r.instructions.slice(0, 200)}${r.instructions.length > 200 ? '…' : ''}\n\n${fmtTime(r.createdAt)}` : fmtTime(r.createdAt)}
                  disabled={loadingActive}
                >
                  v{r.version}
                </button>
              ))}
            </>
          )}
          {loadingActive && <span style={styles.loadingTag}>Loading…</span>}
        </div>

        {/* Right: send back CTA */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={styles.sendBackBtn}
          aria-label="Send the work product back for revision"
        >
          Send back for revision <span style={styles.sendBackArrow}>→</span>
        </button>
      </div>

      {error && <div style={styles.errorRow} role="alert">{error}</div>}

      {/* Active version note */}
      {activeVersion && activeVersion > 1 && (
        <div style={styles.activeNote}>
          <span style={styles.activeNoteLabel}>Viewing v{activeVersion}</span>
          <span style={styles.activeNoteSep}>·</span>
          <span style={styles.activeNoteText}>
            {revisions.find(r => r.version === activeVersion)?.instructions.slice(0, 140)}
            {(revisions.find(r => r.version === activeVersion)?.instructions.length ?? 0) > 140 && '…'}
          </span>
        </div>
      )}

      {showModal && (
        <ReviseModal
          sessionId={sessionId}
          currentVersion={latestVersion}
          onClose={() => setShowModal(false)}
          onRevised={onRevised}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap' as const,
  },
  pills: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    alignItems: 'center',
  },
  pill: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.pill,
    padding: '5px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  pillActive: {
    color: '#fff',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  loadingTag: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textDim,
    marginLeft: spacing.sm,
  },
  sendBackBtn: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSelected}`,
    borderRadius: radii.sm,
    padding: '7px 16px',
    cursor: 'pointer',
    minHeight: 34,
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  sendBackArrow: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 1,
  },
  errorRow: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
  },
  activeNote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    display: 'flex',
    gap: 6,
    alignItems: 'baseline',
  },
  activeNoteLabel: {
    fontWeight: 600,
    color: colors.accent,
  },
  activeNoteSep: { opacity: 0.5 },
  activeNoteText: { flex: 1, minWidth: 0 },
};
