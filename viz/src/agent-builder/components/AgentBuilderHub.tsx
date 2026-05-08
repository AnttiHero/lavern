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
import { useCustomAgents } from '../hooks/useCustomAgents.js';
import { CloneFromProfilePanel } from './CloneFromProfilePanel.js';
import { CloneFromFirmPanel } from './CloneFromFirmPanel.js';
import { ShareAgentModal } from './ShareAgentModal.js';
import { ImportAgentModal } from './ImportAgentModal.js';
import { GOBLIN_PROFILE, GOBLIN_AVATAR_URL } from '../data/goblinProfile.js';
import { JUDE_CLAW_PROFILE } from '../data/judeClawProfile.js';
import type { CustomAgent } from '../hooks/useCustomAgents.js';
import type { AgentProfile } from '../../types/agent-profile.js';

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
  /** Called with the N firm-cloned profiles the user wants saved to their roster. */
  onFirmCloneComplete: (profiles: AgentProfile[], firmName: string) => void;
}

type HubMode = 'menu' | 'clone' | 'clone-firm';

export function AgentBuilderHub({ onBuildFromScratch, onCloneComplete, onFirmCloneComplete }: Props) {
  const [mode, setMode] = useState<HubMode>('menu');
  const { profile } = useUserProfile();
  const savedTeams = profile.savedTeams;
  const { agents: customAgents, addAgent, removeAgent, setShareToken, clearShareToken } = useCustomAgents();
  const [goblinSummoned, setGoblinSummoned] = useState(false);
  const [sharingAgent, setSharingAgent] = useState<CustomAgent | null>(null);
  const [showImport, setShowImport] = useState(false);

  const handleRemoveAgent = useCallback((id: string, name: string) => {
    if (confirm(`Remove ${name}?`)) {
      removeAgent(id);
    }
  }, [removeAgent]);

  const handleSummonGoblin = useCallback(() => {
    addAgent(GOBLIN_PROFILE, { kind: 'goblin' });
    setGoblinSummoned(true);
    // Reset the "summoned" pulse after the animation
    setTimeout(() => setGoblinSummoned(false), 2000);
  }, [addAgent]);

  const [judeHired, setJudeHired] = useState(false);
  const handleHireJudeClaw = useCallback(() => {
    addAgent(JUDE_CLAW_PROFILE, { kind: 'scratch' });
    setJudeHired(true);
    setTimeout(() => setJudeHired(false), 2000);
  }, [addAgent]);

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

  if (mode === 'clone-firm') {
    return (
      <div style={styles.container}>
        <CloneFromFirmPanel
          onCancel={() => setMode('menu')}
          onComplete={onFirmCloneComplete}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes goblin-summoned {
          0%   { transform: scale(1) rotate(0deg); }
          25%  { transform: scale(1.25) rotate(-8deg); }
          50%  { transform: scale(1.15) rotate(6deg); }
          75%  { transform: scale(1.18) rotate(-4deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
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

        {/* ── Card 3: Clone a firm ────────────────────────────── */}
        <HubCard
          accent="#B47A3A"
          title="Clone a firm"
          description="Paste a firm's public homepage. We'll read it and mint a team grounded in what we find."
          ctaLabel="Start from a URL"
          onClick={() => setMode('clone-firm')}
          badge="New"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          }
        />

        {/* ── Card 4: Import team ─────────────────────────────── */}
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

      {/* ── Your roster — list + delete custom agents ──────────────── */}
      {customAgents.length > 0 && (
        <div style={styles.roster}>
          <div style={styles.rosterHeader}>
            <div style={styles.rosterTitle}>Your roster</div>
            <div style={styles.rosterCount}>
              {customAgents.length} agent{customAgents.length === 1 ? '' : 's'} · {Math.min(customAgents.length, 20)}/20
            </div>
          </div>
          <div style={styles.rosterGrid}>
            {customAgents.map((agent) => {
              const { id, profile: a } = agent;
              const isGoblin = a.avatarSeed === 'goblin';
              const dicebearExtra = a.avatarExtra ? `&${a.avatarExtra}` : '';
              const avatar = isGoblin
                ? GOBLIN_AVATAR_URL
                : `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(a.avatarSeed || a.displayName)}&backgroundColor=transparent${dicebearExtra}`;
              return (
                <div key={id} style={styles.rosterCard}>
                  <img src={avatar} alt="" width={48} height={48} style={styles.rosterAvatar} />
                  <div style={styles.rosterBody}>
                    <div style={styles.rosterName}>{a.displayName}</div>
                    <div style={styles.rosterArchetype}>{a.personality?.archetype}</div>
                    <div style={styles.rosterMeta}>
                      {a.seniority} · ${a.billingRateUsd?.toLocaleString() ?? '—'}/hr
                    </div>
                  </div>
                  <div style={styles.rosterCardActions}>
                    <button
                      type="button"
                      onClick={() => setSharingAgent(agent)}
                      style={styles.rosterShare}
                      title="Share this agent"
                      aria-label={`Share ${a.displayName}`}
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveAgent(id, a.displayName)}
                      style={styles.rosterRemove}
                      title="Remove this agent"
                      aria-label={`Remove ${a.displayName}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Import an agent (paste URL or drop JSON) ────────────────── */}
      <div style={styles.importStrip}>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          style={styles.importBtn}
        >
          Import an agent →
        </button>
        <span style={styles.importHint}>
          Paste a Lavern share URL or drop a JSON file from a colleague.
        </span>
      </div>

      {/* Share modal — appears over the hub */}
      {sharingAgent && (
        <ShareAgentModal
          agent={sharingAgent}
          onClose={() => setSharingAgent(null)}
          onShared={(token) => {
            setShareToken(sharingAgent.id, token);
            // Update local view to reflect the new token
            setSharingAgent(prev => prev ? { ...prev, shareToken: token } : prev);
          }}
          onRevoked={() => {
            clearShareToken(sharingAgent.id);
            setSharingAgent(prev => prev ? { ...prev, shareToken: undefined } : prev);
          }}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportAgentModal
          onClose={() => setShowImport(false)}
          onImported={(profile, provenance) => {
            addAgent(profile, provenance);
            setShowImport(false);
          }}
        />
      )}

      {/* Easter egg: summon the goblin. Tiny emoji bottom-right.
          A nod to OpenAI's "Where the goblins came from" — the Nerdy
          personality reward leaked everywhere. We are not limited to
          corporate-counsel personas. */}
      <button
        type="button"
        onClick={handleSummonGoblin}
        style={{
          ...styles.goblinButton,
          animation: goblinSummoned ? 'goblin-summoned 700ms ease-out' : 'none',
        }}
        title="Summon the goblin"
        aria-label="Summon the goblin"
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}
      >
        🧌
      </button>

      {/* Easter egg companion: hire Jude Claw. He has nothing to offer
          except a symmetrical face. The premium rate is the joke. */}
      <button
        type="button"
        onClick={handleHireJudeClaw}
        style={{
          ...styles.goblinButton,
          right: 56,
          animation: judeHired ? 'goblin-summoned 700ms ease-out' : 'none',
        }}
        title="Hire Jude Claw"
        aria-label="Hire Jude Claw"
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}
      >
        🗿
      </button>
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
  // Easter-egg goblin button — small emoji in the bottom-right corner.
  goblinButton: {
    position: 'fixed',
    bottom: 18,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: 22,
    lineHeight: 1,
    padding: 0,
    transition: 'opacity 200ms ease',
    opacity: 0.4,
    zIndex: 50,
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
  // ── Your-roster section ──────────────────────────────────────────────
  roster: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  rosterHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rosterTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: 500,
    color: colors.text,
    letterSpacing: 0.2,
  },
  rosterCount: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rosterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 10,
  },
  rosterCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    position: 'relative',
  },
  rosterAvatar: {
    borderRadius: '50%',
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  rosterBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
    flex: 1,
  },
  rosterName: {
    fontFamily: fonts.serif,
    fontSize: 14,
    fontWeight: 500,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rosterArchetype: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 600,
  },
  rosterMeta: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.textDim,
    marginTop: 2,
  },
  rosterCardActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rosterShare: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    padding: 0,
  },
  rosterRemove: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontSize: 18,
    fontFamily: fonts.sans,
    fontWeight: 400,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    padding: 0,
    transition: 'all 150ms ease',
  },
  importStrip: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  importBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    padding: '10px 18px',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: 500,
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: fonts.sans,
  },
  importHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
};
