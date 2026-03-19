/**
 * Document Templates — Common legal document starting points.
 *
 * Each template has metadata (for listing) and markdown content (for use).
 * Templates use [PLACEHOLDER] fields that the user fills during briefing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TemplateMeta {
  id: string;
  name: string;
  category: string;
  description: string;
  filename: string;
}

const TEMPLATES: TemplateMeta[] = [
  {
    id: 'nda-mutual',
    name: 'Mutual NDA',
    category: 'Confidentiality',
    description: 'Two-way non-disclosure agreement for business discussions.',
    filename: 'nda-mutual.md',
  },
  {
    id: 'nda-one-way',
    name: 'One-Way NDA',
    category: 'Confidentiality',
    description: 'One-way NDA where only one party discloses confidential information.',
    filename: 'nda-one-way.md',
  },
  {
    id: 'saas-agreement',
    name: 'SaaS Agreement',
    category: 'Technology',
    description: 'Software-as-a-service subscription agreement.',
    filename: 'saas-agreement.md',
  },
  {
    id: 'terms-of-service',
    name: 'Terms of Service',
    category: 'Consumer',
    description: 'Website or application terms of service.',
    filename: 'terms-of-service.md',
  },
  {
    id: 'privacy-policy',
    name: 'Privacy Policy',
    category: 'Compliance',
    description: 'GDPR-compatible privacy policy for web services.',
    filename: 'privacy-policy.md',
  },
  {
    id: 'consulting-agreement',
    name: 'Consulting Agreement',
    category: 'Services',
    description: 'Independent contractor / consulting services agreement.',
    filename: 'consulting-agreement.md',
  },
];

/** List all available templates (metadata only). */
export function listTemplates(): TemplateMeta[] {
  return TEMPLATES;
}

/** Get a single template's content by ID. Returns null if not found. */
export function getTemplateContent(id: string): { meta: TemplateMeta; content: string } | null {
  const meta = TEMPLATES.find(t => t.id === id);
  if (!meta) return null;

  const filePath = path.join(__dirname, 'docs', meta.filename);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { meta, content };
  } catch {
    return null;
  }
}
