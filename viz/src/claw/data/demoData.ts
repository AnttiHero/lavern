/**
 * demoData — Synthetic data for Claw Mode when backend is unreachable.
 * 12 documents, 6 deliveries, full status profile.
 */

import type { ClawStatus, ClawDocument, ClawDelivery, ClawPrecedent, ClawPrecedentSummary } from '../hooks/useClawData.js';

export type DemoPrecedentSummary = { summary: ClawPrecedentSummary; precedents: ClawPrecedent[] };

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

export function buildDemoStatus(): ClawStatus {
  return {
    profile: {
      company: 'Acme Corporation',
      jurisdiction: 'Delaware, USA',
      industry: 'Technology',
      size: 'Mid-market',
      concerns: ['IP protection', 'Vendor contracts', 'Employment'],
      style: 'plain-language',
      intensity: 'standard',
      riskAppetite: 'balanced',
      createdAt: '2025-12-01T00:00:00Z',
    },
    ethicalMode: false,
    paused: false,
    pausedAt: null,
    watchPaths: [
      '/Users/acme/Documents/Legal',
      '/Users/acme/Contracts',
      '/Users/acme/Downloads/Legal-Review',
    ],
    budget: { totalUsd: 50, spentUsd: 23.47, remainingUsd: 26.53, exhausted: false },
    documents: { total: 12, reviewed: 7, flagged: 2, pending: 2, errors: 1, confidential: 3, frontier: 9 },
    sessions: { completed: 8, failed: 1 },
    lastScan: ago(0.25),
    lastHeartbeat: ago(0.05),
    forecast: { pendingCount: 2, estimatedCostUsd: 3.20, budgetAfterUsd: 23.33, confidentialCount: 1, skippedCount: 0 },
    portfolio: {
      totalDocuments: 12,
      findings: { critical: 6, major: 12, minor: 11, total: 29 },
      topDocumentTypes: [{ type: 'NDA', count: 3 }, { type: 'MSA', count: 2 }, { type: 'Employment Agreement', count: 2 }],
      criticalDocuments: [{ name: 'merger-agreement-draft.docx', critical: 3 }, { name: 'cloud-services-msa.pdf', critical: 2 }, { name: 'terms-of-service-v2.pdf', critical: 1 }],
      topPatterns: ['Contract Risk Pattern', 'Dark Pattern Pattern', 'Contract Deviation Pattern'],
      budgetUtilization: 47,
    },
    daemon: { installed: true, running: true, pid: 42847 },
  };
}

export function buildDemoDocuments(): ClawDocument[] {
  return [
    { name: 'vendor-nda-2025.pdf', path: '/Users/acme/Contracts/vendor-nda-2025.pdf', hash: 'a1b2c3d4', type: 'NDA', status: 'reviewed', sizeBytes: 84_200, lastModified: ago(6), lastReviewed: ago(5), findings: { critical: 0, major: 1, minor: 2 }, costUsd: 1.20, error: null, confidential: false },
    { name: 'employment-agreement-template.docx', path: '/Users/acme/Documents/Legal/employment-agreement-template.docx', hash: 'e5f6a7b8', type: 'Employment Agreement', status: 'reviewed', sizeBytes: 124_000, lastModified: ago(12), lastReviewed: ago(11), findings: { critical: 0, major: 0, minor: 1 }, costUsd: 0, error: null, confidential: true },
    { name: 'cloud-services-msa.pdf', path: '/Users/acme/Contracts/cloud-services-msa.pdf', hash: 'c9d0e1f2', type: 'Master Service Agreement', status: 'flagged', sizeBytes: 312_000, lastModified: ago(3), lastReviewed: ago(2.5), findings: { critical: 2, major: 3, minor: 1 }, costUsd: 3.40, error: null, confidential: false },
    { name: 'privacy-policy-v3.md', path: '/Users/acme/Documents/Legal/privacy-policy-v3.md', hash: '13a4b5c6', type: 'Privacy Policy', status: 'reviewed', sizeBytes: 45_600, lastModified: ago(24), lastReviewed: ago(23), findings: { critical: 0, major: 0, minor: 3 }, costUsd: 0.80, error: null, confidential: false },
    { name: 'consulting-agreement.pdf', path: '/Users/acme/Contracts/consulting-agreement.pdf', hash: 'd7e8f9a0', type: 'Consulting Agreement', status: 'processing', sizeBytes: 156_000, lastModified: ago(0.5), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false },
    { name: 'insurance-certificate.pdf', path: '/Users/acme/Downloads/Legal-Review/insurance-certificate.pdf', hash: 'b1c2d3e4', type: 'Insurance', status: 'pending', sizeBytes: 89_000, lastModified: ago(1), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false },
    { name: 'non-compete-clause.docx', path: '/Users/acme/Documents/Legal/non-compete-clause.docx', hash: 'f5a6b7c8', type: 'Non-Compete', status: 'reviewed', sizeBytes: 32_000, lastModified: ago(48), lastReviewed: ago(47), findings: { critical: 0, major: 1, minor: 0 }, costUsd: 0, error: null, confidential: true },
    { name: 'data-processing-addendum.pdf', path: '/Users/acme/Contracts/data-processing-addendum.pdf', hash: 'd9e0f1a2', type: 'DPA', status: 'stale', sizeBytes: 178_000, lastModified: ago(2), lastReviewed: ago(72), findings: { critical: 0, major: 2, minor: 0 }, costUsd: 1.60, error: null, confidential: false },
    { name: 'terms-of-service-v2.pdf', path: '/Users/acme/Documents/Legal/terms-of-service-v2.pdf', hash: 'b3c4d5e6', type: 'Terms of Service', status: 'reviewed', sizeBytes: 267_000, lastModified: ago(18), lastReviewed: ago(17), findings: { critical: 1, major: 2, minor: 3 }, costUsd: 2.90, error: null, confidential: false },
    { name: 'software-license.pdf', path: '/Users/acme/Contracts/software-license.pdf', hash: 'f7a8b9c0', type: 'License Agreement', status: 'error', sizeBytes: 5_400_000, lastModified: ago(4), lastReviewed: null, findings: null, costUsd: null, error: 'PDF parsing failed: unexpected EOF at offset 4,821,003. The file may be corrupted or truncated during transfer.', confidential: false },
    { name: 'merger-agreement-draft.docx', path: '/Users/acme/Documents/Legal/merger-agreement-draft.docx', hash: 'd1e2f3a4', type: 'Merger Agreement', status: 'flagged', sizeBytes: 445_000, lastModified: ago(8), lastReviewed: ago(7), findings: { critical: 3, major: 4, minor: 2 }, costUsd: 0, error: null, confidential: true },
    { name: 'board-resolution.pdf', path: '/Users/acme/Downloads/Legal-Review/board-resolution.pdf', hash: 'b5c6d7e8', type: 'Board Resolution', status: 'pending', sizeBytes: 67_000, lastModified: ago(0.75), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false },
  ];
}

export function buildDemoPrecedents(): DemoPrecedentSummary {
  const precedents: ClawPrecedent[] = [
    { id: 'PREC-demo-001', patternName: 'Contract Risk Pattern', description: 'Unlimited liability exposure without cap — indemnification clause lacks monetary ceiling, exposing party to uncapped damages.', documentType: 'NDA', jurisdiction: 'Delaware, USA', qualityScore: 0.95, effectivenessScore: 0.72, timesUsed: 4, timesQueried: 7, addedAt: ago(72), deprecated: false, relevanceScore: 0.85, evidence: 'Section 4.2: "Company shall indemnify and hold harmless..."', lastOutcome: { sessionId: 'shem-demo-002', timestamp: ago(2.5) } },
    { id: 'PREC-demo-002', patternName: 'Dark Pattern Pattern', description: 'Auto-renewal clause buried in Section 12 with 60-day notice requirement — easily missed by consumers.', documentType: 'Terms of Service', jurisdiction: 'EU', qualityScore: 0.88, effectivenessScore: 0.65, timesUsed: 3, timesQueried: 5, addedAt: ago(120), deprecated: false, relevanceScore: 0.73, evidence: 'Section 12.3: "This agreement shall automatically renew..."', lastOutcome: { sessionId: 'shem-demo-003', timestamp: ago(17) } },
    { id: 'PREC-demo-003', patternName: 'Contract Deviation Pattern', description: 'Non-standard IP assignment clause — assigns all pre-existing IP to employer without carve-out for personal projects.', documentType: 'Employment Agreement', jurisdiction: 'California, USA', qualityScore: 0.91, effectivenessScore: 0.58, timesUsed: 2, timesQueried: 3, addedAt: ago(48), deprecated: false, relevanceScore: 0.68, evidence: 'Section 8.1: "All intellectual property conceived during..."', lastOutcome: { sessionId: 'shem-demo-004', timestamp: ago(11) } },
    { id: 'PREC-demo-004', patternName: 'Adversarial Ambiguity Pattern', description: 'Termination clause uses "reasonable efforts" without defining the standard — ambiguous in dispute.', documentType: 'Master Service Agreement', jurisdiction: 'Delaware, USA', qualityScore: 0.82, effectivenessScore: 0.45, timesUsed: 1, timesQueried: 2, addedAt: ago(168), deprecated: false, relevanceScore: 0.52, evidence: 'Section 9.2: "Either party may terminate upon reasonable efforts to cure..."', lastOutcome: { sessionId: 'shem-demo-002', timestamp: ago(2.5) } },
  ];

  return {
    summary: { total: 4, active: 4, deprecated: 0, topPatterns: ['Contract Risk Pattern', 'Dark Pattern Pattern', 'Contract Deviation Pattern'] },
    precedents,
  };
}

export function buildDemoDeliveries(): ClawDelivery[] {
  return [
    { sessionId: 'shem-demo-001', filename: 'vendor-nda-2025.pdf', type: 'NDA', workflow: 'review', status: 'completed', costUsd: 1.20, durationSeconds: 67, findings: { findingsCount: 3, criticalCount: 0, majorCount: 1, minorCount: 2, resolutionCount: 1 }, completedAt: ago(5), confidential: false },
    { sessionId: 'shem-demo-002', filename: 'cloud-services-msa.pdf', type: 'Master Service Agreement', workflow: 'roundtable', status: 'completed', costUsd: 3.40, durationSeconds: 142, findings: { findingsCount: 6, criticalCount: 2, majorCount: 3, minorCount: 1, resolutionCount: 2 }, diff: { added: 3, resolved: 1, changed: 2, unchanged: 1, previousSessionId: 'shem-demo-prev-002' }, completedAt: ago(2.5), confidential: false },
    { sessionId: 'shem-demo-003', filename: 'terms-of-service-v2.pdf', type: 'Terms of Service', workflow: 'roundtable', status: 'completed', costUsd: 2.90, durationSeconds: 98, findings: { findingsCount: 6, criticalCount: 1, majorCount: 2, minorCount: 3, resolutionCount: 2 }, diff: { added: 1, resolved: 2, changed: 0, unchanged: 3, previousSessionId: 'shem-demo-prev-003' }, completedAt: ago(17), confidential: false },
    { sessionId: 'shem-demo-004', filename: 'employment-agreement-template.docx', type: 'Employment Agreement', workflow: 'review', status: 'completed', costUsd: 0, durationSeconds: 12, findings: { findingsCount: 1, criticalCount: 0, majorCount: 0, minorCount: 1, resolutionCount: 0 }, completedAt: ago(11), confidential: true },
    { sessionId: 'shem-demo-005', filename: 'software-license.pdf', type: 'License Agreement', workflow: 'review', status: 'failed', costUsd: 0.15, durationSeconds: 8, findings: { findingsCount: 0, criticalCount: 0, majorCount: 0, minorCount: 0, resolutionCount: 0 }, completedAt: ago(4), confidential: false },
    { sessionId: 'shem-demo-006', filename: 'privacy-policy-v3.md', type: 'Privacy Policy', workflow: 'review', status: 'completed', costUsd: 0.80, durationSeconds: 45, findings: { findingsCount: 3, criticalCount: 0, majorCount: 0, minorCount: 3, resolutionCount: 1 }, completedAt: ago(23), confidential: false },
  ];
}
