/**
 * PersonalityBars — 5 horizontal bars showing personality axes.
 *
 * Each axis is a spectrum: left label ←→ right label, value 1–10.
 * Warm editorial colours — subtle gradient from teal to muted purple.
 */

import { colors, fonts } from '../styles/tokens.js';

interface Props {
  traits: Record<string, number>;
}

const axisLabels: Array<{ key: string; left: string; right: string }> = [
  { key: 'conservative-vs-creative', left: 'Conservative', right: 'Creative' },
  { key: 'thorough-vs-fast', left: 'Thorough', right: 'Fast' },
  { key: 'risk-averse-vs-tolerant', left: 'Risk-averse', right: 'Tolerant' },
  { key: 'formal-vs-approachable', left: 'Formal', right: 'Approach.' },
  { key: 'adversarial-vs-collaborative', left: 'Adversarial', right: 'Collab.' },
];

export function PersonalityBars({ traits }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {axisLabels.map(axis => {
        const value = traits[axis.key] ?? 5;
        const pct = (value / 10) * 100;

        return (
          <div key={axis.key}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              fontFamily: fonts.sans,
              color: colors.textMuted,
              marginBottom: 2,
            }}>
              <span>{axis.left}</span>
              <span>{axis.right}</span>
            </div>
            <div style={{
              height: 4,
              backgroundColor: colors.bgPanel,
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: 2,
                background: `linear-gradient(90deg, ${colors.lawyer}, ${colors.specialist})`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
