/**
 * FindingCard — Displays a single verification finding.
 * Color-coded by severity: critical (red), major (amber), minor (blue).
 */

import { colors } from '../staffing/styles/tokens.js';

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  critical: { bg: '#ef444410', border: '#ef4444', text: '#ef4444', label: 'CRITICAL' },
  major: { bg: '#fbbf2410', border: '#fbbf24', text: '#fbbf24', label: 'MAJOR' },
  minor: { bg: '#60a5fa10', border: '#60a5fa', text: '#60a5fa', label: 'MINOR' },
};

const PASS_LABELS: Record<string, string> = {
  context: 'Context',
  ux: 'UX',
  clarity: 'Clarity',
  structure: 'Structure',
  accuracy: 'Accuracy',
  completeness: 'Completeness',
  risk: 'Risk',
  formatting: 'Formatting',
  legal_design: 'Legal Design',
  delivery: 'Delivery',
};

interface FindingCardProps {
  findingId: string;
  pass: string;
  severity: string;
  location: string;
  description: string;
  autoFixable: boolean;
}

export function FindingCard({ findingId, pass, severity, location, description, autoFixable }: FindingCardProps) {
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.minor;
  const passLabel = PASS_LABELS[pass] ?? pass;

  return (
    <div
      className="px-3 py-2 rounded-lg border-l-2"
      style={{ background: style.bg, borderLeftColor: style.border }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono px-1 rounded" style={{ background: style.border + '20', color: style.text }}>
          {style.label}
        </span>
        <span className="text-[10px] font-mono" style={{ color: colors.textMuted }}>
          {findingId}
        </span>
        <span className="text-[10px]" style={{ color: colors.textMuted }}>
          {passLabel}
        </span>
        {autoFixable && (
          <span className="text-[10px] px-1 rounded" style={{ background: '#4ade8020', color: '#4ade80' }}>
            auto-fix
          </span>
        )}
      </div>
      <p className="text-sm leading-snug" style={{ color: colors.text }}>
        {description}
      </p>
      <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
        {location}
      </p>
    </div>
  );
}
