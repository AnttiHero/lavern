/**
 * ClientInfoForm — Step-by-step guided intake.
 *
 * Five conversational steps, one question at a time:
 *   1. Who's the client?
 *   2. What's this about?
 *   3. What type of work?
 *   4. Where (jurisdiction)?
 *   5. Budget & fee structure
 *
 * Card-based choices auto-advance. Text inputs advance on Enter.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { IntakePhase } from './IntakeProgress.js';

export interface ClientFormData {
  clientName: string;
  matterTitle: string;
  matterDescription: string;
  matterType: string;
  jurisdiction: string;
  estimatedBudgetUsd: number;
  feeStructure: string;
}

interface Props {
  onSubmit: (data: ClientFormData) => void;
  loading: boolean;
  guidedStep: IntakePhase;
  onStepChange: (step: IntakePhase) => void;
}

// ── Matter type SVG icons — consistent 24×24 thin-line art ─────────────

function MatterIcon({ type }: { type: string }) {
  const s = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'contract_review': return (
      <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></svg>
    );
    case 'document_redesign': return (
      <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="12" y2="17" /></svg>
    );
    case 'legal_research': return (
      <svg {...s}><path d="M4 4h16v16H4z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></svg>
    );
    case 'legal_question': return (
      <svg {...s}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none" /></svg>
    );
    case 'risk_assessment': return (
      <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
    );
    default: return (
      <svg {...s}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></svg>
    );
  }
}

const MATTER_TYPES = [
  { value: 'contract_review', label: 'Contract Review', desc: 'Review, draft, or negotiate agreements' },
  { value: 'document_redesign', label: 'Document Review', desc: 'Review and improve legal documents' },
  { value: 'legal_research', label: 'Legal Research', desc: 'Research memo or legal brief' },
  { value: 'legal_question', label: 'Advisory', desc: 'Quick legal question or opinion' },
  { value: 'risk_assessment', label: 'Risk Assessment', desc: 'Compliance or risk analysis' },
  { value: 'general', label: 'General', desc: 'Other legal work' },
];

const JURISDICTIONS = [
  { value: 'US', label: 'US' },
  { value: 'EU', label: 'EU' },
  { value: 'UK', label: 'UK' },
  { value: 'CA', label: 'CA' },
  { value: 'AU', label: 'AU' },
];

const BUDGET_TIERS = [
  { value: 3, label: 'Lean', desc: '$3 \u2013 Quick analysis', tag: '$3' },
  { value: 10, label: 'Standard', desc: '$10 \u2013 Balanced coverage', tag: '$10' },
  { value: 20, label: 'Premium', desc: '$20 \u2013 Deep analysis', tag: '$20' },
];

const FEE_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'fixed', label: 'Fixed Fee' },
  { value: 'outcome-based', label: 'Outcome' },
  { value: 'subscription', label: 'Subscription' },
];

const STEP_MAP: Record<string, number> = {
  'guided-1': 1, 'guided-2': 2, 'guided-3': 3, 'guided-4': 4, 'guided-5': 5,
};

export function ClientInfoForm({ onSubmit, loading, guidedStep, onStepChange }: Props) {
  const step = STEP_MAP[guidedStep] ?? 1;
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState<ClientFormData>({
    clientName: '',
    matterTitle: '',
    matterDescription: '',
    matterType: 'contract_review',
    jurisdiction: 'US',
    estimatedBudgetUsd: 10,
    feeStructure: 'hourly',
  });

  const [customJurisdiction, setCustomJurisdiction] = useState('');
  const [customBudget, setCustomBudget] = useState(false);

  const set = useCallback((key: keyof ClientFormData, value: string | number) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // Auto-focus inputs on step change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 1 || step === 4) inputRef.current?.focus();
      if (step === 2) inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [step]);

  const goNext = useCallback(() => {
    const nextSteps: Record<number, IntakePhase> = {
      1: 'guided-2', 2: 'guided-3', 3: 'guided-4', 4: 'guided-5',
    };
    const next = nextSteps[step];
    if (next) onStepChange(next);
  }, [step, onStepChange]);

  const goBack = useCallback(() => {
    const prevSteps: Record<number, IntakePhase> = {
      2: 'guided-1', 3: 'guided-2', 4: 'guided-3', 5: 'guided-4',
    };
    const prev = prevSteps[step];
    if (prev) onStepChange(prev);
  }, [step, onStepChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (step === 1 && form.clientName.trim()) goNext();
      if (step === 2 && form.matterTitle.trim()) goNext();
    }
  }, [step, form.clientName, form.matterTitle, goNext]);

  const handleSubmit = useCallback(() => {
    // Ensure matterDescription is never empty (backend requires min 1 char)
    const resolved = {
      ...form,
      matterDescription: form.matterDescription.trim() || form.matterTitle.trim() || 'General legal matter',
      jurisdiction: (customJurisdiction && form.jurisdiction === 'OTHER')
        ? customJurisdiction
        : form.jurisdiction,
    };
    onSubmit(resolved);
  }, [form, customJurisdiction, onSubmit]);

  return (
    <div style={styles.container}>
      {/* Step 1: Client name */}
      {step === 1 && (
        <div style={styles.stepCard}>
          <div style={styles.question}>Who is the client?</div>
          <input
            ref={inputRef}
            type="text"
            value={form.clientName}
            onChange={e => set('clientName', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Acme Corporation"
            style={styles.bigInput}
            autoFocus
          />
          <div style={styles.stepActions}>
            <div />
            <button
              onClick={goNext}
              disabled={!form.clientName.trim()}
              style={{
                ...styles.nextBtn,
                opacity: form.clientName.trim() ? 1 : 0.3,
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            >
              Continue {'\u2192'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Matter title + description */}
      {step === 2 && (
        <div style={styles.stepCard}>
          <div style={styles.question}>What is this about?</div>
          <input
            ref={inputRef}
            type="text"
            value={form.matterTitle}
            onChange={e => set('matterTitle', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SaaS Agreement Review"
            style={styles.bigInput}
          />
          <textarea
            ref={textareaRef}
            value={form.matterDescription}
            onChange={e => set('matterDescription', e.target.value)}
            placeholder="Brief description of the matter..."
            style={styles.textArea}
            rows={3}
          />
          <div style={styles.stepActions}>
            <button onClick={goBack} style={styles.backStepBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >{'\u2190'}</button>
            <button
              onClick={goNext}
              disabled={!form.matterTitle.trim()}
              style={{
                ...styles.nextBtn,
                opacity: form.matterTitle.trim() ? 1 : 0.3,
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            >
              Continue {'\u2192'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Matter type — card selection */}
      {step === 3 && (
        <div style={styles.stepCard}>
          <div style={styles.question}>What type of work?</div>
          <div style={styles.cardGrid}>
            {MATTER_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => {
                  set('matterType', t.value);
                  setTimeout(goNext, 300);
                }}
                style={{
                  ...styles.typeCard,
                  borderColor: form.matterType === t.value ? colors.accent : colors.border,
                  backgroundColor: form.matterType === t.value ? colors.accentLight : colors.bgCard,
                }}
              >
                <span style={styles.typeIcon}><MatterIcon type={t.value} /></span>
                <span style={styles.typeLabel}>{t.label}</span>
                <span style={styles.typeDesc}>{t.desc}</span>
              </button>
            ))}
          </div>
          <div style={styles.stepActions}>
            <button onClick={goBack} style={styles.backStepBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >{'\u2190'}</button>
            <div />
          </div>
        </div>
      )}

      {/* Step 4: Jurisdiction — chip selection */}
      {step === 4 && (
        <div style={styles.stepCard}>
          <div style={styles.question}>Which jurisdiction?</div>
          <div style={styles.chipRow}>
            {JURISDICTIONS.map(j => (
              <button
                key={j.value}
                onClick={() => {
                  set('jurisdiction', j.value);
                  setCustomJurisdiction('');
                  setTimeout(goNext, 300);
                }}
                style={{
                  ...styles.chip,
                  borderColor: form.jurisdiction === j.value ? colors.accent : colors.border,
                  backgroundColor: form.jurisdiction === j.value ? colors.accentLight : colors.bgCard,
                  color: form.jurisdiction === j.value ? colors.accent : colors.textSecondary,
                }}
              >
                {j.label}
              </button>
            ))}
            <button
              onClick={() => {
                set('jurisdiction', 'OTHER');
              }}
              style={{
                ...styles.chip,
                borderColor: form.jurisdiction === 'OTHER' ? colors.accent : colors.border,
                backgroundColor: form.jurisdiction === 'OTHER' ? colors.accentLight : colors.bgCard,
                color: form.jurisdiction === 'OTHER' ? colors.accent : colors.textSecondary,
              }}
            >
              Other
            </button>
          </div>
          {form.jurisdiction === 'OTHER' && (
            <input
              ref={inputRef}
              type="text"
              value={customJurisdiction}
              onChange={e => setCustomJurisdiction(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && customJurisdiction.trim()) goNext(); }}
              placeholder="e.g. Finland, Singapore..."
              style={styles.inlineInput}
              autoFocus
            />
          )}
          <div style={styles.stepActions}>
            <button onClick={goBack} style={styles.backStepBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >{'\u2190'}</button>
            {form.jurisdiction === 'OTHER' && (
              <button
                onClick={goNext}
                disabled={!customJurisdiction.trim()}
                style={{
                  ...styles.nextBtn,
                  opacity: customJurisdiction.trim() ? 1 : 0.3,
                }}
                onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              >
                Continue {'\u2192'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Budget + Fee structure */}
      {step === 5 && (
        <div style={styles.stepCard}>
          <div style={styles.question}>Budget & fee structure</div>

          <div style={styles.subLabel}>AI Analysis Budget</div>
          <div style={styles.tierRow}>
            {BUDGET_TIERS.map(b => (
              <button
                key={b.value}
                onClick={() => { set('estimatedBudgetUsd', b.value); setCustomBudget(false); }}
                style={{
                  ...styles.tierCard,
                  borderColor: !customBudget && form.estimatedBudgetUsd === b.value ? colors.accent : colors.border,
                  backgroundColor: !customBudget && form.estimatedBudgetUsd === b.value ? colors.accentLight : colors.bgCard,
                }}
              >
                <span style={styles.tierTag}>{b.tag}</span>
                <span style={styles.tierLabel}>{b.label}</span>
                <span style={styles.tierDesc}>{b.desc}</span>
              </button>
            ))}
            <button
              onClick={() => setCustomBudget(true)}
              style={{
                ...styles.tierCard,
                borderColor: customBudget ? colors.accent : colors.border,
                backgroundColor: customBudget ? colors.accentLight : colors.bgCard,
              }}
            >
              <span style={styles.tierTag}>$?</span>
              <span style={styles.tierLabel}>Custom</span>
              <span style={styles.tierDesc}>Set your own</span>
            </button>
          </div>

          {customBudget && (
            <div style={styles.customBudgetRow}>
              <span style={styles.dollarSign}>$</span>
              <input
                type="number"
                value={form.estimatedBudgetUsd}
                min={1}
                max={100}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  set('estimatedBudgetUsd', Number.isFinite(v) ? Math.max(1, Math.min(100, v)) : 10);
                }}
                style={styles.customBudgetInput}
                autoFocus
              />
            </div>
          )}

          <div style={{ ...styles.subLabel, marginTop: spacing.lg }}>Fee Arrangement</div>
          <div style={styles.chipRow}>
            {FEE_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => set('feeStructure', f.value)}
                style={{
                  ...styles.chip,
                  borderColor: form.feeStructure === f.value ? colors.accent : colors.border,
                  backgroundColor: form.feeStructure === f.value ? colors.accentLight : colors.bgCard,
                  color: form.feeStructure === f.value ? colors.accent : colors.textSecondary,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={styles.stepActions}>
            <button onClick={goBack} style={styles.backStepBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >{'\u2190'}</button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!loading) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            >
              {loading ? 'Running checks...' : 'Run Pre-Engagement Checks \u2192'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 560,
    margin: '0 auto',
  },
  stepCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  question: {
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 1.3,
  },
  bigInput: {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    transition: 'border-color 0.2s ease',
  },
  textArea: {
    width: '100%',
    padding: '12px 14px',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
    resize: 'vertical',
    lineHeight: 1.5,
  },
  inlineInput: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
  },
  stepActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  nextBtn: {
    padding: '10px 24px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  backStepBtn: {
    padding: '8px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  submitBtn: {
    padding: '11px 28px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  // Card grid for matter type
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  typeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '14px 8px',
    border: '1px solid',
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    textAlign: 'center',
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
  },
  typeIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.textSecondary,
    marginBottom: 4,
    opacity: 0.6,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
  },
  typeDesc: {
    fontSize: 10,
    color: colors.textDim,
    lineHeight: 1.3,
  },

  // Chips for jurisdiction + fee
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  chip: {
    padding: '8px 18px',
    borderRadius: radii.pill,
    border: '1px solid',
    cursor: 'pointer',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    backgroundColor: 'transparent',
  },

  // Budget tiers
  subLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tierRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
  },
  tierCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '12px 6px',
    border: '1px solid',
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
  },
  tierTag: {
    fontSize: 16,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.text,
  },
  tierDesc: {
    fontSize: 9,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 1.3,
  },
  customBudgetRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  dollarSign: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.textMuted,
  },
  customBudgetInput: {
    width: 80,
    padding: '8px 12px',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: 300,
    color: colors.text,
    textAlign: 'center',
  },
};
