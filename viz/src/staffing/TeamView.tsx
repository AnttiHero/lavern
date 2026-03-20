/**
 * TeamView — "Choose Your Team" page.
 *
 * Browse agents, filter by category/seniority/specialty, build your team.
 * TeamBench fixed at bottom shows selected agents and confirm button.
 *
 * Flow: #/strategy → #/team → #/working
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useAgentProfiles } from './hooks/useAgentProfiles.js';
import { useTeamPresets } from './hooks/useTeamPresets.js';
import { useTeamSelection } from './hooks/useTeamSelection.js';
import { useSoundEffects } from './hooks/useSoundEffects.js';
import { useEngagementConfig } from './hooks/useEngagementConfig.js';
import { PresetSelector } from './components/PresetSelector.js';
import { SectionHeader } from './components/SectionHeader.js';
import { FlippableCard } from './components/FlippableCard.js';
import { FilterBar } from './components/FilterBar.js';
import type { SubGroupFilter } from './components/FilterBar.js';
import { TeamBench } from './components/TeamBench.js';
import { TeamCostSummary } from './components/TeamCostSummary.js';
import { staggerContainer } from './styles/animations.js';
import { colors, fonts, spacing, radii } from './styles/tokens.js';
import { useUserProfile } from '../my-page/hooks/useUserProfile.js';
import { useCustomAgents } from '../agent-builder/hooks/useCustomAgents.js';
import type { AgentProfile } from './hooks/useAgentProfiles.js';

// ── Specialist sub-group mapping ─────────────────────────────────────────

const SPECIALIST_SUBGROUP: Record<string, string> = {
  'service-designer': 'design',
  'plain-language-specialist': 'design',
  'client-proxy': 'research',
  'accessibility-specialist': 'research',
  'user-researcher': 'research',
  'behavioral-scientist': 'research',
  'ethics-auditor': 'ethics',
  'legal-engineer': 'tech',
  'cybersecurity-advisor': 'tech',
  'ai-ethics-specialist': 'tech',
  'fintech-specialist': 'industry',
  'healthcare-specialist': 'industry',
  'media-specialist': 'industry',
  'energy-specialist': 'industry',
};

// ── Seniority → sub-group key mapping ────────────────────────────────────

const SENIORITY_SUBGROUP: Record<string, string> = {
  partner: 'partners',
  'senior-associate': 'senior-associates',
  associate: 'associates',
  junior: 'juniors',
};

/** Derive sub-group key for any profile. */
function getSubGroup(p: AgentProfile): string {
  if (p.category === 'orchestrator') return 'orchestrators';
  if (p.category === 'lawyer') return SENIORITY_SUBGROUP[p.seniority] ?? 'juniors';
  if (p.category === 'specialist') return SPECIALIST_SUBGROUP[p.role] ?? 'legacy';
  return 'infrastructure';
}

// ── Visual section definitions ───────────────────────────────────────────

interface SectionDef {
  id: string;
  title: string;
  subtitle: string;
  filter: (p: AgentProfile) => boolean;
  accentColor?: string;
}

const SECTION_DEFS: SectionDef[] = [
  {
    id: 'partners',
    title: 'Partners',
    subtitle: 'Strategic leadership and firm orchestration',
    filter: p => p.category === 'lawyer' && p.seniority === 'partner',
  },
  {
    id: 'senior-associates',
    title: 'Senior Associates',
    subtitle: 'Deep expertise across practice areas',
    filter: p => p.category === 'lawyer' && p.seniority === 'senior-associate',
  },
  {
    id: 'associates',
    title: 'Associates',
    subtitle: 'Core delivery and specialist practice',
    filter: p => p.category === 'lawyer' && p.seniority === 'associate',
  },
  {
    id: 'juniors',
    title: 'Juniors & Support',
    subtitle: 'Research, drafting, and operational support',
    filter: p => p.category === 'lawyer' && p.seniority === 'junior',
  },
  {
    id: 'design',
    title: 'Design & Communication',
    subtitle: 'Legal design, plain language, and user experience',
    filter: p => p.category === 'specialist' && SPECIALIST_SUBGROUP[p.role] === 'design',
  },
  {
    id: 'research',
    title: 'User Research & Testing',
    subtitle: 'Client insights, accessibility, and behavioral science',
    filter: p => p.category === 'specialist' && SPECIALIST_SUBGROUP[p.role] === 'research',
  },
  {
    id: 'ethics',
    title: 'Ethics & Governance',
    subtitle: 'Compliance, DEI, and sustainability',
    filter: p => p.category === 'specialist' && SPECIALIST_SUBGROUP[p.role] === 'ethics',
  },
  {
    id: 'tech',
    title: 'Technology & Data',
    subtitle: 'Engineering, analytics, and cybersecurity',
    filter: p => p.category === 'specialist' && SPECIALIST_SUBGROUP[p.role] === 'tech',
  },
  {
    id: 'industry',
    title: 'Industry Specialists',
    subtitle: 'Fintech, healthcare, media, and energy',
    filter: p => p.category === 'specialist' && SPECIALIST_SUBGROUP[p.role] === 'industry',
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    subtitle: 'Quality assurance, risk pricing, and testing',
    filter: p => p.category === 'infrastructure',
  },
  {
    id: 'legacy',
    title: 'Legacy Agents',
    subtitle: 'Specialized workflow agents',
    filter: p => p.category === 'specialist' && !SPECIALIST_SUBGROUP[p.role],
  },
];

/** Sections collapsed by default — less commonly needed categories. */
const DEFAULT_COLLAPSED_IDS = new Set(['infrastructure', 'legacy', 'industry', 'tech']);

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  onTeamConfirmed: (roles: string[]) => void;
  onBack: () => void;
  onSkip?: () => void;
}

export default function TeamView({ onTeamConfirmed, onBack, onSkip }: Props) {
  const matterId = sessionStorage.getItem('shem-matter-id') ?? undefined;

  // ── Data hooks ──────────────────────────────────────────────────────────

  const {
    profiles, allProfiles, loading, error, isOffline, summary,
    category, setCategory,
    sort, setSort,
    search, setSearch,
  } = useAgentProfiles();

  const { presets } = useTeamPresets();
  const { play } = useSoundEffects();
  const { agents: customAgents } = useCustomAgents();

  // Merge custom agents into the full profile list so useTeamSelection can
  // look them up by role when computing selectedProfiles + totalCost.
  const mergedProfiles = useMemo(() => {
    const customProfiles = customAgents.map(ca => ({
      ...ca.profile as AgentProfile,
      role: ca.id, // custom agent ID is used as its role key
    }));
    return [...allProfiles, ...customProfiles];
  }, [allProfiles, customAgents]);

  const {
    selectedRoles, activePreset, toggleAgent, applyPreset, clearSelection, setRoles,
    totalCost, teamSize, selectedProfiles, confirming,
    confirmTeam, isSelected, wasPresetRecentlyApplied,
    atCapFlash, maxTeamSize,
  } = useTeamSelection(mergedProfiles, presets);

  const {
    config: engagementConfig,
    recommendedRoles, loading: recommendationLoading,
  } = useEngagementConfig();

  // ── Apply preset from Strategy page (one-time on mount) ─────────────────

  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current) return;
    const presetId = sessionStorage.getItem('shem-strategy-preset');
    if (presetId) {
      presetApplied.current = true;
      sessionStorage.removeItem('shem-strategy-preset');
      applyPreset(presetId);
    }
  }, [applyPreset]);

  // ── Apply recommended roles on config change ───────────────────────────

  const lastAppliedConfigRef = useRef({ intensity: '', workflow: '' });
  useEffect(() => {
    if (recommendedRoles.length > 0) {
      if (wasPresetRecentlyApplied()) return;
      const currentKey = `${engagementConfig.intensity}-${engagementConfig.workflowId}`;
      const lastKey = `${lastAppliedConfigRef.current.intensity}-${lastAppliedConfigRef.current.workflow}`;
      if (currentKey !== lastKey) {
        lastAppliedConfigRef.current = {
          intensity: engagementConfig.intensity,
          workflow: engagementConfig.workflowId,
        };
        setRoles(recommendedRoles);
      }
    }
  }, [recommendedRoles, engagementConfig.intensity, engagementConfig.workflowId, setRoles, wasPresetRecentlyApplied]);

  // ── Collapsible sections ───────────────────────────────────────────────

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED_IDS));

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  // ── Sub-group filter state ─────────────────────────────────────────────

  const [subGroup, setSubGroup] = useState<SubGroupFilter>('all');

  const subGroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of profiles) {
      const sg = getSubGroup(p);
      counts[sg] = (counts[sg] ?? 0) + 1;
    }
    return counts;
  }, [profiles]);

  const displayProfiles = useMemo(() => {
    if (subGroup === 'all') return profiles;
    return profiles.filter(p => getSubGroup(p) === subGroup);
  }, [profiles, subGroup]);

  // ── Group into sections ─────────────────────────────────────────────────

  const sections = useMemo(() => {
    return SECTION_DEFS
      .map(def => ({
        ...def,
        profiles: displayProfiles.filter(def.filter),
      }))
      .filter(s => s.profiles.length > 0);
  }, [displayProfiles]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    play('confirm');
    const success = await confirmTeam(matterId);
    if (success && onTeamConfirmed) {
      sessionStorage.setItem('shem-briefing-team', JSON.stringify(Array.from(selectedRoles)));
      sessionStorage.setItem('shem-briefing-config', JSON.stringify(engagementConfig));
      setTimeout(() => {
        onTeamConfirmed(Array.from(selectedRoles));
      }, 1200);
    }
  }, [play, confirmTeam, matterId, onTeamConfirmed, selectedRoles, engagementConfig]);

  const handleToggle = useCallback((role: string) => {
    play(isSelected(role) ? 'deselect' : 'select');
    toggleAgent(role);
  }, [play, isSelected, toggleAgent]);

  const handlePresetSelect = useCallback((presetId: string) => {
    play('preset');
    applyPreset(presetId);
  }, [play, applyPreset]);

  // ── Save team to profile ───────────────────────────────────────────────

  const { saveTeam } = useUserProfile();
  const [saveTeamName, setSaveTeamName] = useState('');
  const [showSaveTeamInput, setShowSaveTeamInput] = useState(false);
  const [teamSaved, setTeamSaved] = useState(false);

  const handleSaveTeam = useCallback(() => {
    const name = saveTeamName.trim();
    if (!name || teamSize === 0) return;
    try {
      saveTeam({
        name,
        description: `${teamSize} agents \u00B7 ${engagementConfig.workflowId}`,
        roles: Array.from(selectedRoles),
        teamSize,
      });
      setSaveTeamName('');
      setShowSaveTeamInput(false);
      setTeamSaved(true);
      setTimeout(() => setTeamSaved(false), 2000);
    } catch (err) {
      console.error('[TeamView] Failed to save team:', err);
      // Leave the input open so user can retry
    }
  }, [saveTeamName, teamSize, selectedRoles, engagementConfig.workflowId, saveTeam]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            onClick={onBack}
            style={styles.backButton}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            {'\u2190'} Strategy
          </button>
          <h1 style={styles.title}>Lavern <span style={{ fontStyle: 'italic' }}>Team</span></h1>
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={teamSize === 0}
              style={{
                ...styles.skipButton,
                opacity: teamSize === 0 ? 0.35 : 1,
                cursor: teamSize === 0 ? 'default' : 'pointer',
              }}
              onMouseEnter={e => { if (teamSize === 0) return; const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { if (teamSize === 0) return; const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >
              Skip {'\u2192'}
            </button>
          )}
        </div>
        {recommendationLoading && (
          <span style={styles.loadingHint}>{'\u2022'} loading recommendations...</span>
        )}
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div style={styles.offlineBanner}>
          {'\u26A0'} Offline {'\u2014'} showing demo agents. Connect to the API for your full roster.
        </div>
      )}

      {/* Team cost comparison */}
      <TeamCostSummary
        selectedProfiles={selectedProfiles}
        totalCost={totalCost}
        teamSize={teamSize}
      />

      {/* Presets — quick team builder */}
      {presets.length > 0 && (
        <div style={styles.presetsSection}>
          <span style={styles.presetsLabel}>Quick presets</span>
          <PresetSelector
            presets={presets}
            activePreset={activePreset}
            onSelect={handlePresetSelect}
          />
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        category={category}
        onCategoryChange={setCategory}
        subGroup={subGroup}
        onSubGroupChange={setSubGroup}
        sort={sort}
        onSortChange={setSort}
        search={search}
        onSearchChange={setSearch}
        summary={summary}
        subGroupCounts={subGroupCounts}
      />

      {/* Loading / Error */}
      {loading && (
        <div style={styles.loadingMessage}>Loading agent profiles...</div>
      )}
      {error && (
        <div style={styles.errorMessage}>
          Failed to load profiles: {error}
        </div>
      )}

      {/* Your Custom Agents */}
      {!loading && customAgents.length > 0 && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <SectionHeader
              title="Your Custom Agents"
              subtitle="Built in the Agent Builder"
              count={customAgents.length}
              accentColor={colors.accent}
            />
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: spacing.xl,
              padding: `${spacing.lg}px 0`,
            }}
          >
            {customAgents.map(ca => (
              <FlippableCard
                key={ca.id}
                profile={{ ...ca.profile as AgentProfile, role: ca.id }}
                selected={isSelected(ca.id)}
                onToggle={handleToggle}
              />
            ))}
          </motion.div>
        </div>
      )}

      {/* + Build Agent button */}
      {!loading && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: spacing.xl,
        }}>
          <button
            onClick={() => { window.location.hash = '#/agent-builder'; }}
            style={{
              padding: '10px 24px',
              fontSize: 12,
              fontFamily: fonts.sans,
              fontWeight: 600,
              color: colors.textSecondary,
              backgroundColor: colors.bgPanel,
              border: `1.5px dashed ${colors.border}`,
              borderRadius: radii.md,
              cursor: 'pointer',
              letterSpacing: 0.5,
              transition: 'all 0.2s ease',
            }}
          >
            + Build Custom Agent
          </button>
        </div>
      )}

      {/* Recommended team banner */}
      {!loading && recommendedRoles.length > 0 && teamSize > 0 && (
        <div style={styles.recommendedBanner}>
          <span style={styles.recommendedLabel}>Recommended for your engagement</span>
          <span style={styles.recommendedDetail}>
            {teamSize} agents auto-selected based on your briefing and strategy.
            Adjust below or proceed with this team.
          </span>
        </div>
      )}

      {/* Agent card grid */}
      {!loading && sections.map(section => {
        const isCollapsed = collapsedSections.has(section.id);
        const sectionSelectedCount = section.profiles.filter(p => isSelected(p.role)).length;

        return (
          <div key={section.id}>
            <SectionHeader
              title={section.title}
              subtitle={section.subtitle}
              count={section.profiles.length}
              accentColor={section.accentColor}
              collapsed={isCollapsed}
              onToggleCollapse={() => toggleSection(section.id)}
              selectedCount={sectionSelectedCount}
            />
            {!isCollapsed && (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: spacing.xl,
                  padding: `${spacing.lg}px 0`,
                }}
              >
                {section.profiles.map(p => (
                  <FlippableCard
                    key={p.role}
                    profile={p}
                    selected={isSelected(p.role)}
                    onToggle={handleToggle}
                  />
                ))}
              </motion.div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && sections.length === 0 && displayProfiles.length === 0 && (
        <div style={styles.emptyMessage}>
          No agents match your filters.
        </div>
      )}

      {/* Save Team */}
      {teamSize > 0 && (
        <div style={styles.saveTeamRow}>
          {teamSaved ? (
            <span style={styles.savedLabel}>{'\u2713'} Team saved to My Page</span>
          ) : showSaveTeamInput ? (
            <div style={styles.saveTeamInputRow}>
              <input
                type="text"
                value={saveTeamName}
                onChange={e => setSaveTeamName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveTeam(); }}
                placeholder="Team name..."
                autoFocus
                style={styles.saveTeamInput}
              />
              <button onClick={handleSaveTeam} disabled={!saveTeamName.trim()} style={styles.saveTeamBtn}>
                Save
              </button>
              <button onClick={() => setShowSaveTeamInput(false)} style={styles.saveTeamCancelBtn}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setShowSaveTeamInput(true)} style={styles.saveTeamTrigger}>
              {'\u2605'} Save This Team
            </button>
          )}
        </div>
      )}

      {/* Spacer for bench */}
      <div style={{ height: 100 }} />

      {/* TeamBench — fixed bottom */}
      <TeamBench
        selectedProfiles={selectedProfiles}
        teamSize={teamSize}
        totalCost={totalCost}
        confirming={confirming}
        onRemove={handleToggle}
        onConfirm={handleConfirm}
        onClear={clearSelection}
        intensity={engagementConfig.intensity}
        yoloMode={engagementConfig.yoloMode}
        atCapFlash={atCapFlash}
        maxTeamSize={maxTeamSize}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    maxWidth: 1400,
    margin: '0 auto',
  },
  offlineBanner: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: '#B8860B',
    padding: '8px 14px',
    backgroundColor: 'rgba(184, 134, 11, 0.06)',
    borderRadius: radii.sm,
    borderLeft: `3px solid rgba(184, 134, 11, 0.4)`,
    marginBottom: spacing.md,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.lg,
    width: '100%',
  },
  backButton: {
    padding: '6px 14px',
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
  skipButton: {
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    marginLeft: 'auto',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  title: {
    fontSize: 32,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    letterSpacing: -0.5,
    margin: 0,
  },
  presetsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    marginBottom: spacing.md,
  },
  presetsLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  loadingHint: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
    flexShrink: 0,
  },
  loadingMessage: {
    textAlign: 'center',
    padding: 40,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorMessage: {
    textAlign: 'center',
    padding: 20,
    fontSize: 13,
    color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    borderRadius: 8,
    border: `1px solid rgba(196, 93, 62, 0.15)`,
  },
  emptyMessage: {
    textAlign: 'center',
    padding: 40,
    fontSize: 13,
    color: colors.textDim,
  },
  saveTeamRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  saveTeamTrigger: {
    background: 'none',
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    padding: '8px 24px',
    cursor: 'pointer',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  saveTeamInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saveTeamInput: {
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    width: 200,
  },
  saveTeamBtn: {
    padding: '8px 18px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: '#fff',
    backgroundColor: colors.text,
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  saveTeamCancelBtn: {
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  savedLabel: {
    fontSize: 12,
    color: colors.success,
    fontWeight: 500,
    fontFamily: fonts.sans,
  },
  recommendedBanner: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '14px 20px',
    backgroundColor: 'rgba(232, 132, 92, 0.04)',
    border: `1px solid rgba(232, 132, 92, 0.15)`,
    borderRadius: radii.md,
    marginBottom: spacing.xl,
  },
  recommendedLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  recommendedDetail: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.5,
  },
};
