/**
 * StuckStateRescue — Prominent rescue card when the session appears hung.
 *
 * Shown when the Working view has received no new events for a
 * meaningful stretch. Gives the user explicit actions instead of staring at
 * a spinner of death: keep waiting, or halt the session and try again.
 *
 * Trigger (handled by parent): no events within IDLE_THRESHOLD_MS AND
 * `currentStep` has not changed for the same window. This covers the three
 * real failure modes we see in production:
 *   1. Assembly stalls (long LLM call, no intermediate events)
 *   2. Agent hangs (tool call never returns)
 *   3. Upstream Claude API slowdowns
 *
 * Design language: warm amber card, not alarming red. The user's work is
 * safe — we're just being transparent that this is taking longer than usual.
 */

import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface Props {
  /** Minutes since the last event was received — used in the message. */
  idleMinutes: number;
  /** User clicked "Keep waiting" — dismisses the card for this silence window. */
  onDismiss: () => void;
  /** User clicked "Stop and try again" — halt the session via DELETE. */
  onHalt: () => void;
  /** Whether the halt request is in flight. */
  halting: boolean;
}

export function StuckStateRescue({ idleMinutes, onDismiss, onHalt, halting }: Props) {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        margin: '16px 0',
        padding: '20px 24px',
        backgroundColor: '#FFF6E8',
        border: '1px solid #E8A14B',
        borderRadius: radii.lg,
        boxShadow: '0 4px 16px rgba(232, 161, 75, 0.12)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 18 }}>{'\u23F3'}</span>
        <div style={{
          fontSize: 15,
          fontFamily: fonts.serif,
          fontWeight: 600,
          color: '#8A5B1F',
        }}>
          This is taking longer than usual
        </div>
      </div>

      <div style={{
        fontSize: 13,
        fontFamily: fonts.sans,
        color: colors.text,
        lineHeight: 1.5,
        marginBottom: 14,
      }}>
        We haven{'\u2019'}t heard from the team in about {idleMinutes} minute{idleMinutes === 1 ? '' : 's'}.
        Your work is safe {'\u2014'} agents sometimes take longer on complex documents or
        during peak load. You can keep waiting, or stop and try again.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onDismiss}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontFamily: fonts.sans,
            fontWeight: 500,
            color: colors.text,
            backgroundColor: 'transparent',
            border: `1px solid ${colors.border}`,
            borderRadius: radii.md,
            cursor: 'pointer',
            minHeight: 36,
          }}
        >
          Keep waiting
        </button>
        <button
          onClick={onHalt}
          disabled={halting}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontFamily: fonts.sans,
            fontWeight: 600,
            color: '#fff',
            backgroundColor: halting ? '#C4884A' : '#B86E1F',
            border: 'none',
            borderRadius: radii.md,
            cursor: halting ? 'not-allowed' : 'pointer',
            minHeight: 36,
            opacity: halting ? 0.7 : 1,
          }}
        >
          {halting ? 'Stopping\u2026' : 'Stop and try again'}
        </button>
      </div>
    </div>
  );
}
