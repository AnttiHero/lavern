/**
 * Gate Dialog — Modal for human gate approval.
 *
 * Warm editorial design — Inter font, paper-white card, muted accents.
 * Appears when a gate_requested event arrives.
 * Sends approve/reject/modify back via API.
 */

import { useState, useEffect, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface GateDialogProps {
  gateType: string;
  summary: string;
  details: string;
  sessionId: string;
  isDemo?: boolean;
  onDecision: (decision: 'approve' | 'reject' | 'modify', notes?: string) => void;
  onDismiss: () => void;
}

const GATE_LABELS: Record<string, string> = {
  ethics_critical: 'Ethics Critical',
  meaning_critical: 'Meaning Critical',
  final_delivery: 'Final Delivery',
};

export function GateDialog({
  gateType,
  summary,
  details,
  sessionId,
  isDemo = false,
  onDecision,
  onDismiss,
}: GateDialogProps) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Demo mode: count down visually (auto-approve is handled by WorkingView)
  useEffect(() => {
    if (!isDemo) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [isDemo, countdown]);

  // Stable ref to avoid re-registering listener when onDismiss identity changes
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Focus trap: focus first focusable element on mount, trap Tab at boundaries, Escape to dismiss
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Focus the first focusable element on mount
    const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE);
    if (firstFocusable) firstFocusable.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onDismissRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab at the first element -> wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab at the last element -> wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [submitting]);

  const handleDecision = async (decision: 'approve' | 'reject' | 'modify') => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, notes: notes || undefined }),
      });

      if (response.ok) {
        onDecision(decision, notes);
      } else {
        await response.text().catch(() => ''); // drain response body
        setErrorMsg('Submission failed. Please try again.');
      }
    } catch (err) {
      void err; // Sentry captures via ErrorBoundary; avoid exposing internals in console
      setErrorMsg('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="gate-dialog-title">
      <div ref={dialogRef} style={styles.dialog}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.gateIcon}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v6M8 11.5v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div style={styles.headerText}>
            <span style={styles.headerLabel}>HUMAN GATE</span>
            <span id="gate-dialog-title" style={styles.gateLabel}>
              {GATE_LABELS[gateType] || gateType}
            </span>
          </div>
          <button
            onClick={onDismiss}
            disabled={submitting}
            aria-label="Close gate dialog"
            style={{
              ...styles.closeButton,
              backgroundColor: hoveredBtn === 'close' ? colors.bgPanel : 'transparent',
              opacity: submitting ? 0.4 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={() => setHoveredBtn('close')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            {'\u00D7'}
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          <div style={styles.summary}>{summary}</div>
          <div style={styles.details}>{details}</div>
        </div>

        {isDemo ? (
          /* Demo mode: passive countdown — no user action needed */
          <div style={styles.demoFooter}>
            <div style={styles.demoCountdownTrack}>
              <div
                style={{
                  ...styles.demoCountdownBar,
                  width: `${(countdown / 3) * 100}%`,
                  transition: countdown < 3 ? 'width 1s linear' : 'none',
                }}
              />
            </div>
            <span style={styles.demoCountdownLabel}>
              {countdown > 0 ? `Reviewing automatically… ${countdown}` : 'Approved'}
            </span>
          </div>
        ) : (
          <>
            {/* Notes */}
            <div style={styles.notesSection}>
              <label htmlFor="gate-notes-input" className="sr-only">Notes</label>
              <input
                id="gate-notes-input"
                type="text"
                placeholder="Notes (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={styles.notesInput}
                disabled={submitting}
              />
            </div>

            {/* Error */}
            {errorMsg && (
              <div role="alert" style={{ padding: '0 24px 12px', color: colors.danger, fontSize: 12, fontFamily: fonts.sans }}>
                {errorMsg}
              </div>
            )}

            {/* Actions */}
            <div style={styles.actions}>
              <button
                onClick={() => handleDecision('reject')}
                style={{
                  ...styles.actionBtn,
                  ...styles.rejectBtn,
                  backgroundColor: hoveredBtn === 'reject' ? colors.danger : 'transparent',
                  color: hoveredBtn === 'reject' ? '#fff' : colors.danger,
                }}
                onMouseEnter={() => setHoveredBtn('reject')}
                onMouseLeave={() => setHoveredBtn(null)}
                disabled={submitting}
              >
                Reject
              </button>
              <button
                onClick={() => handleDecision('modify')}
                style={{
                  ...styles.actionBtn,
                  ...styles.modifyBtn,
                  backgroundColor: hoveredBtn === 'modify' ? colors.warning : 'transparent',
                  color: hoveredBtn === 'modify' ? '#fff' : colors.warning,
                }}
                onMouseEnter={() => setHoveredBtn('modify')}
                onMouseLeave={() => setHoveredBtn(null)}
                disabled={submitting}
              >
                Modify
              </button>
              <button
                onClick={() => handleDecision('approve')}
                style={{
                  ...styles.actionBtn,
                  ...styles.approveBtn,
                  backgroundColor: hoveredBtn === 'approve' ? colors.success : colors.text,
                  color: '#fff',
                }}
                onMouseEnter={() => setHoveredBtn('approve')}
                onMouseLeave={() => setHoveredBtn(null)}
                disabled={submitting}
              >
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(250, 249, 246, 0.9)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50000,
  },
  dialog: {
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    width: 480,
    maxWidth: '90vw',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: `${spacing.lg}px ${spacing.xl}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
  gateIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  headerLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  gateLabel: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.serif,
    fontWeight: 400,
    letterSpacing: -0.2,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    fontSize: 20,
    cursor: 'pointer',
    fontFamily: fonts.sans,
    padding: '4px 8px',
    borderRadius: radii.sm,
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
    lineHeight: 1,
  },
  body: {
    padding: `${spacing.xl}px`,
  },
  summary: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.sans,
    marginBottom: spacing.md,
    lineHeight: 1.6,
    fontWeight: 500,
  },
  details: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.sans,
    lineHeight: 1.6,
    maxHeight: 200,
    overflowY: 'auto',
    backgroundColor: colors.bgPanel,
    padding: spacing.md,
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
  },
  notesSection: {
    padding: `0 ${spacing.xl}px ${spacing.lg}px`,
  },
  notesInput: {
    width: '100%',
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 13,
    padding: '10px 14px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease',
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
    padding: `${spacing.lg}px ${spacing.xl}px`,
    borderTop: `1px solid ${colors.border}`,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    padding: '8px 20px',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  approveBtn: {
    border: `1.5px solid ${colors.text}`,
  },
  modifyBtn: {
    border: `1.5px solid ${colors.warning}`,
    backgroundColor: 'transparent',
    color: colors.warning,
  },
  rejectBtn: {
    border: `1.5px solid ${colors.danger}`,
    backgroundColor: 'transparent',
    color: colors.danger,
  },
  demoFooter: {
    padding: `${spacing.lg}px ${spacing.xl}px`,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  demoCountdownTrack: {
    height: 3,
    borderRadius: 100,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
  },
  demoCountdownBar: {
    height: '100%',
    borderRadius: 100,
    backgroundColor: colors.accent,
  },
  demoCountdownLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
  },
};
