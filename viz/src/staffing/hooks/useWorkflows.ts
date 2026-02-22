/**
 * useWorkflows — Fetch workflow templates from API for the engagement configurator.
 */

import { useState, useEffect } from 'react';

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  stepCount: number;
  steps: string[];
  requiredAgents: string[];
  gateCount: number;
  hasGates: boolean;
  gateSteps: string[];
}

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchWorkflows() {
      try {
        const res = await fetch('/api/workflows', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setWorkflows(data.workflows ?? []);
        }
      } catch {
        // Fallback demo workflows when API is unreachable
        if (!cancelled) setWorkflows([
          { id: 'roundtable', name: 'Roundtable', description: 'Full document review, redraft, and plain-language improvement', stepCount: 8, steps: ['intake', 'research', 'draft', 'review', 'design', 'test', 'refine', 'deliver'], requiredAgents: ['managing-partner', 'evaluator'], gateCount: 2, hasGates: true, gateSteps: ['review', 'deliver'] },
          { id: 'review', name: 'Review', description: 'Systematic contract analysis and redlining', stepCount: 6, steps: ['intake', 'analysis', 'redline', 'review', 'negotiate', 'deliver'], requiredAgents: ['managing-partner', 'evaluator'], gateCount: 1, hasGates: true, gateSteps: ['deliver'] },
          { id: 'adversarial', name: 'Adversarial', description: 'Legal research with structured memorandum output', stepCount: 5, steps: ['intake', 'research', 'draft', 'review', 'deliver'], requiredAgents: ['managing-partner', 'evaluator'], gateCount: 1, hasGates: true, gateSteps: ['deliver'] },
          { id: 'counsel', name: 'Counsel', description: 'Quick legal question answered with analysis', stepCount: 4, steps: ['intake', 'analysis', 'draft', 'deliver'], requiredAgents: ['managing-partner'], gateCount: 0, hasGates: false, gateSteps: [] },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWorkflows();
    return () => { cancelled = true; };
  }, []);

  return { workflows, loading };
}
