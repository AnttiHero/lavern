/**
 * Practice area options for the agent builder.
 * Grouped by domain for the chip picker UI.
 */

export interface PracticeAreaGroup {
  label: string;
  areas: string[];
}

export const PRACTICE_AREA_GROUPS: PracticeAreaGroup[] = [
  {
    label: 'Corporate',
    areas: [
      'Mergers & Acquisitions',
      'Corporate Governance',
      'Securities & Capital Markets',
      'Private Equity & Venture Capital',
      'Joint Ventures',
    ],
  },
  {
    label: 'Commercial',
    areas: [
      'Contract Law',
      'Commercial Agreements',
      'SaaS & Technology',
      'Supply Chain & Procurement',
      'Franchise & Distribution',
    ],
  },
  {
    label: 'Regulatory',
    areas: [
      'Compliance & Risk',
      'Data Privacy & GDPR',
      'Antitrust & Competition',
      'Sanctions & Export Control',
      'Environmental & ESG',
    ],
  },
  {
    label: 'Dispute',
    areas: [
      'Litigation',
      'Arbitration',
      'Mediation & ADR',
      'Regulatory Investigations',
      'Insurance & Claims',
    ],
  },
  {
    label: 'Specialist',
    areas: [
      'Intellectual Property',
      'Employment & Labor',
      'Real Estate',
      'Tax',
      'Banking & Finance',
      'Healthcare & Life Sciences',
      'Energy & Infrastructure',
      'Media & Entertainment',
    ],
  },
  {
    label: 'Design',
    areas: [
      'Legal Design',
      'Plain Language',
      'Accessibility',
      'Document Architecture',
      'User Research',
    ],
  },
];

/** Flat list of all practice areas. */
export const ALL_PRACTICE_AREAS = PRACTICE_AREA_GROUPS.flatMap(g => g.areas);
