/**
 * TopUpDialog — Inline modal for purchasing billable hours.
 *
 * Shown when a user hits a 402 (out of hours) or has low balance.
 * Stays in context instead of redirecting to the pricing page.
 * Calls POST /api/billing/checkout-pack → redirects to Stripe Checkout.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface Props {
  /** Current billable hours balance (0 if out of hours) */
  balance?: number;
  /** Called when user dismisses the dialog */
  onDismiss: () => void;
  /** Optional: message shown in the header */
  message?: string;
}

interface Pack {
  id: 'quick' | 'standard' | 'bulk';
  hours: number;
  priceLabel: string;
  perHour: string;
  featured?: boolean;
}

const PACKS: Pack[] = [
  { id: 'quick', hours: 25, priceLabel: '€5', perHour: '€0.20/h' },
  { id: 'standard', hours: 100, priceLabel: '€19', perHour: '€0.19/h', featured: true },
  { id: 'bulk', hours: 500, priceLabel: '€89', perHour: '€0.18/h' },
];

export function TopUpDialog({ balance = 0, onDismiss, message }: Props) {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus trap: close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  // Close on overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onDismiss();
  }, [onDismiss]);

  const handleBuyPack = async (packId: string) => {
    setBuying(packId);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pack: packId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Purchase failed' }));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { checkoutUrl: string };
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
      setBuying(null);
    }
  };

  return (
    <div ref={overlayRef} style={S.overlay} onClick={handleOverlayClick}>
      <div style={S.dialog} role="dialog" aria-modal="true" aria-label="Buy billable hours">
        {/* Header */}
        <div style={S.header}>
          <div style={S.headerIcon}>⏱</div>
          <div style={S.headerTitle}>
            {message || (balance <= 0 ? 'No billable hours remaining' : 'Running low on hours')}
          </div>
          <div style={S.headerSubtitle}>
            {balance > 0
              ? `You have ${balance.toFixed(1)} hours remaining.`
              : 'Purchase hours to continue using Lavern.'}
          </div>
        </div>

        {/* Divider */}
        <div style={S.divider} />

        {/* Packs */}
        <div style={S.packs}>
          {PACKS.map(pack => (
            <button
              key={pack.id}
              onClick={() => handleBuyPack(pack.id)}
              disabled={!!buying}
              style={{
                ...S.packBtn,
                ...(pack.featured ? S.packFeatured : {}),
                ...(buying === pack.id ? S.packBuying : {}),
              }}
              onMouseEnter={e => {
                if (!buying) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={S.packHours}>{pack.hours}h</div>
              <div style={S.packPrice}>{buying === pack.id ? 'Redirecting...' : pack.priceLabel}</div>
              <div style={S.packRate}>{pack.perHour}</div>
              {pack.featured && <div style={S.packBadge}>Popular</div>}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && <div style={S.error}>{error}</div>}

        {/* Footer */}
        <div style={S.footer}>
          <button onClick={onDismiss} style={S.dismissBtn}>
            Not now
          </button>
          <button
            onClick={() => { window.location.hash = '#/pricing'; onDismiss(); }}
            style={S.viewPlansBtn}
          >
            View all plans
          </button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    border: `1px solid ${colors.border}`,
    padding: `${spacing.xl}px ${spacing.xxl}px ${spacing.xxl}px`,
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 24px 80px rgba(0,0,0,0.15)',
    animation: 'lobbyFadeUp 0.3s ease both',
  },
  header: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  headerIcon: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: 600,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    margin: `${spacing.lg}px 0`,
  },
  packs: {
    display: 'flex',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  packBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.lg}px ${spacing.md}px`,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative' as const,
  },
  packFeatured: {
    borderColor: colors.accent,
    borderWidth: 2,
    backgroundColor: 'rgba(196, 93, 62, 0.03)',
  },
  packBuying: {
    opacity: 0.7,
    cursor: 'wait',
  },
  packHours: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: -0.5,
  },
  packPrice: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: 700,
    color: colors.text,
  },
  packRate: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.textMuted,
  },
  packBadge: {
    position: 'absolute' as const,
    top: -8,
    right: -8,
    fontFamily: fonts.sans,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: '#fff',
    backgroundColor: colors.accent,
    padding: '2px 8px',
    borderRadius: radii.sm,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dismissBtn: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 12px',
  },
  viewPlansBtn: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.accent,
    background: 'none',
    border: `1px solid ${colors.accent}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    padding: '6px 16px',
    transition: 'background-color 0.15s',
  },
};
