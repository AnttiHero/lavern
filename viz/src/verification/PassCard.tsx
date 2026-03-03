/**
 * PassCard — Displays status for a single verification pass.
 * Shows: pass name, status indicator, score bar, finding counts.
 */

import { colors } from '../staffing/styles/tokens.js';
import { cn } from '../utils/cn.js';

const PASS_LABELS: Record<string, string> = {
  context: 'Context',
  ux: 'UX & Findability',
  clarity: 'Clarity',
  structure: 'Structure',
  accuracy: 'Accuracy',
  completeness: 'Completeness',
  risk: 'Risk & Ethics',
  formatting: 'Formatting',
  legal_design: 'Legal Design',
  delivery: 'Delivery',
};

interface PassCardProps {
  pass: string;
  index: number;
  status: 'pending' | 'running' | 'complete';
  score?: number;
  criticalCount?: number;
  majorCount?: number;
  minorCount?: number;
}

export function PassCard({ pass, index, status, score, criticalCount = 0, majorCount = 0, minorCount = 0 }: PassCardProps) {
  const label = PASS_LABELS[pass] ?? pass;
  const totalFindings = criticalCount + majorCount + minorCount;

  const scoreColor =
    score === undefined ? colors.textMuted :
    score >= 0.8 ? '#4ade80' :
    score >= 0.6 ? '#fbbf24' : '#ef4444';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300',
        status === 'running' && 'ring-1 ring-accent/40',
        status === 'complete' && 'opacity-100',
        status === 'pending' && 'opacity-40',
      )}
      style={{ background: status === 'running' ? `${colors.accent}10` : 'transparent' }}
    >
      {/* Index + Status indicator */}
      <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono shrink-0"
        style={{
          background: status === 'complete' ? scoreColor : status === 'running' ? colors.accent : colors.textMuted + '30',
          color: status === 'pending' ? colors.textMuted : '#fff',
        }}
      >
        {status === 'complete' ? '✓' : status === 'running' ? '●' : index + 1}
      </div>

      {/* Pass name */}
      <span className="text-sm flex-1 truncate" style={{ color: status === 'pending' ? colors.textMuted : colors.text }}>
        {label}
      </span>

      {/* Score */}
      {status === 'complete' && score !== undefined && (
        <span className="text-xs font-mono tabular-nums" style={{ color: scoreColor }}>
          {(score * 100).toFixed(0)}%
        </span>
      )}

      {/* Finding counts */}
      {status === 'complete' && totalFindings > 0 && (
        <div className="flex gap-1 text-xs">
          {criticalCount > 0 && <span className="px-1 rounded" style={{ background: '#ef444420', color: '#ef4444' }}>{criticalCount}C</span>}
          {majorCount > 0 && <span className="px-1 rounded" style={{ background: '#fbbf2420', color: '#fbbf24' }}>{majorCount}M</span>}
          {minorCount > 0 && <span className="px-1 rounded" style={{ background: '#60a5fa20', color: '#60a5fa' }}>{minorCount}m</span>}
        </div>
      )}

      {/* Running spinner */}
      {status === 'running' && (
        <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: colors.accent, borderTopColor: 'transparent' }}
        />
      )}
    </div>
  );
}
