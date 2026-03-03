/**
 * VerificationFeed — Real-time 10-pass verification progress display.
 *
 * Shows the pass list with live progress, finding cards as they stream in,
 * and the verdict banner when the report is compiled.
 *
 * Designed to be rendered within WorkingView when the workflow is 'verification'.
 */

import { useMemo } from 'react';
import type { StreamCard } from '../working/hooks/useWorkingState.js';
import { PassCard } from './PassCard.js';
import { FindingCard } from './FindingCard.js';
import { VerdictBanner } from './VerdictBanner.js';
import { colors } from '../staffing/styles/tokens.js';

const PASS_NAMES = [
  'context', 'ux', 'clarity', 'structure', 'accuracy',
  'completeness', 'risk', 'formatting', 'legal_design', 'delivery',
] as const;

interface VerificationFeedProps {
  streamCards: StreamCard[];
}

export function VerificationFeed({ streamCards }: VerificationFeedProps) {
  // Extract verification-specific cards
  const passStates = useMemo(() => {
    const states = new Map<string, {
      status: 'pending' | 'running' | 'complete';
      score?: number;
      criticalCount?: number;
      majorCount?: number;
      minorCount?: number;
    }>();

    // Initialize all as pending
    for (const name of PASS_NAMES) {
      states.set(name, { status: 'pending' });
    }

    // Process events to build state
    for (const card of streamCards) {
      if (card.kind === 'verification_pass_started') {
        states.set(card.pass, { ...states.get(card.pass)!, status: 'running' });
      } else if (card.kind === 'verification_pass_completed') {
        states.set(card.pass, {
          status: 'complete',
          score: card.score,
          criticalCount: card.criticalCount,
          majorCount: card.majorCount,
          minorCount: card.minorCount,
        });
      }
    }
    return states;
  }, [streamCards]);

  const findings = useMemo(() =>
    streamCards.filter((c): c is Extract<StreamCard, { kind: 'verification_finding' }> =>
      c.kind === 'verification_finding'
    ),
    [streamCards]
  );

  const reportCard = useMemo(() =>
    streamCards.find((c): c is Extract<StreamCard, { kind: 'verification_report' }> =>
      c.kind === 'verification_report'
    ),
    [streamCards]
  );

  const completedCount = useMemo(() =>
    Array.from(passStates.values()).filter(s => s.status === 'complete').length,
    [passStates]
  );

  const hasStarted = completedCount > 0 || Array.from(passStates.values()).some(s => s.status === 'running');

  if (!hasStarted) return null;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: colors.text }}>
          Verification Pipeline
        </h2>
        <span className="text-sm font-mono tabular-nums" style={{ color: colors.textMuted }}>
          {completedCount}/{PASS_NAMES.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 h-1.5 rounded-full overflow-hidden" style={{ background: colors.textMuted + '20' }}>
        {PASS_NAMES.map(name => {
          const state = passStates.get(name);
          const bg =
            state?.status === 'complete'
              ? (state.score !== undefined && state.score >= 0.8 ? '#4ade80' : state.score !== undefined && state.score >= 0.6 ? '#fbbf24' : '#ef4444')
              : state?.status === 'running' ? colors.accent
              : 'transparent';
          return (
            <div
              key={name}
              className="flex-1 rounded-full transition-all duration-500"
              style={{ background: bg }}
            />
          );
        })}
      </div>

      {/* Verdict banner */}
      {reportCard && (
        <VerdictBanner
          verdict={reportCard.verdict}
          overallScore={reportCard.overallScore}
          totalFindings={reportCard.totalFindings}
        />
      )}

      {/* Pass list */}
      <div className="flex flex-col gap-1 rounded-xl p-2" style={{ background: colors.bg }}>
        {PASS_NAMES.map((name, i) => {
          const state = passStates.get(name)!;
          return (
            <PassCard
              key={name}
              pass={name}
              index={i}
              status={state.status}
              score={state.score}
              criticalCount={state.criticalCount}
              majorCount={state.majorCount}
              minorCount={state.minorCount}
            />
          );
        })}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold" style={{ color: colors.text }}>
            Findings ({findings.length})
          </h3>
          {findings.map(f => (
            <FindingCard
              key={f.findingId}
              findingId={f.findingId}
              pass={f.pass}
              severity={f.severity}
              location={f.location}
              description={f.description}
              autoFixable={f.autoFixable}
            />
          ))}
        </div>
      )}
    </div>
  );
}
