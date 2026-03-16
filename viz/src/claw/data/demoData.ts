/**
 * demoData — Synthetic data for Claw Mode when backend is unreachable.
 * 12 documents, 6 deliveries, full status profile.
 */

import type { ClawStatus, ClawDocument, ClawDelivery } from '../hooks/useClawData.js';

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
    daemon: { installed: true, running: true, pid: 42847 },
  };
}

export function buildDemoDocuments(): ClawDocument[] {
  return [
    { name: 'vendor-nda-2025.pdf', path: '/Users/acme/Contracts/vendor-nda-2025.pdf', type: 'NDA', status: 'reviewed', sizeBytes: 84_200, lastModified: ago(6), lastReviewed: ago(5), findings: { critical: 0, major: 1, minor: 2 }, costUsd: 1.20, error: null, confidential: false },
    { name: 'employment-agreement-template.docx', path: '/Users/acme/Documents/Legal/employment-agreement-template.docx', type: 'Employment Agreement', status: 'reviewed', sizeBytes: 124_000, lastModified: ago(12), lastReviewed: ago(11), findings: { critical: 0, major: 0, minor: 1 }, costUsd: 0, error: null, confidential: true },
    { name: 'cloud-services-msa.pdf', path: '/Users/acme/Contracts/cloud-services-msa.pdf', type: 'Master Service Agreement', status: 'flagged', sizeBytes: 312_000, lastModified: ago(3), lastReviewed: ago(2.5), findings: { critical: 2, major: 3, minor: 1 }, costUsd: 3.40, error: null, confidential: false },
    { name: 'privacy-policy-v3.md', path: '/Users/acme/Documents/Legal/privacy-policy-v3.md', type: 'Privacy Policy', status: 'reviewed', sizeBytes: 45_600, lastModified: ago(24), lastReviewed: ago(23), findings: { critical: 0, major: 0, minor: 3 }, costUsd: 0.80, error: null, confidential: false },
    { name: 'consulting-agreement.pdf', path: '/Users/acme/Contracts/consulting-agreement.pdf', type: 'Consulting Agreement', status: 'processing', sizeBytes: 156_000, lastModified: ago(0.5), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false },
    { name: 'insurance-certificate.pdf', path: '/Users/acme/Downloads/Legal-Review/insurance-certificate.pdf', type: 'Insurance', status: 'pending', sizeBytes: 89_000, lastModified: ago(1), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false },
    { name: 'non-compete-clause.docx', path: '/Users/acme/Documents/Legal/non-compete-clause.docx', type: 'Non-Compete', status: 'reviewed', sizeBytes: 32_000, lastModified: ago(48), lastReviewed: ago(47), findings: { critical: 0, major: 1, minor: 0 }, costUsd: 0, error: null, confidential: true },
    { name: 'data-processing-addendum.pdf', path: '/Users/acme/Contracts/data-processing-addendum.pdf', type: 'DPA', status: 'stale', sizeBytes: 178_000, lastModified: ago(2), lastReviewed: ago(72), findings: { critical: 0, major: 2, minor: 0 }, costUsd: 1.60, error: null, confidential: false },
    { name: 'terms-of-service-v2.pdf', path: '/Users/acme/Documents/Legal/terms-of-service-v2.pdf', type: 'Terms of Service', status: 'reviewed', sizeBytes: 267_000, lastModified: ago(18), lastReviewed: ago(17), findings: { critical: 1, major: 2, minor: 3 }, costUsd: 2.90, error: null, confidential: false },
    { name: 'software-license.pdf', path: '/Users/acme/Contracts/software-license.pdf', type: 'License Agreement', status: 'error', sizeBytes: 5_400_000, lastModified: ago(4), lastReviewed: null, findings: null, costUsd: null, error: 'PDF parsing failed — file may be corrupted', confidential: false },
    { name: 'merger-agreement-draft.docx', path: '/Users/acme/Documents/Legal/merger-agreement-draft.docx', type: 'Merger Agreement', status: 'flagged', sizeBytes: 445_000, lastModified: ago(8), lastReviewed: ago(7), findings: { critical: 3, major: 4, minor: 2 }, costUsd: 0, error: null, confidential: true },
    { name: 'board-resolution.pdf', path: '/Users/acme/Downloads/Legal-Review/board-resolution.pdf', type: 'Board Resolution', status: 'pending', sizeBytes: 67_000, lastModified: ago(0.75), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false },
  ];
}

export function buildDemoDeliveries(): ClawDelivery[] {
  return [
    { sessionId: 'shem-demo-001', filename: 'vendor-nda-2025.pdf', type: 'NDA', workflow: 'review', status: 'completed', costUsd: 1.20, durationSeconds: 67, findings: { findingsCount: 3, criticalCount: 0, majorCount: 1, minorCount: 2, resolutionCount: 1 }, completedAt: ago(5), confidential: false },
    { sessionId: 'shem-demo-002', filename: 'cloud-services-msa.pdf', type: 'Master Service Agreement', workflow: 'roundtable', status: 'completed', costUsd: 3.40, durationSeconds: 142, findings: { findingsCount: 6, criticalCount: 2, majorCount: 3, minorCount: 1, resolutionCount: 2 }, completedAt: ago(2.5), confidential: false },
    { sessionId: 'shem-demo-003', filename: 'terms-of-service-v2.pdf', type: 'Terms of Service', workflow: 'roundtable', status: 'completed', costUsd: 2.90, durationSeconds: 98, findings: { findingsCount: 6, criticalCount: 1, majorCount: 2, minorCount: 3, resolutionCount: 2 }, completedAt: ago(17), confidential: false },
    { sessionId: 'shem-demo-004', filename: 'employment-agreement-template.docx', type: 'Employment Agreement', workflow: 'review', status: 'completed', costUsd: 0, durationSeconds: 12, findings: { findingsCount: 1, criticalCount: 0, majorCount: 0, minorCount: 1, resolutionCount: 0 }, completedAt: ago(11), confidential: true },
    { sessionId: 'shem-demo-005', filename: 'software-license.pdf', type: 'License Agreement', workflow: 'review', status: 'failed', costUsd: 0.15, durationSeconds: 8, findings: { findingsCount: 0, criticalCount: 0, majorCount: 0, minorCount: 0, resolutionCount: 0 }, completedAt: ago(4), confidential: false },
    { sessionId: 'shem-demo-006', filename: 'privacy-policy-v3.md', type: 'Privacy Policy', workflow: 'review', status: 'completed', costUsd: 0.80, durationSeconds: 45, findings: { findingsCount: 3, criticalCount: 0, majorCount: 0, minorCount: 3, resolutionCount: 1 }, completedAt: ago(23), confidential: false },
  ];
}
