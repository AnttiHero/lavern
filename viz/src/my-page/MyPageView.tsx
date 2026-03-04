/**
 * MyPageView — Persistent user profile, saved teams & custom instructions.
 *
 * Five sections:
 *   1. About You       — name, firm, jurisdiction
 *   2. Default Settings — workflow, intensity, budget, yolo toggle
 *   3. Custom Instructions — free-text appended to every briefing memo
 *   4. Marble's Soul   — personality, voice, principles that shape agent behavior
 *   5. Saved Teams     — reusable team presets
 *
 * Auto-saves on every change (debounced 500ms via React state → localStorage).
 */

import { useCallback, useState } from 'react';
import { colors, fonts, spacing, radii } from '../staffing/styles/tokens.js';
import { useUserProfile } from './hooks/useUserProfile.js';
import type { UserProfile } from './hooks/useUserProfile.js';

interface Props {
  onBack: () => void;
}

// ── Workflow options ────────────────────────────────────────────────────

const WORKFLOW_OPTIONS = [
  { value: 'counsel', label: 'Counsel' },
  { value: 'review', label: 'Review' },
  { value: 'adversarial', label: 'Adversarial' },
  { value: 'roundtable', label: 'Roundtable' },
  { value: 'full-bench', label: 'Full Bench' },
  { value: 'pre-engagement', label: 'Pre-Engagement' },
];

const INTENSITY_OPTIONS = [
  { value: 'quick', label: 'Quick' },
  { value: 'standard', label: 'Standard' },
  { value: 'thorough', label: 'Thorough' },
  { value: 'maximal', label: 'Maximal' },
];

const MAX_INSTRUCTIONS = 2000;
const MAX_SOUL = 5000;

// ── Component ──────────────────────────────────────────────────────────

export default function MyPageView({ onBack }: Props) {
  const { profile, updateProfile, deleteTeam, hasSavedTeams } = useUserProfile();

  // Simple field updater
  const field = useCallback(
    <K extends keyof UserProfile>(key: K) =>
      (value: UserProfile[K]) => updateProfile({ [key]: value }),
    [updateProfile],
  );

  return (
    <div style={styles.page}>
      {/* Back link */}
      <button
        onClick={onBack}
        style={styles.backLink}
        onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
      >
        {'\u2190'} Back to Home
      </button>

      {/* Page title */}
      <h1 style={styles.pageTitle}>Marble <span style={{ fontStyle: 'italic' }}>Profile</span></h1>
      <p style={styles.pageSub}>
        Your preferences persist across engagements. Everything saves automatically.
      </p>

      {/* ── Section 1: About You ───────────────────────────────────── */}
      <SectionDivider label="About You" />

      <div style={styles.fieldGroup}>
        <FieldRow label="Display Name">
          <input
            type="text"
            value={profile.displayName}
            onChange={e => field('displayName')(e.target.value)}
            placeholder="Your name or handle"
            style={styles.input}
          />
        </FieldRow>
        <FieldRow label="Firm / Organization">
          <input
            type="text"
            value={profile.firmName}
            onChange={e => field('firmName')(e.target.value)}
            placeholder="Firm or organization"
            style={styles.input}
          />
        </FieldRow>
        <FieldRow label="Default Jurisdiction">
          <input
            type="text"
            value={profile.defaultJurisdiction}
            onChange={e => field('defaultJurisdiction')(e.target.value)}
            placeholder="e.g. California, EU, England & Wales"
            style={styles.input}
          />
        </FieldRow>
      </div>

      {/* ── Section 2: Default Settings ────────────────────────────── */}
      <SectionDivider label="Default Settings" />

      <div style={styles.fieldGroup}>
        <FieldRow label="Workflow">
          <select
            value={profile.defaultWorkflowId}
            onChange={e => field('defaultWorkflowId')(e.target.value)}
            style={styles.select}
          >
            {WORKFLOW_OPTIONS.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Intensity">
          <div style={styles.radioRow}>
            {INTENSITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => field('defaultIntensity')(opt.value)}
                style={{
                  ...styles.radioBtn,
                  ...(profile.defaultIntensity === opt.value ? styles.radioBtnActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FieldRow>

        <FieldRow label="Default Budget">
          <div style={styles.budgetRow}>
            <span style={styles.budgetPrefix}>$</span>
            <input
              type="number"
              min={1}
              max={200}
              value={profile.defaultBudgetUsd}
              onChange={e => field('defaultBudgetUsd')(Number(e.target.value) || 10)}
              style={{ ...styles.input, ...styles.budgetInput }}
            />
          </div>
        </FieldRow>

        <FieldRow label="YOLO Mode">
          <div style={styles.toggleRow}>
            <button
              onClick={() => field('yoloModeDefault')(!profile.yoloModeDefault)}
              style={{
                ...styles.toggle,
                backgroundColor: profile.yoloModeDefault ? colors.accent : colors.bgInput,
              }}
              role="switch"
              aria-checked={profile.yoloModeDefault}
            >
              <div
                style={{
                  ...styles.toggleThumb,
                  transform: profile.yoloModeDefault ? 'translateX(18px)' : 'translateX(0)',
                }}
              />
            </button>
            <span style={styles.toggleLabel}>
              Auto-approve all gates by default
            </span>
          </div>
        </FieldRow>
      </div>

      {/* ── Section 3: Custom Instructions ─────────────────────────── */}
      <SectionDivider label="Custom Instructions" />

      <div style={styles.fieldGroup}>
        <p style={styles.fieldHint}>
          Appended to every briefing memo. Tell your agents what matters to you.
        </p>
        <textarea
          value={profile.customInstructions}
          onChange={e => {
            const val = e.target.value.slice(0, MAX_INSTRUCTIONS);
            field('customInstructions')(val);
          }}
          placeholder="Always consider California privacy law. Prefer plain language. Flag any GDPR implications."
          rows={6}
          style={styles.textarea}
        />
        <span style={styles.charCount}>
          {profile.customInstructions.length} / {MAX_INSTRUCTIONS}
        </span>
      </div>

      {/* ── Section 4: Marble's Soul ──────────────────────────────── */}
      <SectionDivider label="Marble's Soul" />

      <div style={styles.fieldGroup}>
        <p style={styles.soulHeading}>
          What kind of firm is Marble for you?
        </p>
        <p style={styles.fieldHint}>
          This shapes how agents communicate, make decisions, and present their work.
        </p>
        <textarea
          value={profile.soul}
          onChange={e => {
            const val = e.target.value.slice(0, MAX_SOUL);
            field('soul')(val);
          }}
          placeholder={`Define Marble's personality for your engagements. For example:\n\nVoice: Precise but warm. Explain complex legal concepts without condescension.\nPrinciples: Always prioritize plain language. Flag GDPR implications proactively.\nStyle: Conservative on risk assessment, creative on document design.\nValues: Transparency over polish — show your work, admit uncertainty.`}
          rows={12}
          style={styles.textarea}
        />
        <span style={styles.charCount}>
          {profile.soul.length} / {MAX_SOUL}
        </span>
      </div>

      {/* ── Section 5: Saved Teams ─────────────────────────────────── */}
      <SectionDivider label="Saved Teams" />

      {hasSavedTeams ? (
        <div style={styles.teamList}>
          {profile.savedTeams.map(team => (
            <div key={team.id} style={styles.teamCard}>
              <div style={styles.teamInfo}>
                <span style={styles.teamName}>{team.name}</span>
                <span style={styles.teamDesc}>
                  {team.description || `${team.teamSize} agents`}
                </span>
                <span style={styles.teamMeta}>
                  {team.teamSize} agents {'\u00B7'} {team.roles.length} roles
                </span>
              </div>
              <div style={styles.teamActions}>
                <TeamActionButton
                  label="Use"
                  onClick={() => {
                    sessionStorage.setItem('shem-briefing-team', JSON.stringify(team.roles));
                    window.location.hash = '#/staffing';
                  }}
                />
                <TeamActionButton
                  label="Delete"
                  danger
                  onClick={() => deleteTeam(team.id)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={styles.emptyState}>
          No saved teams yet. Build a team in Staffing and save it from there.
        </p>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 80 }} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={styles.sectionHeader}>
      <div style={styles.sectionLine} />
      <span style={styles.sectionTitle}>{label}</span>
      <div style={styles.sectionLine} />
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.fieldRow}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function TeamActionButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.teamBtn,
        color: danger ? colors.danger : colors.text,
        backgroundColor: hovered
          ? (danger ? 'rgba(196,93,62,0.08)' : colors.bgInput)
          : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    fontFamily: fonts.sans,
    color: colors.text,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${spacing.xxxl}px ${spacing.xl}px`,
    boxSizing: 'border-box',
  },

  backLink: {
    alignSelf: 'flex-start',
    maxWidth: 640,
    width: 'auto',
    background: 'none',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    padding: '6px 14px',
    marginBottom: spacing.xl,
    marginLeft: 48,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: 36,
    fontWeight: 300,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.5,
    width: '100%',
    maxWidth: 640,
  },
  pageSub: {
    fontSize: 14,
    color: colors.textMuted,
    margin: `${spacing.sm}px 0 ${spacing.xxl}px`,
    width: '100%',
    maxWidth: 640,
    lineHeight: 1.6,
  },

  // Section divider — same pattern as SessionList / YoloLauncher
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 640,
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },

  // Field group
  fieldGroup: {
    width: '100%',
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },

  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },

  fieldHint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 1.5,
    margin: 0,
  },
  soulHeading: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.3,
  },

  // Input
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease',
  },

  // Select
  select: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    outline: 'none',
    boxSizing: 'border-box',
    appearance: 'auto' as const,
    transition: 'border-color 0.2s ease',
  },

  // Radio row
  radioRow: {
    display: 'flex',
    gap: spacing.sm,
  },
  radioBtn: {
    flex: 1,
    padding: '8px 0',
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    letterSpacing: 0.5,
  },
  radioBtnActive: {
    color: '#fff',
    backgroundColor: colors.text,
    borderColor: colors.text,
  },

  // Budget
  budgetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  budgetPrefix: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.textSecondary,
  },
  budgetInput: {
    width: 120,
  },

  // Toggle
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    padding: 2,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    transition: 'transform 0.2s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  toggleLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Textarea
  textarea: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    outline: 'none',
    resize: 'vertical' as const,
    lineHeight: 1.6,
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease',
  },
  charCount: {
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'right' as const,
  },

  // Saved teams
  teamList: {
    width: '100%',
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  teamCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.lg}px ${spacing.xl}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  teamInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  teamName: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
  },
  teamDesc: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  teamMeta: {
    fontSize: 11,
    color: colors.textDim,
  },
  teamActions: {
    display: 'flex',
    gap: spacing.sm,
  },
  teamBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: fonts.sans,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },

  emptyState: {
    width: '100%',
    maxWidth: 640,
    fontSize: 13,
    color: colors.textDim,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: `${spacing.xxl}px 0`,
  },
};
