/**
 * useEngagementConfig — Frontend state for the engagement configurator panel.
 *
 * Manages workflow selection, intensity level, budget, and YOLO mode.
 * Fetches team recommendations from the API on config change (debounced).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { DEMO_PROFILES } from '../data/demoProfiles.js';

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

/** Read engagement defaults from user profile in localStorage. */
function getProfileDefaults() {
  try {
    const raw = localStorage.getItem('shem-user-profile');
    if (raw) {
      const p = JSON.parse(raw);
      return {
        workflowId: p.defaultWorkflowId || 'simple-query',
        intensity: (p.defaultIntensity || 'standard') as IntensityLevel,
        budgetUsd: p.defaultBudgetUsd || 10,
        yoloMode: p.yoloModeDefault || false,
      };
    }
  } catch { /* ignore */ }
  return { workflowId: 'simple-query', intensity: 'standard' as IntensityLevel, budgetUsd: 10, yoloMode: false };
}

export function useEngagementConfig() {
  const defaults = getProfileDefaults();
  const [workflowId, setWorkflowId] = useState(defaults.workflowId);
  const [intensity, setIntensity] = useState<IntensityLevel>(defaults.intensity);
  const [budgetUsd, setBudgetUsd] = useState(defaults.budgetUsd);
  const [yoloMode, setYoloMode] = useState(defaults.yoloMode);
  const [recommendedRoles, setRecommendedRoles] = useState<string[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [targetTeamSize, setTargetTeamSize] = useState(8);
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch recommendations when config changes (debounced)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          intensity,
          budget: String(budgetUsd),
          workflow: workflowId,
        });
        const res = await fetch(`/api/agents/recommend?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: RecommendationResult = await res.json();
        setRecommendedRoles(data.recommendedRoles);
        setEstimatedCost(data.estimatedCost);
        setTargetTeamSize(data.targetTeamSize);
      } catch {
        // Fallback: generate demo recommendations from local profiles
        setDemoMode(true);
        const intensityTargets: Record<string, number> = { quick: 4, standard: 8, thorough: 12, maximal: 16 };
        const target = intensityTargets[intensity] ?? 8;
        const defaults = DEMO_PROFILES
          .filter(p => p.defaultSelected || !p.optional)
          .map(p => p.role);
        const extras = DEMO_PROFILES
          .filter(p => !p.defaultSelected && p.optional)
          .sort((a, b) => a.billingRateUsd - b.billingRateUsd)
          .map(p => p.role);
        const roles = [...defaults, ...extras].slice(0, target);
        setRecommendedRoles(roles);
        setEstimatedCost(roles.reduce((sum, r) => {
          const p = DEMO_PROFILES.find(pr => pr.role === r);
          return sum + (p?.billingRateUsd ?? 0);
        }, 0));
        setTargetTeamSize(target);
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
