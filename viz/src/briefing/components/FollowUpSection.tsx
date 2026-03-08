/**
 * FollowUpSection — LLM-generated follow-up questions + sufficiency display.
 *
 * Shows after static questions are analyzed:
 * - Sufficiency card: score bar, verdict badge, gaps list, ambiguities list
 * - Follow-up questions rendered as input fields
 * - "Continue" button (if adequate) + "Re-analyze" button (after answering)
 */

import type { Sufficiency, FollowUpQuestion } from '../hooks/useBriefingAnalysis.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  sufficiency: Sufficiency;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  onSetAnswer: (id: string, value: string) => void;
  onContinue: () => void;
  onReanalyze: () => void;
  isAnalyzing: boolean;
  analysisRound: number;
  maxRounds: number;
}

const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
  insufficient: { label: 'Needs More Context', color: colors.danger },
  adequate: { label: 'Adequate', color: colors.warning },
  strong: { label: 'Strong', color: colors.success },
};

const CATEGORY_LABELS: Record<string, string> = {
  context: 'Context',
  scope: 'Scope',
  constraints: 'Constraints',
  objectives: 'Objectives',
};

export function FollowUpSection({
  sufficiency,
  followUpQuestions,
  followUpAnswers,
  onSetAnswer,
  onContinue,
  onReanalyze,
  isAnalyzing,
  analysisRound,
  maxRounds,
}: Props) {
  const verdictInfo = VERDICT_LABELS[sufficiency.verdict] ?? VERDICT_LABELS.adequate;
  const hasFollowUps = followUpQuestions.length > 0;
  const answeredCount = followUpQuestions.filter(
    q => (followUpAnswers[q.id] ?? '').trim().length > 0,
  ).length;
  const requiredUnanswered = followUpQuestions.filter(
    q => q.required && !(followUpAnswers[q.id] ?? '').trim(),
  ).length;
  const canReanalyze = answeredCount > 0 && analysisRound < maxRounds;

  return (
    <div style={styles.container}>
      {/* Sufficiency Card */}
      <div style={styles.sufficiencyCard}>
        <div style={styles.sufficiencyHeader}>
          <span style={styles.sufficiencyTitle}>Context Assessment</span>
          <span style={{ ...styles.verdictBadge, backgroundColor: verdictInfo.color }}>
            {verdictInfo.label}
          </span>
        </div>

        {/* Score bar */}
        <div style={styles.scoreRow}>
          <div style={styles.scoreBar}>
            <div
              style={{
                ...styles.scoreFill,
                width: `${Math.min(100, sufficiency.score)}%`,
                backgroundColor: verdictInfo.color,
              }}
            />
          </div>
          <span style={styles.scoreText}>{sufficiency.score}%</span>
        </div>

        {/* Gaps */}
        {sufficiency.gaps.length > 0 && (
          <div style={styles.insightGroup}>
            <span style={styles.insightLabel}>Gaps identified</span>
            {sufficiency.gaps.map((gap, i) => (
              <div key={i} style={styles.insightItem}>
                <span style={styles.bulletDanger}>{'\u2022'}</span> {gap}
              </div>
            ))}
          </div>
        )}

        {/* Ambiguities */}
        {sufficiency.ambiguities.length > 0 && (
          <div style={styles.insightGroup}>
            <span style={styles.insightLabel}>Ambiguities</span>
            {sufficiency.ambiguities.map((amb, i) => (
              <div key={i} style={styles.insightItem}>
                <span style={styles.bulletWarning}>{'\u2022'}</span> {amb}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Follow-up Questions */}
      {hasFollowUps && (
        <div style={styles.questionsSection}>
          <div style={styles.questionsSectionTitle}>
            We have a few follow-up questions to strengthen your brief
          </div>

          {followUpQuestions.map((q) => (
            <div key={q.id} style={styles.questionCard}>
              <div style={styles.questionHeader}>
                <span style={styles.questionText}>{q.text}</span>
                <div style={styles.questionMeta}>
                  <span style={styles.categoryChip}>
                    {CATEGORY_LABELS[q.category] ?? q.category}
                  </span>
                  {q.required && (
                    <span style={styles.requiredChip}>Required</span>
                  )}
                </div>
              </div>
              {q.hint && (
                <div style={styles.hint}>{q.hint}</div>
              )}
              <textarea
                value={followUpAnswers[q.id] ?? ''}
                onChange={e => onSetAnswer(q.id, e.target.value)}
                placeholder="Your answer..."
                style={styles.textarea}
                rows={3}
              />
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={styles.actions}>
        {canReanalyze && (
          <button
            onClick={onReanalyze}
            disabled={isAnalyzing || requiredUnanswered > 0}
            style={{
              ...styles.reanalyzeBtn,
              opacity: isAnalyzing || requiredUnanswered > 0 ? 0.5 : 1,
              cursor: isAnalyzing || requiredUnanswered > 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {isAnalyzing ? 'Analyzing...' : 'Re-analyze with Answers'}
          </button>
        )}
        <button
          onClick={onContinue}
          disabled={isAnalyzing}
          style={{
            ...styles.continueBtn,
            opacity: isAnalyzing ? 0.5 : 1,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (!isAnalyzing) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
          onMouseLeave={e => { if (!isAnalyzing) { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; } }}
        >
          {sufficiency.verdict === 'strong' || !hasFollowUps
            ? 'Continue \u2192'
            : requiredUnanswered > 0
              ? `Answer ${requiredUnanswered} required question${requiredUnanswered !== 1 ? 's' : ''}`
              : 'Continue \u2192'}
        </button>
      </div>

      {analysisRound >= maxRounds && hasFollowUps && (
        <div style={styles.maxRoundsNote}>
          Maximum analysis rounds reached. You can continue with the current brief.
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  sufficiencyCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  sufficiencyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sufficiencyTitle: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
  },
  verdictBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#fff',
    padding: '3px 10px',
    borderRadius: radii.pill,
    textTransform: 'uppercase' as const,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  scoreBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.5s ease',
  },
  scoreText: {
    fontSize: 12,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.text,
    minWidth: 36,
    textAlign: 'right' as const,
  },
  insightGroup: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border}`,
  },
  insightLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
    display: 'block',
  },
  insightItem: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.5,
    paddingLeft: 4,
  },
  bulletDanger: {
    color: colors.danger,
    marginRight: 4,
  },
  bulletWarning: {
    color: colors.warning,
    marginRight: 4,
  },
  questionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  questionsSectionTitle: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontWeight: 500,
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  questionCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  questionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  questionText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.text,
    flex: 1,
  },
  questionMeta: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  categoryChip: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 500,
    letterSpacing: 0.3,
    color: colors.textMuted,
    backgroundColor: colors.bgPanel,
    padding: '2px 8px',
    borderRadius: radii.pill,
    textTransform: 'uppercase' as const,
  },
  requiredChip: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    padding: '2px 8px',
    borderRadius: radii.pill,
    textTransform: 'uppercase' as const,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    color: colors.textDim,
    marginBottom: 8,
  },
  textarea: {
    width: '100%',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 1.5,
    padding: '10px 12px',
    resize: 'vertical' as const,
    minHeight: 60,
    boxSizing: 'border-box' as const,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  reanalyzeBtn: {
    padding: '10px 20px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  continueBtn: {
    padding: '12px 28px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  maxRoundsNote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    color: colors.textDim,
    textAlign: 'center' as const,
  },
};
