/**
 * MyPageView — Persistent user profile, saved teams & custom instructions.
 *
 * Five sections:
 *   1. About You       — name, firm, jurisdiction
 *   2. Default Settings — workflow, intensity, budget, yolo toggle
 *   3. Custom Instructions — free-text appended to every briefing memo
 *   4. Lavern's Soul — personality, voice, principles that shape agent behavior
 *   5. Saved Teams     — reusable team presets
 *
 * Auto-saves on every change (debounced 500ms via React state → localStorage).
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { colors, fonts, spacing, radii } from '../staffing/styles/tokens.js';
import { useUserProfile } from './hooks/useUserProfile.js';
import { useBillingStatus } from './hooks/useBillingStatus.js';
import { useCustomAgents } from '../agent-builder/hooks/useCustomAgents.js';
import { UsageAnalytics } from '../billing/UsageAnalytics.js';
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
  const { status: billing, loading: billingLoading } = useBillingStatus();
  const { agents: customAgents, removeAgent } = useCustomAgents();
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      <h1 style={styles.pageTitle}>Lavern <span style={{ fontStyle: 'italic' }}>Profile</span></h1>
      <p style={styles.pageSub}>
        Your preferences persist across engagements. Everything saves automatically.
      </p>

      {/* ── Section 0: Balance & Plan ─────────────────────────────── */}
      {!billingLoading && billing && (
        <>
          <SectionDivider label="Balance & Plan" />
          <div style={styles.billingCard}>
            {/* Plan badge */}
            <div style={styles.billingRow}>
              <div style={styles.billingLabel}>Plan</div>
              <div style={{
                ...styles.planBadge,
                ...(billing.plan !== 'free' ? styles.planBadgePaid : {}),
              }}>
                {billing.planLabel}
              </div>
            </div>

            {/* Billable hours balance */}
            <div style={styles.billingHours}>
              <div style={styles.hoursValue}>
                {billing.billableHours.balance.toFixed(0)}
              </div>
              <div style={styles.hoursLabel}>billable hours remaining</div>
              <div style={styles.hoursUsd}>
                ≈ ${billing.billableHours.balanceUsd.toFixed(2)} credit
              </div>
            </div>

            {/* Monthly usage bar */}
            <div style={styles.billingRow}>
              <div style={styles.billingLabel}>This month</div>
              <div style={styles.billingValue}>
                {billing.usage.engagementCount} engagement{billing.usage.engagementCount !== 1 ? 's' : ''}
                {' · '}${billing.usage.totalCostUsd.toFixed(2)} / ${billing.monthlyCapUsd}
              </div>
            </div>
            <div style={styles.usageBar}>
              <div style={{
                ...styles.usageBarFill,
                width: `${Math.min(100, (billing.usage.totalCostUsd / billing.monthlyCapUsd) * 100)}%`,
              }} />
            </div>

            {/* Actions */}
            <div style={styles.billingActions}>
              <button
                onClick={() => { window.location.hash = '#/pricing'; }}
                style={styles.buyHoursBtn}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
              >
                Buy Hours
              </button>
              {billing.plan === 'free' && (
                <button
                  onClick={() => { window.location.hash = '#/pricing'; }}
                  style={styles.upgradePlanBtn}
                >
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Share Lavern (Referral) ──────────────────────────────── */}
      <SectionDivider label="Share Lavern" />
      <ReferralCard />

      {/* ── Usage Analytics ──────────────────────────────────────── */}
      <SectionDivider label="Usage" />
      <UsageAnalytics />

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

      {/* ── Security: Change Password ──────────────────────────────── */}
      <SectionDivider label="Security" />
      <ChangePasswordSection />

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
              onChange={e => field('defaultBudgetUsd')(Math.max(1, Math.min(200, Number(e.target.value) || 10)))}
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

      {/* ── Section 4: Lavern's Soul ──────────────────────────────── */}
      <div style={styles.soulContainer}>
        <div style={styles.soulInner}>
          {/* Decorative Lavern L watermark */}
          <div style={styles.soulWatermark} aria-hidden="true">L</div>

          <div style={styles.soulLabel}>Soul</div>
          <h2 style={styles.soulHeading}>
            What kind of firm<br />is Lavern <em>for you?</em>
          </h2>
          <p style={styles.soulSub}>
            Voice. Principles. Values. The character that shapes every decision your agents make.
          </p>

          <textarea
            value={profile.soul}
            onChange={e => {
              const val = e.target.value.slice(0, MAX_SOUL);
              field('soul')(val);
            }}
            placeholder={'Precise but warm. Explain complex legal concepts without condescension.\n\nAlways prioritize plain language. Show your work. Admit uncertainty.\n\nConservative on risk — creative on design.'}
            rows={10}
            style={styles.soulTextarea}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(196, 93, 62, 0.4)'; e.currentTarget.style.backgroundColor = 'rgba(250, 249, 246, 0.07)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(250, 249, 246, 0.1)'; e.currentTarget.style.backgroundColor = 'rgba(250, 249, 246, 0.05)'; }}
          />
          <span style={styles.soulCharCount}>
            {profile.soul.length} / {MAX_SOUL}
          </span>
        </div>
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

      {/* ── Section 6: Custom Agents ────────────────────────────────── */}
      <SectionDivider label="Custom Agents" />

      {customAgents.length > 0 ? (
        <div style={styles.agentList}>
          {customAgents.map(agent => {
            const p = agent.profile;
            const avatarSeed = p.avatarSeed || p.displayName;
            const avatarSrc = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=transparent&size=48${p.avatarExtra ? '&' + p.avatarExtra : ''}`;
            const isDeleting = deletingId === agent.id;
            const archetype = p.personality?.archetype || p.category;
            return (
              <div key={agent.id} style={styles.agentCard}>
                <div style={styles.agentLeft}>
                  {/* Avatar */}
                  <div style={styles.agentAvatar}>
                    <img
                      src={avatarSrc}
                      alt={p.displayName}
                      width={44}
                      height={44}
                      style={{ display: 'block', borderRadius: '50%' }}
                    />
                  </div>

                  {/* Info */}
                  <div style={styles.agentInfo}>
                    <span style={styles.agentName}>{p.displayName}</span>
                    <span style={styles.agentTagline}>
                      {archetype} {'\u00B7'} {p.category}
                    </span>
                    <span style={styles.agentMeta}>
                      Created {new Date(agent.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div style={styles.agentActions}>
                  <TeamActionButton
                    label="Edit"
                    onClick={() => {
                      window.location.hash = `#/agent-builder?edit=${agent.id}`;
                    }}
                  />
                  {isDeleting ? (
                    <div style={styles.deleteConfirm}>
                      <span style={{ fontSize: 11, color: colors.danger, fontFamily: fonts.sans }}>
                        Delete?
                      </span>
                      <TeamActionButton
                        label="Yes"
                        danger
                        onClick={() => {
                          removeAgent(agent.id);
                          setDeletingId(null);
                        }}
                      />
                      <TeamActionButton
                        label="No"
                        onClick={() => setDeletingId(null)}
                      />
                    </div>
                  ) : (
                    <TeamActionButton
                      label="Delete"
                      danger
                      onClick={() => setDeletingId(agent.id)}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Build new agent link */}
          <button
            onClick={() => { window.location.hash = '#/agent-builder'; }}
            style={styles.buildAgentLink}
            onMouseEnter={e => { e.currentTarget.style.borderColor = colors.text; e.currentTarget.style.color = colors.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textMuted; }}
          >
            + Build New Agent
          </button>
        </div>
      ) : (
        <div style={styles.agentEmptyState}>
          <p style={styles.emptyState}>
            No custom agents yet.
          </p>
          <button
            onClick={() => { window.location.hash = '#/agent-builder'; }}
            style={styles.buildAgentBtn}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
          >
            Build Your First Agent
          </button>
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 80 }} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

// ── Referral Card ────────────────────────────────────────────────────

function ReferralCard() {
  const [data, setData] = useState<{ shareUrl: string; referralCount: number; hoursEarned: number; hoursPerReferral: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/referral', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Cleanup copy timer on unmount
  useEffect(() => () => { clearTimeout(copyTimerRef.current); }, []);

  if (!data) return null;

  return (
    <div style={styles.billingCard}>
      <p style={{ margin: 0, fontSize: 14, color: colors.textMuted, lineHeight: 1.6 }}>
        Give <strong style={{ color: colors.text }}>{data.hoursPerReferral}h</strong>, get{' '}
        <strong style={{ color: colors.text }}>{data.hoursPerReferral}h</strong>.
        Share your link — both of you earn hours.
      </p>
      <div style={{
        display: 'flex', gap: spacing.sm, marginTop: spacing.lg, alignItems: 'center',
      }}>
        <input
          type="text"
          readOnly
          value={data.shareUrl}
          style={{ ...styles.input, flex: 1, fontSize: 12, fontFamily: 'monospace' }}
          onFocus={e => e.target.select()}
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(data.shareUrl).then(() => {
              setCopied(true);
              clearTimeout(copyTimerRef.current);
              copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
            });
          }}
          style={{
            ...styles.buyHoursBtn,
            whiteSpace: 'nowrap' as const,
            minWidth: 80,
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {data.referralCount > 0 && (
        <p style={{ margin: `${spacing.md}px 0 0`, fontSize: 13, color: colors.textMuted }}>
          {data.referralCount} referral{data.referralCount !== 1 ? 's' : ''} · {data.hoursEarned.toFixed(0)}h earned
        </p>
      )}
    </div>
  );
}

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

function ChangePasswordSection() {
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit = current.length > 0 && newPwd.length >= 8 && newPwd === confirm && status !== 'saving';
  const mismatch = confirm.length > 0 && newPwd !== confirm;
  const tooShort = newPwd.length > 0 && newPwd.length < 8;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setStatus('saving');
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      });

      if (res.ok) {
        setStatus('success');
        setCurrent('');
        setNewPwd('');
        setConfirm('');
        // Collapse after brief success feedback
        setTimeout(() => { setExpanded(false); setStatus('idle'); }, 2000);
      } else {
        const data = await res.json().catch(() => ({ error: 'Something went wrong.' }));
        setErrorMsg((data as { error?: string }).error || 'Failed to change password.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Unable to reach the server.');
      setStatus('error');
    }
  }, [canSubmit, current, newPwd]);

  if (!expanded) {
    return (
      <div style={styles.fieldGroup}>
        <button
          onClick={() => setExpanded(true)}
          style={{
            ...styles.input,
            cursor: 'pointer',
            color: colors.textSecondary,
            textAlign: 'left',
            border: `1px solid ${colors.border}`,
          }}
        >
          Change password...
        </button>
      </div>
    );
  }

  return (
    <div style={styles.fieldGroup}>
      <FieldRow label="Current Password">
        <input
          type="password"
          value={current}
          onChange={e => setCurrent(e.target.value)}
          autoComplete="current-password"
          style={styles.input}
          placeholder="Enter current password"
        />
      </FieldRow>
      <FieldRow label="New Password">
        <input
          type="password"
          value={newPwd}
          onChange={e => setNewPwd(e.target.value)}
          autoComplete="new-password"
          style={styles.input}
          placeholder="Min 8 characters"
        />
      </FieldRow>
      {tooShort && (
        <div style={{ fontSize: 11, color: colors.danger, paddingLeft: spacing.lg, marginTop: -4 }}>
          Password must be at least 8 characters.
        </div>
      )}
      <FieldRow label="Confirm Password">
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password"
          style={styles.input}
          placeholder="Repeat new password"
        />
      </FieldRow>
      {mismatch && (
        <div style={{ fontSize: 11, color: colors.danger, paddingLeft: spacing.lg, marginTop: -4 }}>
          Passwords do not match.
        </div>
      )}
      {errorMsg && (
        <div style={{ fontSize: 11, color: colors.danger, paddingLeft: spacing.lg }} role="alert">
          {errorMsg}
        </div>
      )}
      {status === 'success' && (
        <div style={{ fontSize: 11, color: colors.success, paddingLeft: spacing.lg }} role="status">
          Password changed. Other sessions have been logged out.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, paddingLeft: spacing.lg, marginTop: 4 }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: '6px 16px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: fonts.sans,
            letterSpacing: 0.5,
            textTransform: 'uppercase' as const,
            color: canSubmit ? '#fff' : colors.textDim,
            backgroundColor: canSubmit ? colors.text : colors.bgInput,
            border: 'none',
            borderRadius: radii.sm,
            cursor: canSubmit ? 'pointer' : 'default',
            opacity: status === 'saving' ? 0.6 : 1,
          }}
        >
          {status === 'saving' ? 'Saving...' : 'Change Password'}
        </button>
        <button
          onClick={() => { setExpanded(false); setCurrent(''); setNewPwd(''); setConfirm(''); setStatus('idle'); setErrorMsg(''); }}
          style={{
            padding: '6px 16px',
            fontSize: 11,
            fontFamily: fonts.sans,
            color: colors.textMuted,
            backgroundColor: 'transparent',
            border: `1px solid ${colors.border}`,
            borderRadius: radii.sm,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
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
  // ── Soul — dark inverted container ──────────────────────────────
  soulContainer: {
    width: '100%',
    maxWidth: 740,
    marginTop: spacing.xxl + 8,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    background: 'linear-gradient(145deg, #1A1A1A 0%, #2A2826 50%, #1A1A1A 100%)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255,255,255,0.03)',
  },
  soulInner: {
    position: 'relative' as const,
    zIndex: 1,
    padding: '48px 48px 36px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
  },
  soulWatermark: {
    position: 'absolute' as const,
    top: -20,
    right: 30,
    fontFamily: fonts.serif,
    fontSize: 200,
    fontWeight: 300,
    color: 'rgba(250, 249, 246, 0.03)',
    lineHeight: 1,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
  soulLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: 'rgba(196, 93, 62, 0.7)',
    marginBottom: 16,
  },
  soulHeading: {
    fontSize: 26,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: 'rgba(250, 249, 246, 0.9)',
    margin: 0,
    letterSpacing: -0.3,
    lineHeight: 1.3,
  },
  soulSub: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.4)',
    margin: '12px 0 28px',
    lineHeight: 1.5,
    maxWidth: 400,
  },
  soulTextarea: {
    width: '100%',
    padding: '16px 20px',
    fontSize: 15,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: 'rgba(250, 249, 246, 0.85)',
    backgroundColor: 'rgba(250, 249, 246, 0.05)',
    border: '1px solid rgba(250, 249, 246, 0.1)',
    borderRadius: radii.sm,
    resize: 'vertical' as const,
    lineHeight: 1.7,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.3s ease, background-color 0.3s ease',
    textAlign: 'left' as const,
  },
  soulCharCount: {
    fontSize: 10,
    color: 'rgba(250, 249, 246, 0.2)',
    textAlign: 'right' as const,
    width: '100%',
    marginTop: 8,
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

  // Custom agents
  agentList: {
    width: '100%',
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  agentCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    transition: 'border-color 0.15s ease',
  },
  agentLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  agentAvatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    overflow: 'hidden',
    border: `2px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  agentInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  agentName: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  agentTagline: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
  },
  agentMeta: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  agentActions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteConfirm: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  buildAgentLink: {
    width: '100%',
    padding: `${spacing.md}px`,
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    backgroundColor: 'transparent',
    border: `1.5px dashed ${colors.border}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'border-color 0.2s ease, color 0.2s ease',
  },
  agentEmptyState: {
    width: '100%',
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
  },
  buildAgentBtn: {
    padding: '10px 24px',
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    letterSpacing: 0.5,
    transition: 'background-color 0.2s ease, color 0.2s ease',
  },

  // ── Billing section ──────────────────────────────────────────────
  billingCard: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: `${spacing.xl}px ${spacing.xxl}px`,
    marginBottom: spacing.xl,
  },
  billingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  billingLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  billingValue: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textSecondary,
  },
  planBadge: {
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    backgroundColor: colors.bgPanel,
    padding: '3px 10px',
    borderRadius: radii.sm,
  },
  planBadgePaid: {
    color: '#fff',
    backgroundColor: colors.text,
  },
  billingHours: {
    textAlign: 'center' as const,
    padding: `${spacing.xl}px 0`,
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    margin: `${spacing.md}px 0 ${spacing.lg}px`,
  },
  hoursValue: {
    fontFamily: fonts.serif,
    fontSize: 56,
    fontWeight: 300,
    color: colors.text,
    letterSpacing: -2,
    lineHeight: 1,
    marginBottom: spacing.xs,
  },
  hoursLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  hoursUsd: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textDim,
    marginTop: spacing.xs,
  },
  usageBar: {
    width: '100%',
    height: 4,
    backgroundColor: colors.bgPanel,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
    transition: 'width 0.5s ease',
  },
  billingActions: {
    display: 'flex',
    gap: spacing.md,
    justifyContent: 'center',
  },
  buyHoursBtn: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.text,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.text}`,
    borderRadius: radii.sm,
    padding: '8px 20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  upgradePlanBtn: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.accent,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.accent}`,
    borderRadius: radii.sm,
    padding: '8px 20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};
