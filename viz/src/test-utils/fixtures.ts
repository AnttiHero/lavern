/**
 * Test fixtures — canonical data for view tests.
 */

export const DEMO_MATTER_DATA = {
  matterId: 'mat-test-001',
  matterNumber: 'MBL-2025-001',
  clientName: 'Test Corp',
  matterTitle: 'Terms of Service Redesign',
  matterType: 'document_redesign',
  jurisdiction: 'US-CA',
  response: {
    conflictCheck: { passed: true, explanation: 'No conflicts found' },
    kyc: { passed: true, riskLevel: 'low' },
    engagementLetter: { scope: 'Document redesign', fee: 'Fixed $10', terms: 'Standard' },
  },
};

export const DEMO_BRIEFING_CONFIG = {
  workflowId: 'roundtable',
  intensity: 'standard',
  budgetUsd: 10,
  yoloMode: false,
};

export const DEMO_BRIEFING_TEAM = [
  'design-reviewer',
  'ethics-auditor',
  'plain-language-specialist',
  'transformation-specialist',
  'meaning-guardian',
  'synthesis-editor',
];

export const DEMO_SESSION_ID = 'test-session-1234';

/**
 * Pre-populate sessionStorage with standard demo data.
 */
export function seedSessionStorage(overrides?: {
  matterData?: Record<string, unknown>;
  briefingConfig?: Record<string, unknown>;
  team?: string[];
  sessionId?: string;
}) {
  sessionStorage.setItem(
    'shem-matter-data',
    JSON.stringify(overrides?.matterData ?? DEMO_MATTER_DATA)
  );
  sessionStorage.setItem(
    'shem-briefing-config',
    JSON.stringify(overrides?.briefingConfig ?? DEMO_BRIEFING_CONFIG)
  );
  sessionStorage.setItem(
    'shem-briefing-team',
    JSON.stringify(overrides?.team ?? DEMO_BRIEFING_TEAM)
  );
  sessionStorage.setItem(
    'shem-session-id',
    overrides?.sessionId ?? DEMO_SESSION_ID
  );
}

/**
 * Mock fetch to return a 404 (simulating no backend).
 */
export function mockFetchNotFound() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Not found' }),
  });
}

/**
 * Mock fetch to return specific session data.
 */
export function mockFetchSessionData(data: Record<string, unknown>) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}
