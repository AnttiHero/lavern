/**
 * Foundation framework definitions — ships with the product.
 * These represent "what the agents studied in law school."
 */

export interface FoundationItem {
  id: string;
  name: string;
  description: string;
  category: 'checklist' | 'framework' | 'standard' | 'guide';
  wordEstimate: number;
}

export const FOUNDATIONS: FoundationItem[] = [
  {
    id: 'nda-review',
    name: 'NDA Review Checklist',
    description: 'Scope of confidential information, exclusions, term and termination, permitted disclosures, and remedies.',
    category: 'checklist',
    wordEstimate: 3200,
  },
  {
    id: 'contract-risk',
    name: 'Contract Risk Patterns',
    description: 'Liability caps, indemnification asymmetries, IP ownership gaps, automatic renewals, and unilateral amendment rights.',
    category: 'framework',
    wordEstimate: 4500,
  },
  {
    id: 'readability-standards',
    name: 'Readability Standards',
    description: 'Flesch-Kincaid scoring, sentence length guidelines, passive voice limits, and cross-reference depth rules.',
    category: 'standard',
    wordEstimate: 2800,
  },
  {
    id: 'plain-language',
    name: 'Plain Language Rules',
    description: 'Term substitution tables, sentence structure rules, defined term conventions, and cross-reference formatting.',
    category: 'guide',
    wordEstimate: 3600,
  },
  {
    id: 'verification-framework',
    name: 'Verification Framework',
    description: 'How agents validate that legal effect, monetary amounts, time periods, and jurisdiction survive redesign.',
    category: 'framework',
    wordEstimate: 2100,
  },
];
