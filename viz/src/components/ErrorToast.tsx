/**
 * ErrorToast — Dismissible error notification banner.
 *
 * Replaces browser alert() calls with a styled toast that matches
 * the Lavern design language. Auto-dismisses after 8 seconds.
 * Slides in from the top with a subtle animation.
 */

import { useEffect, useCallback } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';

// ── Component ──────────────────────────────────────────────────────────

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  return (
    <div style={styles.overlay}>
      <div style={styles.toast}>
        {/* Icon */}
        <div style={styles.icon}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke={colors.danger} strokeWidth="1.5" />
            <path d="M8 4.5V9" stroke={colors.danger} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.75" fill={colors.danger} />
          </svg>
        </div>

        {/* Message */}
        <div style={styles.content}>
          <span style={styles.label}>Error</span>
          <span style={styles.message}>{message}</span>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          style={styles.dismissBtn}
          aria-label="Dismiss error"
          onMouseEnter={e => { e.currentTarget.style.color = colors.text; }}
          onMouseLeave={e => { e.currentTarget.style.color = colors.textDim; }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 99999,
    animation: 'toastSlideIn 0.25s ease-out both',
    pointerEvents: 'auto',
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '14px 18px',
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.danger}`,
    borderRadius: radii.md,
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.05)',
    maxWidth: 480,
    minWidth: 320,
  },
  icon: {
    flexShrink: 0,
    marginTop: 1,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.danger,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  message: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    lineHeight: 1.5,
  },
  dismissBtn: {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: colors.textDim,
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 2px',
    marginTop: -2,
    transition: 'color 0.2s ease',
  },
};
