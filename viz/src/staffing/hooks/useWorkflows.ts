/**
 * useWorkflows — Fetch workflow templates from API for the engagement configurator.
 *
 * In standalone mode: uses bundled demo data, no API fetch.
 */

import { useState, useEffect } from 'react';
import { IS_STANDALONE } from '../../standalone.js';

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

const DEMO_WORKFLOWS: WorkflowSummary[] = [
  { id: 'roundtable', name: 'Roundtable', description: 'Full document review, redraft, and plain-language improvement', stepCount: 8, steps: ['intake', 'research', 'draft', 'review', 'design', 'test', 'refine', 'deliver'], requiredAgents: ['managing-partner', 'evaluator'], gateCount: 2, hasGates: true, gateSteps: ['review', 'deliver'] },
  { id: 'review', name: 'Review', description: 'Systematic contract analysis and redlining', stepCount: 6, steps: ['intake', 'analysis', 'redline', 'review', 'negotiate', 'deliver'], requiredAgents: ['managing-partner', 'evaluator'], gateCount: 1, hasGates: true, gateSteps: ['deliver'] },
  { id: 'adversarial', name: 'Adversarial', description: 'Legal research with structured memorandum output', stepCount: 5, steps: ['intake', 'research', 'draft', 'review', 'deliver'], requiredAgents: ['managing-partner', 'evaluator'], gateCount: 1, hasGates: true, gateSteps: ['deliver'] },
  { id: 'counsel', name: 'Counsel', description: 'Quick legal question answered with analysis', stepCount: 4, steps: ['intake', 'analysis', 'draft', 'deliver'], requiredAgents: ['managing-partner'], gateCount: 0, hasGates: false, gateSteps: [] },
  { id: 'tabulate', name: 'Tabulate', description: 'Extract structured tables (cap tables, payment schedules, JV interests, lease abstracts) with per-cell source citations and confidence ratings. Output: CSV, Word with tables, HTML preview.', stepCount: 3, steps: ['intake', 'specialist_execution', 'deliver'], requiredAgents: [], gateCount: 0, hasGates: false, gateSteps: [] },
];

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>(DEMO_WORKFLOWS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Standalone mode: demo data is already loaded, skip fetch
    if (IS_STANDALONE) return;

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
        // API unreachable — keep demo workflows
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWorkflows();
    return () => { cancelled = true; };
  }, []);

  return { workflows, loading };
}
