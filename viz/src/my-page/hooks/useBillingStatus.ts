/**
 * useBillingStatus — Fetches the current user's billing status.
 *
 * Returns plan, billable hours balance, monthly usage, and loading state.
 * Data source: GET /api/billing/status
 */

import { useState, useEffect, useCallback } from 'react';

export interface BillingStatus {
  plan: string;
  planLabel: string;
  monthlyCapUsd: number;
  maxSessionBudget: number;
  usage: {
    totalCostUsd: number;
    engagementCount: number;
    remainingBudget: number;
  };
  billableHours: {
    balance: number;
    rate: number;
    balanceUsd: number;
  };
  expiresAt: string | null;
  isExpired: boolean;
  stripeConfigured: boolean;
}

interface UseBillingStatusResult {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBillingStatus(enabled = true): UseBillingStatusResult {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/status', { credentials: 'include' });
      if (res.status === 401) {
        // Not logged in — return null silently
        setStatus(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data as BillingStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch billing status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) fetchStatus();
  }, [enabled, fetchStatus]);

  return { status, loading, error, refresh: fetchStatus };
}
