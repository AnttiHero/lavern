/**
 * VerdictBanner — Displays the final verification verdict.
 * PASS (green), CONDITIONAL_PASS (amber), FAIL (red).
 */

import { colors } from '../staffing/styles/tokens.js';

const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; emoji: string; label: string }> = {
  PASS: { bg: '#4ade8015', border: '#4ade80', text: '#4ade80', emoji: '✅', label: 'PASS' },
  CONDITIONAL_PASS: { bg: '#fbbf2415', border: '#fbbf24', text: '#fbbf24', emoji: '⚠️', label: 'CONDITIONAL PASS' },
  FAIL: { bg: '#ef444415', border: '#ef4444', text: '#ef4444', emoji: '❌', label: 'FAIL' },
};

interface VerdictBannerProps {
  verdict: string;
  overallScore: number;
  totalFindings: number;
}

export function VerdictBanner({ verdict, overallScore, totalFindings }: VerdictBannerProps) {
  const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.FAIL;

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-xl border"
      style={{ background: style.bg, borderColor: style.border }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{style.emoji}</span>
        <div>
          <div className="text-lg font-semibold" style={{ color: style.text }}>
            {style.label}
          </div>
          <div className="text-xs" style={{ color: colors.textMuted }}>
            {totalFindings} finding{totalFindings !== 1 ? 's' : ''} across 10 passes
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-mono tabular-nums" style={{ color: style.text }}>
          {(overallScore * 100).toFixed(1)}%
        </div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>
          Overall Score
        </div>
      </div>
    </div>
  );
}
