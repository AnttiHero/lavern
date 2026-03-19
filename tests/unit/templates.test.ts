/**
 * Unit Tests — Document Templates (v0.12)
 *
 * Tests template listing, retrieval, and content validation.
 */

import { describe, it, expect } from 'vitest';
import { listTemplates, getTemplateContent } from '../../src/templates/index.js';

describe('document templates', () => {
  it('lists all templates', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(6);
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });

  it('retrieves template content by ID', () => {
    const result = getTemplateContent('nda-mutual');
    expect(result).not.toBeNull();
    expect(result!.meta.id).toBe('nda-mutual');
    expect(result!.content.length).toBeGreaterThan(100);
  });

  it('returns null for unknown template', () => {
    const result = getTemplateContent('nonexistent');
    expect(result).toBeNull();
  });

  it('all templates have readable content files', () => {
    const templates = listTemplates();
    for (const t of templates) {
      const result = getTemplateContent(t.id);
      expect(result, `Template ${t.id} should have content`).not.toBeNull();
      expect(result!.content.length).toBeGreaterThan(50);
    }
  });

  it('templates contain placeholder fields', () => {
    const result = getTemplateContent('nda-mutual');
    expect(result!.content).toContain('[');
    expect(result!.content).toContain(']');
  });

  it('template IDs are unique', () => {
    const templates = listTemplates();
    const ids = templates.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('template categories are set', () => {
    const templates = listTemplates();
    const categories = [...new Set(templates.map(t => t.category))];
    expect(categories.length).toBeGreaterThanOrEqual(3);
  });
});
