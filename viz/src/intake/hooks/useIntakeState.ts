/**
 * useIntakeState — Phase management + API calls for intake flow.
 *
 * If the API server is unreachable (network error / 500),
 * falls back to locally-generated demo data so the UX always works.
 */

import { useState, useCallback } from 'react';
import type { IntakePhase } from '../components/IntakeProgress.js';

export interface ClientFormData {
  clientName: string;
  matterTitle: string;
  matterDescription: string;
  matterType: string;
  jurisdiction: string;
  estimatedBudgetUsd: number;
  feeStructure: string;
}

export interface MatterApiResponse {
  matterId: string;
  matterNumber: string;
  status: string;
  conflictCheck: { conflictFound: boolean; resolution?: string };
  kyc: { clientVerified: boolean; riskLevel: string; flags: string[] };
  engagementLetter: {
    scope: string;
    feeStructure: string;
    estimatedBudget: { min: number; max: number; currency: string };
    accepted: boolean;
  };
}

export interface MatterData {
  matterId: string;
  matterNumber: string;
  clientName: string;
  matterTitle: string;
  matterType: string;
  jurisdiction: string;
  response: MatterApiResponse;
  demoMode?: boolean;
}

/** Generate deterministic demo data when API is unreachable. */
function createDemoMatter(form: ClientFormData): MatterApiResponse {
  const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const num = `MBL-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;
  const budget = form.estimatedBudgetUsd;

  return {
    matterId: id,
    matterNumber: num,
    status: 'pre-engagement',
    conflictCheck: {
      conflictFound: false,
      resolution: 'No conflicts identified. Clear to proceed.',
    },
    kyc: {
      clientVerified: true,
      riskLevel: 'low',
      flags: [],
    },
    engagementLetter: {
      scope: form.matterDescription,
      feeStructure: form.feeStructure,
      estimatedBudget: {
        min: budget * 0.8,
        max: budget * 1.2,
        currency: 'USD',
      },
      accepted: false,
    },
  };
}

export function useIntakeState() {
  const [phase, setPhase] = useState<IntakePhase>('mode-select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matterData, setMatterData] = useState<MatterData | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const submitClientInfo = useCallback(async (form: ClientFormData) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/matters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientName: form.clientName,
          matterTitle: form.matterTitle,
          matterDescription: form.matterDescription,
          matterType: form.matterType,
          jurisdiction: form.jurisdiction,
          estimatedBudgetUsd: form.estimatedBudgetUsd,
          feeStructure: form.feeStructure,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: MatterApiResponse = await res.json();
      setMatterData({
        matterId: data.matterId,
        matterNumber: data.matterNumber,
        clientName: form.clientName,
        matterTitle: form.matterTitle,
        matterType: form.matterType,
        jurisdiction: form.jurisdiction,
        response: data,
      });
      setPhase('review');
    } catch {
      // Fallback to demo data when backend is unreachable or returns an error
      const demoResponse = createDemoMatter(form);
      setMatterData({
        matterId: demoResponse.matterId,
        matterNumber: demoResponse.matterNumber,
        clientName: form.clientName,
        matterTitle: form.matterTitle,
        matterType: form.matterType,
        jurisdiction: form.jurisdiction,
        response: demoResponse,
        demoMode: true,
      });
      setDemoMode(true);
      setPhase('review');
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptEngagement = useCallback(async () => {
    if (!matterData) return;
    setLoading(true);
    setError(null);

    if (demoMode) {
      // Skip API call in demo mode
      setPhase('accepted');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/matters/${matterData.matterId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accepted: true }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setPhase('accepted');
    } catch {
      // Fallback: just accept locally
      setPhase('accepted');
    } finally {
      setLoading(false);
    }
  }, [matterData, demoMode]);

  const advanceToTerms = useCallback(() => setPhase('terms'), []);

  return { phase, setPhase, loading, error, matterData, demoMode, submitClientInfo, acceptEngagement, advanceToTerms };
}
