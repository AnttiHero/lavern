/**
 * DeliveriesTab — Delivery bundle card grid.
 * "What has the night shift produced?"
 */

import { fonts, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';
import type { ClawDelivery } from '../hooks/useClawData.js';
import { DeliveryCard } from './DeliveryCard.js';

interface Props {
  deliveries: ClawDelivery[];
}

export function DeliveriesTab({ deliveries }: Props) {
  if (deliveries.length === 0) {
    return (
      <div style={styles.empty}>
        The night shift hasn't completed any deliveries yet.
      </div>
    );
  }

  return (
    <div style={styles.grid}>
      {deliveries.map(d => (
        <DeliveryCard key={d.sessionId} delivery={d} />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.md,
  },
  empty: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: CLAW.textMuted,
    padding: `${spacing.xxl}px`,
    textAlign: 'center' as const,
  },
};
