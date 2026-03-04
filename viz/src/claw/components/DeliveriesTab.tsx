/**
 * DeliveriesTab — Delivery bundle card grid.
 * "What has the night shift produced?"
 */

import { colors, fonts, spacing } from '../../staffing/styles/tokens.js';
import type { ClawDelivery } from '../hooks/useClawData.js';
import { DeliveryCard } from './DeliveryCard.js';

interface Props {
  deliveries: ClawDelivery[];
  demoMode: boolean;
}

export function DeliveriesTab({ deliveries, demoMode }: Props) {
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
    color: colors.textDim,
    padding: `${spacing.xxl}px`,
    textAlign: 'center' as const,
  },
};
