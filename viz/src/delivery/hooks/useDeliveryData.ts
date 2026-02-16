/**
 * useDeliveryData — Fetches session results for the delivery screen.
 *
 * Real mode:  GET /api/sessions/:id  (extends with report card if available)
 * Demo mode:  Returns rich static data when sessionId starts with "demo-session-"
 */

import { useState, useEffect } from 'react';

// ── Public types ─────────────────────────────────────────────────────────

export interface DimensionScore {
  dimension: string;
  before: number;
  after: number;
  delta: number;
}

export interface KeyChange {
  title: string;
  before: string;
  after: string;
}

export interface NarrativeSection {
  phase: string;
  heading: string;
  body: string;
  agents: string[];
  highlight?: string;
}

export interface AgentPerf {
  name: string;
  role: string;
  findingsPosted: number;
  challengesSurvived: number;
  avgConfidence: number;
}

export interface NextStepItem {
  label: string;
  description: string;
  kind: 'action' | 'watchout' | 'schedule';
}

export interface DeliveryData {
  sessionId: string;
  status: string;

  // Tab 1: The Work
  documentTitle: string;
  executiveSummary: string;
  keyChanges: KeyChange[];
  dimensions: DimensionScore[];

  // Tab 2: The Story
  narrative: NarrativeSection[];

  // Tab 3: The Scorecard
  debate: { findingsCount: number; challengesCount: number; resolutionsCount: number; unresolvedCount: number };
  verification: {
    resultsCount: number;
    passed: number;
    failed: number;
    confidence: number;
    breakdown?: Array<{ type: 'self' | 'cross' | 'score'; passed: boolean; confidence: number; label: string }>;
  };
  cost: { accumulated: number; budget: number; remaining: number };
  agentPerformance: AgentPerf[];
  eventCount: number;

  // Certainty — limitations & transparency
  limitations?: {
    flaggedForHumanReview: string[];
    confidenceIntervals: string;
    disclaimer: string;
  };

  // Tab 4: Next Steps
  nextSteps: NextStepItem[];
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useDeliveryData(): {
  data: DeliveryData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = sessionStorage.getItem('shem-session-id');

    if (!sessionId) {
      // No active session — show demo data so the screen is always previewable
      setData(buildDemoData('demo-session-preview'));
      setLoading(false);
      return;
    }

    // Demo mode
    if (sessionId.startsWith('demo-session-')) {
      setData(buildDemoData(sessionId));
      setLoading(false);
      return;
    }

    // Real API
    fetch(`/api/sessions/${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch session');
        return res.json();
      })
      .then(raw => {
        setData(mapApiResponse(sessionId, raw));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}

// ── API response mapping ──────────────────────────────────────────────────

function mapApiResponse(sessionId: string, raw: Record<string, unknown>): DeliveryData {
  const workflow = raw.workflow as { currentStep?: string; completedSteps?: string[] } | undefined;
  const debate = raw.debate as { findingsCount?: number; challengesCount?: number; resolutionsCount?: number; unresolvedCount?: number } | undefined;
  const verification = raw.verification as { resultsCount?: number; passed?: number; failed?: number; confidence?: number } | undefined;
  const cost = raw.cost as { accumulated?: number; budget?: number; remaining?: number } | undefined;

  return {
    sessionId,
    status: workflow?.currentStep === 'delivered' ? 'Complete' : (workflow?.currentStep ?? 'Unknown').replace(/_/g, ' '),

    documentTitle: 'Session Results',
    executiveSummary: 'The team has completed analysis, review, and transformation of the submitted document.',
    keyChanges: [],
    dimensions: [],

    narrative: [],

    debate: {
      findingsCount: debate?.findingsCount ?? 0,
      challengesCount: debate?.challengesCount ?? 0,
      resolutionsCount: debate?.resolutionsCount ?? 0,
      unresolvedCount: debate?.unresolvedCount ?? 0,
    },
    verification: {
      resultsCount: verification?.resultsCount ?? 0,
      passed: verification?.passed ?? 0,
      failed: verification?.failed ?? 0,
      confidence: verification?.confidence ?? 0,
    },
    cost: {
      accumulated: cost?.accumulated ?? 0,
      budget: cost?.budget ?? 0,
      remaining: cost?.remaining ?? 0,
    },
    agentPerformance: [],
    eventCount: (raw.eventCount as number | undefined) ?? 0,

    nextSteps: [],
  };
}

// ── Demo data ─────────────────────────────────────────────────────────────

function buildDemoData(sessionId: string): DeliveryData {
  // Read matter info for context
  let matterTitle = 'Terms of Service Redesign';
  try {
    const stored = sessionStorage.getItem('shem-matter-data');
    if (stored) {
      const m = JSON.parse(stored);
      if (m.matterTitle) matterTitle = m.matterTitle;
    }
  } catch { /* use default */ }

  return {
    sessionId,
    status: 'Complete',

    // ── Tab 1: The Work ──
    documentTitle: matterTitle,
    executiveSummary:
      'Your document has been redesigned for clarity, accessibility, and legal precision. ' +
      'Reading level was reduced from Grade 14.2 to Grade 7.8, making it accessible to 94% of the adult population. ' +
      'Visual hierarchy was restructured with consistent heading levels, and all WCAG 2.1 AA compliance gaps were resolved. ' +
      'Legal meaning was independently verified as fully preserved throughout the transformation.',

    keyChanges: [
      {
        title: 'Readability',
        before: 'Flesch-Kincaid Grade 14.2 — university-level language requiring specialized knowledge',
        after: 'Grade 7.8 — clear, accessible language that maintains professional tone',
      },
      {
        title: 'Visual Hierarchy',
        before: 'Inconsistent heading structure, no clear information flow',
        after: 'Three-level heading system with consistent styling and logical document flow',
      },
      {
        title: 'Accessibility',
        before: 'Color contrast ratios below WCAG 2.1 AA thresholds in 3 sections',
        after: 'Full WCAG 2.1 AA compliance — all contrast ratios above 4.5:1',
      },
      {
        title: 'Legal Meaning',
        before: 'Original legal intent embedded in complex sentence structures',
        after: 'Identical legal meaning verified — no semantic drift detected across 12 checkpoint tests',
      },
    ],

    dimensions: [
      { dimension: 'Readability', before: 1.8, after: 3.8, delta: 2.0 },
      { dimension: 'Findability', before: 2.1, after: 3.4, delta: 1.3 },
      { dimension: 'Clarity', before: 2.3, after: 3.9, delta: 1.6 },
      { dimension: 'Visual Design', before: 2.5, after: 4.1, delta: 1.6 },
      { dimension: 'Ethics', before: 2.0, after: 3.2, delta: 1.2 },
    ],

    // ── Tab 2: The Story ──
    narrative: [
      {
        phase: 'Analysis',
        heading: 'Three perspectives, three problems',
        body:
          'The engagement began with three specialists examining the document simultaneously. ' +
          'The Design Reviewer identified inconsistent heading structures that disrupted the reading flow. ' +
          'The Plain Language Specialist measured readability at Grade 14.2 — well above the target of Grade 8. ' +
          'Meanwhile, the Ethics Auditor flagged color contrast ratios that fell short of WCAG 2.1 AA standards, ' +
          'meaning the document was inaccessible to readers with visual impairments.',
        agents: ['Design Reviewer', 'Plain Language Specialist', 'Ethics Auditor'],
      },
      {
        phase: 'First Review',
        heading: 'A challenge that changed the outcome',
        body:
          'During the first review round, the Ethics Auditor challenged the Design Reviewer\'s severity ' +
          'assessment of the heading structure issue. The original classification was YELLOW — important ' +
          'but not critical. The challenge argued that inconsistent headings don\'t just affect aesthetics; ' +
          'they affect comprehension for screen reader users, making this an accessibility issue at its core. ' +
          'The Design Reviewer accepted the challenge, and the finding was upgraded to RED.',
        agents: ['Ethics Auditor', 'Design Reviewer'],
        highlight: 'This challenge elevated a visual issue to a structural accessibility concern — a distinction that changed the transformation approach.',
      },
      {
        phase: 'Ethics Check',
        heading: 'Flagged for human review',
        body:
          'Two RED findings related to accessibility triggered the ethics gate. The system flagged ' +
          'that these issues affect users with disabilities and readers with lower literacy levels. ' +
          'After review, the decision was to proceed with remediation — the transformation would need ' +
          'to address both readability and accessibility comprehensively, not as separate fixes.',
        agents: [],
        highlight: 'The ethics gate ensured accessibility wasn\'t treated as cosmetic but as a fundamental requirement.',
      },
      {
        phase: 'Transformation',
        heading: 'Rewriting with precision',
        body:
          'The Transformation Specialist restructured the entire document with a new three-level heading ' +
          'system. The Plain Language Specialist then rewrote the content to Grade 8 reading level, ' +
          'working sentence by sentence to simplify language without altering legal obligations. ' +
          'This was the most time-intensive phase — every simplification had to preserve exact legal meaning.',
        agents: ['Transformation Specialist', 'Plain Language Specialist'],
      },
      {
        phase: 'Verification',
        heading: 'All checks passed',
        body:
          'Three independent verification checks confirmed the transformation met all targets. ' +
          'Readability scored Grade 7.8. Accessibility achieved full WCAG 2.1 AA compliance. ' +
          'Most critically, the legal accuracy verification confirmed that no semantic drift had occurred — ' +
          'every legal obligation, right, and condition in the original document was preserved in the new version.',
        agents: [],
      },
      {
        phase: 'Final Approval',
        heading: 'Ready for delivery',
        body:
          'The Meaning Guardian performed a final independent review, running 12 checkpoint tests ' +
          'comparing original and transformed versions. The verdict: legal meaning fully preserved, ' +
          'no semantic drift detected. The document was approved for delivery.',
        agents: ['Meaning Guardian'],
      },
    ],

    // ── Tab 3: The Scorecard ──
    debate: {
      findingsCount: 5,
      challengesCount: 1,
      resolutionsCount: 1,
      unresolvedCount: 0,
    },
    verification: {
      resultsCount: 3,
      passed: 3,
      failed: 0,
      confidence: 0.91,
      breakdown: [
        { type: 'self', passed: true, confidence: 0.93, label: 'Self-Check' },
        { type: 'cross', passed: true, confidence: 0.87, label: 'Cross-Check' },
        { type: 'score', passed: true, confidence: 0.94, label: 'Score-Check' },
      ],
    },
    cost: {
      accumulated: 4.58,
      budget: 10.00,
      remaining: 5.42,
    },
    agentPerformance: [
      { name: 'Design Reviewer', role: 'design-reviewer', findingsPosted: 2, challengesSurvived: 0, avgConfidence: 0.87 },
      { name: 'Ethics Auditor', role: 'ethics-auditor', findingsPosted: 1, challengesSurvived: 1, avgConfidence: 0.91 },
      { name: 'Plain Language Specialist', role: 'plain-language-specialist', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.93 },
      { name: 'Transformation Specialist', role: 'transformation-specialist', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.95 },
      { name: 'Meaning Guardian', role: 'meaning-guardian', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.96 },
      { name: 'Synthesis Editor', role: 'synthesis-editor', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
    ],
    eventCount: 47,

    // ── Certainty — transparency section ──
    limitations: {
      flaggedForHumanReview: [
        'Jurisdictional nuances for multi-state compliance',
        'Industry-specific regulatory interpretations',
      ],
      confidenceIntervals: 'Overall certainty 91% (range: 87\u201394% across verification dimensions)',
      disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.',
    },

    // ── Tab 4: Next Steps ──
    nextSteps: [
      {
        label: 'Review the transformed document',
        description: 'Compare the before and after versions side by side. Pay particular attention to sections where complex legal language was simplified — verify the plain-language version captures your intended meaning.',
        kind: 'action',
      },
      {
        label: 'Test with your audience',
        description: 'Share the document with 2-3 representative readers from your target audience. Ask them to explain key obligations in their own words — if they can, the readability improvements are working.',
        kind: 'action',
      },
      {
        label: 'Update your style guide',
        description: 'The heading structure and language patterns used in this transformation can serve as a template for future documents. Consider adopting the three-level heading system as your standard.',
        kind: 'action',
      },
      {
        label: 'Schedule a 90-day review',
        description: 'Set a reminder to review the document after 90 days of use. Collect feedback from users and identify any sections that cause confusion or questions.',
        kind: 'schedule',
      },
      {
        label: 'Accessibility testing recommended',
        description: 'While the document meets WCAG 2.1 AA standards, consider testing with actual assistive technology (screen readers, high-contrast mode) before publishing to your website.',
        kind: 'watchout',
      },
    ],
  };
}
