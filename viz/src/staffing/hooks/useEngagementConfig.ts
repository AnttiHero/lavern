/**
 * useEngagementConfig — Frontend state for the engagement configurator panel.
 *
 * Manages workflow selection, intensity level, budget, and YOLO mode.
 * Fetches team recommendations from the API on config change (debounced).
 *
 * In standalone mode: generates recommendations locally, no API fetch.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { DEMO_PROFILES } from '../data/demoProfiles.js';
import { IS_STANDALONE } from '../../standalone.js';

export type IntensityLevel = 'quick' | 'standard' | 'thorough' | 'maximal';

export interface EngagementConfig {
  workflowId: string;
  intensity: IntensityLevel;
  budgetUsd: number;
  yoloMode: boolean;
}

interface RecommendationResult {
  recommendedRoles: string[];
  teamSize: number;
  targetTeamSize: number;
  estimatedCost: number;
}

const INTENSITY_TARGETS: Record<string, number> = { quick: 3, standard: 6, thorough: 10, maximal: 14 };

/** Generate local recommendations from demo profiles. */
function generateLocalRecommendation(intensity: string) {
  const target = INTENSITY_TARGETS[intensity] ?? 8;
  const defaults = DEMO_PROFILES
    .filter(p => p.defaultSelected || !p.optional)
    .map(p => p.role);
  const extras = DEMO_PROFILES
    .filter(p => !p.defaultSelected && p.optional)
    .sort((a, b) => a.billingRateUsd - b.billingRateUsd)
    .map(p => p.role);
  const roles = [...defaults, ...extras].slice(0, target);
  const cost = roles.reduce((sum, r) => {
    const p = DEMO_PROFILES.find(pr => pr.role === r);
    return sum + (p?.billingRateUsd ?? 0);
  }, 0);
  return { roles, cost, target };
}

/** Read engagement defaults: sessionStorage (from briefing) > localStorage (user profile) > hardcoded. */
function getProfileDefaults() {
  // Priority 1: sessionStorage — set by BriefingView or StrategyView
  try {
    const ssRaw = sessionStorage.getItem('shem-briefing-config');
    if (ssRaw) {
      const ss = JSON.parse(ssRaw);
      return {
        workflowId: ss.workflowId || 'counsel',
        intensity: (ss.intensity || 'standard') as IntensityLevel,
        budgetUsd: ss.budgetUsd || 10,
        yoloMode: ss.yoloMode || false,
      };
    }
  } catch { /* ignore */ }

  // Priority 2: localStorage — user profile defaults
  try {
    const raw = localStorage.getItem('shem-user-profile');
    if (raw) {
      const p = JSON.parse(raw);
      return {
        workflowId: p.defaultWorkflowId || 'counsel',
        intensity: (p.defaultIntensity || 'standard') as IntensityLevel,
        budgetUsd: p.defaultBudgetUsd || 10,
        yoloMode: p.yoloModeDefault || false,
      };
    }
  } catch { /* ignore */ }

  return { workflowId: 'counsel', intensity: 'standard' as IntensityLevel, budgetUsd: 10, yoloMode: false };
}

export function useEngagementConfig() {
  const defaults = getProfileDefaults();
  const [workflowId, setWorkflowId] = useState(defaults.workflowId);
  const [intensity, setIntensity] = useState<IntensityLevel>(defaults.intensity);
  const [budgetUsd, setBudgetUsd] = useState(defaults.budgetUsd);
  const [yoloMode, setYoloMode] = useState(defaults.yoloMode);

  // In standalone mode, generate initial recommendation synchronously
  const initialRec = IS_STANDALONE ? generateLocalRecommendation(defaults.intensity) : null;
  const [recommendedRoles, setRecommendedRoles] = useState<string[]>(initialRec?.roles ?? []);
  const [estimatedCost, setEstimatedCost] = useState(initialRec?.cost ?? 0);
  const [targetTeamSize, setTargetTeamSize] = useState(initialRec?.target ?? 8);
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(IS_STANDALONE);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch recommendations when config changes (debounced)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Standalone: compute locally, no async, no flicker
    if (IS_STANDALONE) {
      const rec = generateLocalRecommendation(intensity);
      setRecommendedRoles(rec.roles);
      setEstimatedCost(rec.cost);
      setTargetTeamSize(rec.target);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          intensity,
          budget: String(budgetUsd),
          workflow: workflowId,
        });
        const res = await fetch(`/api/agents/recommend?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: RecommendationResult = await res.json();
        setRecommendedRoles(data.recommendedRoles);
        setEstimatedCost(data.estimatedCost);
        setTargetTeamSize(data.targetTeamSize);
      } catch {
        // Fallback: generate demo recommendations from local profiles
        setDemoMode(true);
        const rec = generateLocalRecommendation(intensity);
        setRecommendedRoles(rec.roles);
        setEstimatedCost(rec.cost);
        setTargetTeamSize(rec.target);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [workflowId, intensity, budgetUsd]);

  const config: EngagementConfig = {
    workflowId,
    intensity,
    budgetUsd,
    yoloMode,
  };

  const setWorkflow = useCallback((id: string) => setWorkflowId(id), []);
  const setBudget = useCallback((budget: number) => setBudgetUsd(budget), []);
  const setYolo = useCallback((yolo: boolean) => setYoloMode(yolo), []);

  return {
    config,
    setWorkflow,
    setIntensity,
    setBudget,
    setYolo,
    recommendedRoles,
    estimatedCost,
    targetTeamSize,
    loading,
    demoMode,
  };
}
