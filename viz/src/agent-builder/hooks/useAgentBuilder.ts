/**
 * useAgentBuilder — State management for the agent builder wizard.
 *
 * Tracks all builder fields across three steps and produces a
 * valid AgentProfile on completion.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  AgentCategory,
  SeniorityTier,
  CostTier,
  SkillRatings,
  PersonalityAxis,
  AgentProfile,
} from '../../types/agent-profile.js';
import type { ArchetypePreset } from '../data/archetype-presets.js';
import { ARCHETYPE_PRESETS } from '../data/archetype-presets.js';
import { buildAvatarExtra } from '../data/dicebear-variants.js';

// ── Types ──────────────────────────────────────────────────────────────

export type BuilderStep = 1 | 2 | 3;

export interface BuilderState {
  // Step 1: Identity
  displayName: string;
  tagline: string;
  category: AgentCategory;
  seniority: SeniorityTier;
  archetype: string;
  presetId: string | null;

  // Step 2: Face
  avatarSeed: string;
  avatarFeatures: Record<string, string | null>; // key=feature, value=variant or null

  // Step 3: Stats
  skills: SkillRatings;
  personality: Record<PersonalityAxis, number>;
  workStyle: string;
  practiceAreas: string[];
  strengths: string[];
  limitations: string[];
}

// ── Skill → OVR calculation ────────────────────────────────────────────

const SKILL_WEIGHTS: Record<keyof SkillRatings, number> = {
  precision: 1.2,
  depth: 1.2,
  research: 1.1,
  risk: 1.1,
  negotiation: 1.0,
  communication: 1.0,
  creativity: 0.9,
  speed: 0.5,
};

const TOTAL_WEIGHT = Object.values(SKILL_WEIGHTS).reduce((a, b) => a + b, 0);

/** Convert 1-10 internal skill to 0-99 display value. */
export function skillToDisplay(internal: number): number {
  return Math.round((internal - 1) * 11);
}

/** Convert 0-99 display value back to 1-10 internal. */
export function displayToSkill(display: number): number {
  return Math.max(1, Math.min(10, Math.round(display / 11) + 1));
}

/** Calculate overall rating (0-99) from skills. */
export function calculateOVR(skills: SkillRatings): number {
  let weighted = 0;
  for (const [key, weight] of Object.entries(SKILL_WEIGHTS)) {
    weighted += skills[key as keyof SkillRatings] * weight;
  }
  return Math.round((weighted / TOTAL_WEIGHT - 1) * 11);
}

/** Derive cost tier from OVR. */
export function ovrToCostTier(ovr: number): CostTier {
  if (ovr >= 80) return 'opus';
  if (ovr >= 50) return 'sonnet';
  return 'haiku';
}

/** Derive billing rate from cost tier. */
function tierToBillingRate(tier: CostTier): number {
  if (tier === 'opus') return 450;
  if (tier === 'sonnet') return 200;
  return 75;
}

// ── Initial state ──────────────────────────────────────────────────────

const INITIAL_STATE: BuilderState = {
  displayName: '',
  tagline: '',
  category: 'lawyer',
  seniority: 'associate',
  archetype: '',
  presetId: null,
  avatarSeed: 'New Custom Agent',
  avatarFeatures: {},
  skills: {
    precision: 5, creativity: 5, speed: 5, depth: 5,
    negotiation: 5, communication: 5, research: 5, risk: 5,
  },
  personality: {
    'conservative-vs-creative': 5,
    'thorough-vs-fast': 5,
    'risk-averse-vs-tolerant': 5,
    'formal-vs-approachable': 5,
    'adversarial-vs-collaborative': 5,
  },
  workStyle: '',
  practiceAreas: [],
  strengths: [],
  limitations: [],
};

// ── Hook ───────────────────────────────────────────────────────────────

export function useAgentBuilder() {
  const [step, setStep] = useState<BuilderStep>(1);
  const [state, setState] = useState<BuilderState>(INITIAL_STATE);

  // ── Derived values ──────────────────────────────────────────────────

  const ovr = useMemo(() => calculateOVR(state.skills), [state.skills]);
  const costTier = useMemo(() => ovrToCostTier(ovr), [ovr]);
  const billingRate = useMemo(() => tierToBillingRate(costTier), [costTier]);
  const avatarExtra = useMemo(() => buildAvatarExtra(state.avatarFeatures), [state.avatarFeatures]);

  // ── Field updaters ──────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof BuilderState>(
    key: K,
    value: BuilderState[K],
  ) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateSkill = useCallback((skill: keyof SkillRatings, value: number) => {
    setState(prev => ({
      ...prev,
      skills: { ...prev.skills, [skill]: Math.max(1, Math.min(10, value)) },
    }));
  }, []);

  const updatePersonality = useCallback((axis: PersonalityAxis, value: number) => {
    setState(prev => ({
      ...prev,
      personality: { ...prev.personality, [axis]: Math.max(1, Math.min(10, value)) },
    }));
  }, []);

  const updateAvatarFeature = useCallback((feature: string, variant: string | null) => {
    setState(prev => ({
      ...prev,
      avatarFeatures: { ...prev.avatarFeatures, [feature]: variant },
    }));
  }, []);

  const togglePracticeArea = useCallback((area: string) => {
    setState(prev => ({
      ...prev,
      practiceAreas: prev.practiceAreas.includes(area)
        ? prev.practiceAreas.filter(a => a !== area)
        : [...prev.practiceAreas, area],
    }));
  }, []);

  // ── Apply preset ────────────────────────────────────────────────────

  const applyPreset = useCallback((presetId: string) => {
    const preset = ARCHETYPE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    setState({
      displayName: preset.id === 'blank' ? '' : preset.name,
      tagline: preset.tagline,
      category: preset.category,
      seniority: preset.seniority,
      archetype: preset.archetype,
      presetId: preset.id,
      avatarSeed: preset.avatarSeed,
      avatarFeatures: {},
      skills: { ...preset.skills },
      personality: { ...preset.personality },
      workStyle: preset.workStyle,
      practiceAreas: [...preset.practiceAreas],
      strengths: [...preset.strengths],
      limitations: [...preset.limitations],
    });
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────

  const nextStep = useCallback(() => {
    setStep(prev => Math.min(3, prev + 1) as BuilderStep);
  }, []);

  const prevStep = useCallback(() => {
    setStep(prev => Math.max(1, prev - 1) as BuilderStep);
  }, []);

  const goToStep = useCallback((s: BuilderStep) => setStep(s), []);

  // ── Validation ──────────────────────────────────────────────────────

  const isValid = state.displayName.trim().length >= 2;

  // ── Build profile ───────────────────────────────────────────────────

  const buildProfile = useCallback((): AgentProfile => {
    return {
      role: '', // will be set by useCustomAgents.addAgent
      displayName: state.displayName.trim(),
      tagline: state.tagline.trim() || `Custom ${state.category}`,
      category: state.category,
      seniority: state.seniority,
      costTier,
      billingRateUsd: billingRate,
      skills: { ...state.skills },
      personality: {
        archetype: state.archetype.trim() || 'Custom Agent',
        traits: { ...state.personality },
        workStyle: state.workStyle.trim(),
      },
      practiceAreas: state.practiceAreas,
      strengths: state.strengths.filter(s => s.trim()),
      limitations: state.limitations.filter(l => l.trim()),
      optional: true,
      defaultSelected: false,
      avatarSeed: state.avatarSeed.trim() || undefined,
      avatarExtra: avatarExtra || undefined,
    };
  }, [state, costTier, billingRate, avatarExtra]);

  // ── Load from existing profile (for edit mode) ──────────────────────

  const loadFromProfile = useCallback((profile: AgentProfile) => {
    setState({
      displayName: profile.displayName,
      tagline: profile.tagline,
      category: profile.category,
      seniority: profile.seniority,
      archetype: profile.personality?.archetype ?? '',
      presetId: null,
      avatarSeed: profile.avatarSeed ?? profile.displayName,
      avatarFeatures: {},
      skills: { ...profile.skills },
      personality: (profile.personality?.traits as Record<PersonalityAxis, number>) ?? {
        'conservative-vs-creative': 5,
        'thorough-vs-fast': 5,
        'risk-averse-vs-tolerant': 5,
        'formal-vs-approachable': 5,
        'adversarial-vs-collaborative': 5,
      },
      workStyle: profile.personality?.workStyle ?? '',
      practiceAreas: [...(profile.practiceAreas ?? [])],
      strengths: [...(profile.strengths ?? [])],
      limitations: [...(profile.limitations ?? [])],
    });
    setStep(1);
  }, []);

  // ── Load from clone API response ────────────────────────────────────

  /**
   * Apply the output of POST /api/agents/clone to the builder state.
   * Shape matches the JSON schema the clone endpoint returns.
   */
  type CloneData = {
    displayName?: string;
    tagline?: string;
    category?: AgentCategory;
    seniority?: SeniorityTier;
    archetype?: string;
    workStyle?: string;
    practiceAreas?: string[];
    strengths?: string[];
    limitations?: string[];
    skills?: Partial<SkillRatings>;
    personality?: Partial<Record<PersonalityAxis, number>>;
  };

  const mergeCloneData = useCallback((data: CloneData, prev: BuilderState): BuilderState => ({
    ...prev,
    displayName: data.displayName?.trim() || prev.displayName,
    tagline: data.tagline?.trim() || prev.tagline,
    category: data.category ?? prev.category,
    seniority: data.seniority ?? prev.seniority,
    archetype: data.archetype?.trim() || prev.archetype,
    avatarSeed: (data.displayName?.trim() || prev.avatarSeed),
    avatarFeatures: {},
    skills: {
      precision: data.skills?.precision ?? prev.skills.precision,
      creativity: data.skills?.creativity ?? prev.skills.creativity,
      speed: data.skills?.speed ?? prev.skills.speed,
      depth: data.skills?.depth ?? prev.skills.depth,
      negotiation: data.skills?.negotiation ?? prev.skills.negotiation,
      communication: data.skills?.communication ?? prev.skills.communication,
      research: data.skills?.research ?? prev.skills.research,
      risk: data.skills?.risk ?? prev.skills.risk,
    },
    personality: {
      'conservative-vs-creative': data.personality?.['conservative-vs-creative'] ?? prev.personality['conservative-vs-creative'],
      'thorough-vs-fast': data.personality?.['thorough-vs-fast'] ?? prev.personality['thorough-vs-fast'],
      'risk-averse-vs-tolerant': data.personality?.['risk-averse-vs-tolerant'] ?? prev.personality['risk-averse-vs-tolerant'],
      'formal-vs-approachable': data.personality?.['formal-vs-approachable'] ?? prev.personality['formal-vs-approachable'],
      'adversarial-vs-collaborative': data.personality?.['adversarial-vs-collaborative'] ?? prev.personality['adversarial-vs-collaborative'],
    },
    workStyle: data.workStyle?.trim() || prev.workStyle,
    practiceAreas: Array.isArray(data.practiceAreas) ? [...data.practiceAreas] : prev.practiceAreas,
    strengths: Array.isArray(data.strengths) ? [...data.strengths] : prev.strengths,
    limitations: Array.isArray(data.limitations) ? [...data.limitations] : prev.limitations,
    presetId: null,
  }), []);

  const loadFromCloneData = useCallback((data: CloneData) => {
    setState(prev => mergeCloneData(data, prev));
    setStep(1);
  }, [mergeCloneData]);

  /**
   * Synchronously build a complete profile + derived values from clone API
   * response. Used by the "reveal-first" clone flow — we can't wait for
   * React state to flush before pushing the reveal overlay.
   */
  const buildProfileFromCloneData = useCallback((data: CloneData): {
    profile: AgentProfile;
    ovr: number;
    costTier: CostTier;
    billingRate: number;
  } => {
    const merged = mergeCloneData(data, state);
    const mergedOvr = calculateOVR(merged.skills);
    const mergedTier = ovrToCostTier(mergedOvr);
    const mergedRate = tierToBillingRate(mergedTier);
    const profile: AgentProfile = {
      role: '',
      displayName: merged.displayName.trim(),
      tagline: merged.tagline.trim() || `Custom ${merged.category}`,
      category: merged.category,
      seniority: merged.seniority,
      costTier: mergedTier,
      billingRateUsd: mergedRate,
      skills: { ...merged.skills },
      personality: {
        archetype: merged.archetype.trim() || 'Custom Agent',
        traits: { ...merged.personality },
        workStyle: merged.workStyle.trim(),
      },
      practiceAreas: merged.practiceAreas,
      strengths: merged.strengths.filter(s => s.trim()),
      limitations: merged.limitations.filter(l => l.trim()),
      optional: true,
      defaultSelected: false,
      avatarSeed: merged.avatarSeed.trim() || undefined,
    };
    return { profile, ovr: mergedOvr, costTier: mergedTier, billingRate: mergedRate };
  }, [state, mergeCloneData]);

  // ── Reset ───────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setStep(1);
  }, []);

  return {
    // State
    step,
    state,
    ovr,
    costTier,
    billingRate,
    avatarExtra,
    isValid,

    // Actions
    updateField,
    updateSkill,
    updatePersonality,
    updateAvatarFeature,
    togglePracticeArea,
    applyPreset,
    nextStep,
    prevStep,
    goToStep,
    buildProfile,
    loadFromProfile,
    loadFromCloneData,
    buildProfileFromCloneData,
    reset,
  };
}
