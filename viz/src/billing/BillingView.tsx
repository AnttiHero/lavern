/**
 * BillingView — Enhanced invoice with cost breakdown, next steps, and feedback.
 *
 * Beyond a receipt: shows where the budget went (per-phase, per-tier),
 * offers next engagement paths, and collects relationship feedback.
 * This is the difference between a receipt and a relationship.
 */

import { useState, useEffect, useCallback } from 'react';
import { colors, fonts, radii, spacing, tierColor, tierBg } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';
import { STEP_LABELS } from '../types/events.js';
import type { WorkflowStep } from '../types/events.js';

interface Props {
  onClose: () => void;
}

interface BillingData {
  matterNumber: string;
  clientName: string;
  matterTitle: string;
  matterType: string;
  jurisdiction: string;
  feeStructure: string;
  estimatedBudget: number;
  sessionCost: number;
  sessionBudget: number;
  sessionId: string;
  billingCode: string;
  date: string;
}

/** Cost attributed to a single workflow phase */
interface PhaseCost {
  step: WorkflowStep;
  label: string;
  cost: number;
  tier: 'opus' | 'sonnet' | 'haiku';
}

/** Aggregated cost per model tier */
interface TierBreakdown {
  tier: 'opus' | 'sonnet' | 'haiku';
  label: string;
  cost: number;
  percentage: number;
}

/** Survey rating */
interface SurveyRating {
  category: string;
  label: string;
  value: number | null;
}

/** Demo phase cost breakdown — plausible distribution across phases */
function buildDemoPhaseCosts(totalCost: number): PhaseCost[] {
  const phases: { step: WorkflowStep; label: string; pct: number; tier: 'opus' | 'sonnet' | 'haiku' }[] = [
    { step: 'intake', label: STEP_LABELS.intake, pct: 0.05, tier: 'haiku' },
    { step: 'parallel_analysis', label: STEP_LABELS.parallel_analysis, pct: 0.20, tier: 'sonnet' },
    { step: 'debate_1', label: STEP_LABELS.debate_1, pct: 0.12, tier: 'opus' },
    { step: 'ethics_gate', label: STEP_LABELS.ethics_gate, pct: 0.08, tier: 'sonnet' },
    { step: 'transformation', label: STEP_LABELS.transformation, pct: 0.22, tier: 'opus' },
    { step: 'parallel_verification', label: STEP_LABELS.parallel_verification, pct: 0.10, tier: 'sonnet' },
    { step: 'debate_2', label: STEP_LABELS.debate_2, pct: 0.08, tier: 'opus' },
    { step: 'meaning_gate', label: STEP_LABELS.meaning_gate, pct: 0.05, tier: 'sonnet' },
    { step: 'synthesis', label: STEP_LABELS.synthesis, pct: 0.08, tier: 'opus' },
    { step: 'final_gate', label: STEP_LABELS.final_gate, pct: 0.02, tier: 'haiku' },
  ];
  return phases.map(p => ({
    step: p.step,
    label: p.label,
    cost: Math.round(totalCost * p.pct * 100) / 100,
    tier: p.tier,
  }));
}

function buildTierBreakdown(phaseCosts: PhaseCost[], totalCost: number): TierBreakdown[] {
  const tiers = { opus: 0, sonnet: 0, haiku: 0 };
  for (const pc of phaseCosts) tiers[pc.tier] += pc.cost;

  const all: TierBreakdown[] = [
    { tier: 'opus' as const, label: 'Opus', cost: tiers.opus, percentage: totalCost > 0 ? (tiers.opus / totalCost) * 100 : 0 },
    { tier: 'sonnet' as const, label: 'Sonnet', cost: tiers.sonnet, percentage: totalCost > 0 ? (tiers.sonnet / totalCost) * 100 : 0 },
    { tier: 'haiku' as const, label: 'Haiku', cost: tiers.haiku, percentage: totalCost > 0 ? (tiers.haiku / totalCost) * 100 : 0 },
  ];
  return all.filter(t => t.cost > 0);
}

function buildBillingData(): BillingData | null {
  const matterStr = sessionStorage.getItem('shem-matter-data');
  const sessionId = sessionStorage.getItem('shem-session-id') ?? 'N/A';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matter: any = null;
  if (matterStr) {
    try { matter = JSON.parse(matterStr); } catch { /* corrupt data — use defaults */ }
  }

  return {
    matterNumber: matter?.matterNumber ?? 'MBL-0000-000',
    clientName: matter?.response?.clientName ?? matter?.clientName ?? 'Client',
    matterTitle: matter?.response?.matterTitle ?? matter?.matterTitle ?? 'Untitled Matter',
    matterType: matter?.response?.matterType ?? matter?.matterType ?? 'general',
    jurisdiction: matter?.response?.jurisdiction ?? matter?.jurisdiction ?? 'US',
    feeStructure: matter?.response?.feeStructure ?? matter?.feeStructure ?? 'hourly',
    estimatedBudget: matter?.response?.estimatedBudget?.max ?? matter?.estimatedBudgetUsd ?? 10,
    sessionCost: 0,
    sessionBudget: 10,
    sessionId,
    billingCode: matter?.response?.billingCode ?? 'GEN-001',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };
}

/** Next engagement option card */
interface NextOption {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
}

const NEXT_OPTIONS: NextOption[] = [
  {
    icon: '\u25A0',
    title: 'New Matter',
    description: 'Start a fresh engagement with new documents and objectives.',
    actionLabel: 'Begin New Intake',
  },
  {
    icon: '\u25C6',
    title: 'Revision Round',
    description: 'Request adjustments to the delivered work based on your review.',
    actionLabel: 'Request Revision',
  },
  {
    icon: '\u25CB',
    title: 'Related Matter',
    description: 'Open a related engagement that builds on this work product.',
    actionLabel: 'Open Related',
  },
];

const RATING_DOTS = [1, 2, 3, 4, 5];
const RATING_LABELS: Record<number, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };

export default function BillingView({ onClose }: Props) {
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phaseCosts, setPhaseCosts] = useState<PhaseCost[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [ratings, setRatings] = useState<SurveyRating[]>([
    { category: 'quality', label: 'Work Quality', value: null },
    { category: 'speed', label: 'Speed', value: null },
    { category: 'communication', label: 'Communication', value: null },
  ]);

  useEffect(() => {
    const data = buildBillingData();
    setBillingData(data);

    const sessionId = sessionStorage.getItem('shem-session-id');
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}`, { credentials: 'include' })
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then(session => {
          if (data && session.cost) {
            const cost = session.cost.accumulated ?? 0;
            setBillingData({
              ...data,
              sessionCost: cost,
              sessionBudget: session.cost.budget ?? 10,
            });
            setPhaseCosts(buildDemoPhaseCosts(cost));
          }
          setLoading(false);
        })
        .catch(() => {
          // Demo fallback: generate plausible cost
          if (data) {
            const demoCost = 4.27;
            setBillingData({ ...data, sessionCost: demoCost });
            setPhaseCosts(buildDemoPhaseCosts(demoCost));
          }
          setLoading(false);
        });
    } else {
      // No session — use demo fallback
      if (data) {
        const demoCost = 4.27;
        setBillingData({ ...data, sessionCost: demoCost });
        setPhaseCosts(buildDemoPhaseCosts(demoCost));
      }
      setLoading(false);
    }
  }, []);

  const handleRate = useCallback((category: string, value: number) => {
    setRatings(prev => prev.map(r =>
      r.category === category ? { ...r, value } : r
    ));
  }, []);

  const handleSubmitSurvey = useCallback(() => {
    // In production: POST to /api/feedback
    setSurveySubmitted(true);
  }, []);

  const tierBreakdown = buildTierBreakdown(phaseCosts, billingData?.sessionCost ?? 0);

  if (!billingData) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyTitle}>No billing data</div>
          <button onClick={onClose} style={styles.closeBtn}>Return Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Invoice document */}
      <div style={styles.invoice}>
        {/* Invoice header */}
        <div style={styles.invoiceHeader}>
          <div>
            <div style={styles.firmName}><LavernIlluminated /></div>
            <div style={styles.firmTag}>The Agentic Law Firm</div>
          </div>
          <div style={styles.invoiceLabel}>INVOICE</div>
        </div>

        <div style={styles.divider} />

        {/* Meta: billed to + matter */}
        <div style={styles.metaRow}>
          <div style={styles.metaCol}>
            <div style={styles.metaLabel}>Billed To</div>
            <div style={styles.metaValue}>{billingData.clientName}</div>
          </div>
          <div style={styles.metaCol}>
            <div style={styles.metaLabel}>Matter</div>
            <div style={styles.metaValue}>{billingData.matterNumber}</div>
            <div style={styles.metaSubvalue}>{billingData.matterTitle}</div>
          </div>
          <div style={styles.metaCol}>
            <div style={styles.metaLabel}>Date</div>
            <div style={styles.metaValue}>{billingData.date}</div>
            <div style={styles.metaSubvalue}>{billingData.billingCode}</div>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Cost breakdown */}
        <div style={styles.breakdownSection}>
          <div style={styles.breakdownTitle}>Cost Summary</div>

          <div style={styles.lineItem}>
            <span>Matter Type</span>
            <span style={styles.lineValue}>{billingData.matterType.replace(/_/g, ' ')}</span>
          </div>
          <div style={styles.lineItem}>
            <span>Jurisdiction</span>
            <span style={styles.lineValue}>{billingData.jurisdiction}</span>
          </div>
          <div style={styles.lineItem}>
            <span>Fee Structure</span>
            <span style={styles.lineValue}>{billingData.feeStructure}</span>
          </div>
          <div style={styles.lineItem}>
            <span>Session Budget</span>
            <span style={styles.lineValue}>${billingData.sessionBudget.toFixed(2)}</span>
          </div>

          <div style={styles.dividerThin} />

          <div style={styles.lineItem}>
            <span>AI Agent Computation</span>
            <span style={styles.lineValue}>
              {loading ? '...' : `$${billingData.sessionCost.toFixed(2)}`}
            </span>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Total */}
        <div style={styles.totalSection}>
          <div style={styles.totalLabel}>Total Due</div>
          <div style={styles.totalAmount}>
            ${loading ? '...' : billingData.sessionCost.toFixed(2)}
          </div>
        </div>

        {/* Budget comparison */}
        {!loading && (
          <div style={styles.budgetNote}>
            {billingData.sessionCost <= billingData.sessionBudget
              ? `Within budget ($${billingData.sessionBudget.toFixed(2)} allocated)`
              : `Over budget by $${(billingData.sessionCost - billingData.sessionBudget).toFixed(2)}`}
          </div>
        )}

        {/* Phase-level cost breakdown — expandable */}
        {!loading && phaseCosts.length > 0 && (
          <>
            <div style={styles.divider} />

            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              style={styles.breakdownToggle}
            >
              <span style={styles.breakdownToggleLabel}>
                {showBreakdown ? 'Hide' : 'Show'} Phase Breakdown
              </span>
              <span style={styles.breakdownToggleIcon}>
                {showBreakdown ? '\u25B2' : '\u25BC'}
              </span>
            </button>

            {showBreakdown && (
              <div style={styles.phaseBreakdown}>
                {/* Per-phase costs */}
                {phaseCosts.map(pc => (
                  <div key={pc.step} style={styles.phaseRow}>
                    <div style={styles.phaseLabel}>
                      <span style={{
                        ...styles.tierDot,
                        backgroundColor: tierColor(pc.tier),
                      }} />
                      {pc.label}
                    </div>
                    <div style={styles.phaseCost}>
                      <span style={{
                        ...styles.tierTag,
                        color: tierColor(pc.tier),
                        backgroundColor: tierBg(pc.tier),
                      }}>
                        {pc.tier}
                      </span>
                      ${pc.cost.toFixed(2)}
                    </div>
                  </div>
                ))}

                <div style={styles.dividerThin} />

                {/* Tier summary */}
                <div style={styles.tierSummaryTitle}>By Model Tier</div>
                {tierBreakdown.map(t => (
                  <div key={t.tier} style={styles.tierRow}>
                    <div style={styles.tierRowLabel}>
                      <span style={{
                        ...styles.tierDot,
                        backgroundColor: tierColor(t.tier),
                      }} />
                      {t.label}
                    </div>
                    <div style={styles.tierRowBar}>
                      <div style={{
                        ...styles.tierBarFill,
                        width: `${Math.max(t.percentage, 2)}%`,
                        backgroundColor: tierColor(t.tier),
                      }} />
                    </div>
                    <div style={styles.tierRowCost}>
                      ${t.cost.toFixed(2)}
                      <span style={styles.tierRowPct}>{t.percentage.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* What's Next — engagement option cards */}
      <div style={styles.nextSection}>
        <div style={styles.nextTitle}>What{'\u2019'}s Next?</div>
        <div style={styles.nextGrid}>
          {NEXT_OPTIONS.map((opt, i) => (
            <button
              key={i}
              onClick={i === 0 ? onClose : undefined}
              style={styles.nextCard}
            >
              <div style={styles.nextCardIcon}>{opt.icon}</div>
              <div style={styles.nextCardTitle}>{opt.title}</div>
              <div style={styles.nextCardDesc}>{opt.description}</div>
              <div style={styles.nextCardAction}>{opt.actionLabel} {'\u2192'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div style={styles.surveySection}>
        {!surveySubmitted ? (
          <>
            <div style={styles.surveyHeader}>
              <div style={styles.surveyTitle}>How did we do?</div>
              <div style={styles.surveySubtitle}>Your assessment shapes every future engagement.</div>
            </div>

            <div style={styles.surveyRows}>
              {ratings.map(r => (
                <div key={r.category} style={styles.surveyRow}>
                  <div style={styles.surveyRowLabel}>{r.label}</div>
                  <div style={styles.surveyDots}>
                    {RATING_DOTS.map(v => (
                      <button
                        key={v}
                        onClick={() => handleRate(r.category, v)}
                        style={{
                          ...styles.surveyDot,
                          backgroundColor: r.value !== null && v <= r.value
                            ? (r.value >= 4 ? colors.accent : colors.text)
                            : 'transparent',
                          borderColor: r.value !== null && v <= r.value
                            ? (r.value >= 4 ? colors.accent : colors.text)
                            : colors.border,
                        }}
                        title={RATING_LABELS[v]}
                      />
                    ))}
                  </div>
                  <div style={styles.surveyRowValue}>
                    {r.value !== null ? RATING_LABELS[r.value] : ''}
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.surveyFooter}>
              <button
                onClick={handleSubmitSurvey}
                disabled={ratings.some(r => r.value === null)}
                style={{
                  ...styles.surveySubmitBtn,
                  opacity: ratings.some(r => r.value === null) ? 0.3 : 1,
                  cursor: ratings.some(r => r.value === null) ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => { if (!ratings.some(r => r.value === null)) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              >
                Submit {'\u2192'}
              </button>
            </div>
          </>
        ) : (
          <div style={styles.surveyThanks}>
            <div style={styles.surveyThanksCheck}>{'\u2713'}</div>
            <div style={styles.surveyThanksTitle}>Thank you.</div>
            <div style={styles.surveyThanksText}>Your feedback has been recorded.</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button
          onClick={() => window.print()}
          style={styles.printBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >
          Print Invoice
        </button>
        <button
          onClick={onClose}
          style={styles.closeBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        >
          Close Matter & Return Home
        </button>
      </div>

      <div style={{ height: 80 }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bgPanel,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  invoice: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: `${spacing.xxxl}px`,
    boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
  },
  invoiceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  firmName: {
    fontSize: 18,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    letterSpacing: 6,
  },
  firmTag: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    marginTop: 2,
  },
  invoiceLabel: {
    fontSize: 14,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.textMuted,
    letterSpacing: 8,
    textTransform: 'uppercase' as const,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    margin: `${spacing.lg}px 0`,
  },
  dividerThin: {
    height: 1,
    backgroundColor: colors.border,
    margin: `${spacing.sm}px 0`,
    opacity: 0.5,
  },
  metaRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: spacing.lg,
  },
  metaCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: 500,
    color: colors.text,
  },
  metaSubvalue: {
    fontSize: 12,
    color: colors.textMuted,
  },
  breakdownSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  lineItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: colors.textSecondary,
    padding: '4px 0',
  },
  lineValue: {
    fontWeight: 500,
    color: colors.text,
    textTransform: 'capitalize' as const,
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: `${spacing.md}px 0`,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
  },
  budgetNote: {
    fontSize: 12,
    color: colors.textDim,
    textAlign: 'right',
    marginTop: -4,
  },

  // Phase breakdown (expandable)
  breakdownToggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 0',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontFamily: fonts.sans,
  },
  breakdownToggleLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.accent,
  },
  breakdownToggleIcon: {
    fontSize: 10,
    color: colors.accent,
  },
  phaseBreakdown: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: `${spacing.md}px 0`,
  },
  phaseRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
  },
  phaseLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: colors.textSecondary,
  },
  tierDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  phaseCost: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: fonts.mono,
    color: colors.text,
  },
  tierTag: {
    fontSize: 9,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: radii.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tierSummaryTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  tierRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 0',
  },
  tierRowLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: colors.textSecondary,
    width: 70,
    flexShrink: 0,
  },
  tierRowBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  tierBarFill: {
    height: '100%',
    borderRadius: radii.pill,
    transition: 'width 0.3s ease',
    opacity: 0.7,
  },
  tierRowCost: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: fonts.mono,
    color: colors.text,
    width: 80,
    textAlign: 'right',
    flexShrink: 0,
  },
  tierRowPct: {
    fontSize: 10,
    color: colors.textDim,
    marginLeft: 4,
  },

  // What's Next
  nextSection: {
    width: '100%',
    maxWidth: 700,
    marginTop: spacing.xxl,
  },
  nextTitle: {
    fontSize: 14,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  nextGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.md,
  },
  nextCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: `${spacing.xl}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    fontFamily: fonts.sans,
    textAlign: 'center',
  },
  nextCardIcon: {
    fontSize: 16,
    color: colors.accent,
    marginBottom: 4,
  },
  nextCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
  },
  nextCardDesc: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 1.5,
  },
  nextCardAction: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.accent,
    marginTop: 4,
  },

  // Feedback
  surveySection: {
    width: '100%',
    maxWidth: 700,
    marginTop: spacing.xxl,
    padding: `${spacing.xl}px ${spacing.xxl}px`,
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  surveyHeader: {
    marginBottom: spacing.xl,
  },
  surveyTitle: {
    fontSize: 20,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    marginBottom: 4,
  },
  surveySubtitle: {
    fontSize: 12,
    color: colors.textDim,
    fontFamily: fonts.sans,
  },
  surveyRows: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
  },
  surveyRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 0',
    borderBottom: `1px solid ${colors.bgPanel}`,
  },
  surveyRowLabel: {
    width: 130,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.text,
    flexShrink: 0,
  },
  surveyDots: {
    display: 'flex',
    gap: 8,
    flex: 1,
  },
  surveyDot: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
    transition: 'background-color 0.2s ease, border-color 0.2s ease, transform 0.15s ease',
  },
  surveyRowValue: {
    width: 80,
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  surveyFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: spacing.lg,
  },
  surveySubmitBtn: {
    padding: '10px 28px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  surveyThanks: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: `${spacing.xl}px`,
  },
  surveyThanksCheck: {
    fontSize: 20,
    color: colors.success,
    fontWeight: 700,
  },
  surveyThanksTitle: {
    fontSize: 18,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
  },
  surveyThanksText: {
    fontSize: 12,
    color: colors.textDim,
    fontFamily: fonts.sans,
  },

  // Actions
  actions: {
    width: '100%',
    maxWidth: 700,
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  printBtn: {
    padding: '10px 28px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  closeBtn: {
    padding: '12px 36px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.text,
  },
};
