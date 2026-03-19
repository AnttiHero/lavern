/**
 * QueueBanner — Shown when server returns 503 (at capacity).
 *
 * Displays a warm, non-alarming message with estimated wait time.
 * Auto-retries the capacity endpoint and dismisses when capacity is available.
 */

import { useState, useEffect, useCallback } from 'react';
import { colors, fonts, spacing, radii } from '../staffing/styles/tokens.js';

interface Props {
  retryAfterMs: number;
  onCapacityAvailable: () => void;
  onDismiss: () => void;
}

export function QueueBanner({ retryAfterMs, onCapacityAvailable, onDismiss }: Props) {
  const [waitMs, setWaitMs] = useState(retryAfterMs);
  const [checking, setChecking] = useState(false);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setWaitMs(prev => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll capacity every 30 seconds
  const checkCapacity = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/health/capacity');
      if (res.ok) {
        const data = await res.json();
        if (data.available) {
          onCapacityAvailable();
          return;
        }
        setWaitMs(data.estimatedWaitMs);
      }
    } catch { /* ignore */ }
    finally { setChecking(false); }
  }, [onCapacityAvailable]);

  useEffect(() => {
    const interval = setInterval(checkCapacity, 30_000);
    return () => clearInterval(interval);
  }, [checkCapacity]);

  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));

  return (
    <div style={styles.banner} role="alert" aria-live="polite">
      <div style={styles.content}>
        <h2 style={styles.title}>Lavern is at capacity.</h2>
        <p style={styles.message}>
          All session slots are in use. Estimated wait: ~{minutes} minute{minutes !== 1 ? 's' : ''}.
          {checking && ' Checking...'}
        </p>
        <div style={styles.actions}>
          <button onClick={checkCapacity} style={styles.retryBtn} disabled={checking}>
            Check Now
          </button>
          <button onClick={onDismiss} style={styles.dismissBtn}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.lg}px ${spacing.md}px`,
    background: 'rgba(184, 134, 11, 0.95)',
    backdropFilter: 'blur(12px)',
  },
  content: {
    maxWidth: 500,
    textAlign: 'center' as const,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: 400,
    color: '#fff',
    marginBottom: spacing.sm,
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.5,
    margin: `0 0 ${spacing.md}px`,
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  retryBtn: {
    padding: '8px 20px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: 'rgba(184, 134, 11, 1)',
    backgroundColor: '#fff',
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  dismissBtn: {
    padding: '8px 20px',
    fontSize: 12,
    fontFamily: fonts.sans,
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
};
