/**
 * AgentBuilderHub — Entry landing for the Agent Builder.
 *
 * Three ways to create / reuse agents:
 *
 *   1. Build from scratch   → opens the 3-step wizard blank
 *   2. Clone yourself       → paste bio / upload CV → LLM generates a profile
 *                             that lands pre-filled in the wizard
 *   3. Import team          → pick a previously-saved team and jump straight
 *                             into a new engagement with that roster
 *
 * The hub replaces the old "wizard-only" entry so the page reads as a
 * set of options, not a forced linear flow.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { useUserProfile } from '../../my-page/hooks/useUserProfile.js';
import { CloneFromProfilePanel } from './CloneFromProfilePanel.js';

interface CloneData {
  displayName?: string;
  tagline?: string;
  category?: 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';
  seniority?: 'partner' | 'senior-associate' | 'associate' | 'junior' | 'specialist' | 'counsel';
  archetype?: string;
  workStyle?: string;
  practiceAreas?: string[];
  strengths?: string[];
  limitations?: string[];
  skills?: Record<string, number>;
  personality?: Record<string, number>;
}

interface Props {
  onBuildFromScratch: () => void;
  onCloneComplete: (data: CloneData) => void;
}

type HubMode = 'menu' | 'clone';

export function AgentBuilderHub({ onBuildFromScratch, onCloneComplete }: Props) {
  const [mode, setMode] = useState<HubMode>('menu');
  const { profile } = useUserProfile();
  const savedTeams = profile.savedTeams;

  const handleImportTeam = useCallback((roles: string[]) => {
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(roles));
    window.location.hash = '#/strategy';
  }, []);

  if (mode === 'clone') {
    return (
      <div style={styles.container}>
        <CloneFromProfilePanel
          onCancel={() => setMode('menu')}
          onComplete={onCloneComplete}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Start with an agent</div>
        <div style={styles.headerSub}>
          Build one from scratch, clone from a real person, or bring back a team you've used before.
        </div>
      </div>

      <div style={styles.cardGrid}>
        {/* ── Card 1: Build from scratch ──────────────────────── */}
        <HubCard
          accent="#b43c28"
          title="Build from scratch"
          description="The full 3-step builder. Identity, face, stats."
          ctaLabel="Open builder"
          onClick={onBuildFromScratch}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          }
        />

        {/* ── Card 2: Clone yourself ──────────────────────────── */}
        <HubCard
          accent="#2d6a8f"
          title="Clone yourself"
          description="Paste a bio, LinkedIn about section, or drop a CV. We'll build an agent that resembles you."
          ctaLabel="Generate from profile"
          onClick={() => setMode('clone')}
          badge="New"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M20 8v6" />
              <path d="M23 11h-6" />
            </svg>
          }
        />

        {/* ── Card 3: Import team ─────────────────────────────── */}
        <HubCard
          accent="#6b5a3f"
          title="Import a team"
          description={savedTeams.length > 0
            ? `${savedTeams.length} saved ${savedTeams.length === 1 ? 'team' : 'teams'}. Re-use a roster you've built before.`
            : 'No saved teams yet. Save a team from Staffing to see it here.'}
          ctaLabel={savedTeams.length > 0 ? 'Browse teams' : undefined}
          onClick={savedTeams.length > 0 ? undefined : undefined}
          disabled={savedTeams.length === 0}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        >
          {savedTeams.length > 0 && (
            <div style={styles.teamList}>
              {savedTeams.slice(0, 5).map(team => (
                <button
                  key={team.id}
                  onClick={() => handleImportTeam(team.roles)}
                  style={styles.teamRow}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(107, 90, 63, 0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div style={styles.teamRowLeft}>
                    <span style={styles.teamName}>{team.name}</span>
                    <span style={styles.teamMeta}>
                      {team.teamSize} {team.teamSize === 1 ? 'agent' : 'agents'}
                      {team.description ? ` \u00B7 ${team.description}` : ''}
                    </span>
                  </div>
                  <span style={styles.teamUse}>Use {'\u2192'}</span>
                </button>
              ))}
              {savedTeams.length > 5 && (
                <div style={styles.teamOverflow}>
                  +{savedTeams.length - 5} more in My Page
                </div>
              )}
            </div>
          )}
        </HubCard>
      </div>
    </div>
  );
}

// ── HubCard ──────────────────────────────────────────────────────────

interface HubCardProps {
  accent: string;
  title: string;
  description: string;
  ctaLabel?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

function HubCard({ accent, title, description, ctaLabel, onClick, icon, badge, disabled, children }: HubCardProps) {
  const clickable = !!onClick && !disabled;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
      style={{
        ...styles.card,
        cursor: clickable ? 'pointer' : 'default',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={e => {
        if (!clickable) return;
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={styles.cardHeader}>
        <div style={{ ...styles.cardIcon, color: accent, backgroundColor: `${accent}14` }}>
          {icon}
        </div>
        {badge && (
          <span style={{ ...styles.cardBadge, backgroundColor: accent, color: '#fff' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardDesc}>{description}</div>
      {children}
      {ctaLabel && (
        <div style={{ ...styles.cardCta, color: accent }}>
          {ctaLabel} {'\u2192'}
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '32px 32px 80px 32px',
    width: '100%',
    boxSizing: 'border-box',
  },
  header: {
    marginBottom: spacing.xxxl,
    textAlign: 'center',
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: 400,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  headerSub: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    maxWidth: 560,
    margin: '0 auto',
    lineHeight: 1.55,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.xl,
    alignItems: 'stretch',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bgPanel,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: '24px 24px 20px 24px',
    transition: 'border-color 0.18s ease, transform 0.18s ease',
    minHeight: 220,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadge: {
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 999,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: 500,
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.55,
    marginBottom: spacing.md,
    flex: 1,
  },
  cardCta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    marginTop: 'auto',
    paddingTop: spacing.sm,
  },
  teamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  teamRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: radii.sm,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s ease',
    width: '100%',
  },
  teamRowLeft: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  teamName: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 500,
    color: colors.text,
  },
  teamMeta: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginTop: 2,
  },
  teamUse: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    color: '#6b5a3f',
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  teamOverflow: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    padding: '6px 10px',
    fontStyle: 'italic',
  },
};
