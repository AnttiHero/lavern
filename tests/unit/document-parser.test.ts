/**
 * Unit Tests — Document Parser (src/documents/parser.ts)
 *
 * Tests MIME type routing, plain text parsing, HTML stripping,
 * and extension detection.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDocument,
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../../src/documents/parser.js';

describe('parseDocument', () => {
  // ── Constants ──────────────────────────────────────────────────────

  it('supports expected MIME types', () => {
    expect(SUPPORTED_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(SUPPORTED_MIME_TYPES.has('text/plain')).toBe(true);
    expect(SUPPORTED_MIME_TYPES.has('text/markdown')).toBe(true);
    expect(SUPPORTED_MIME_TYPES.has('text/html')).toBe(true);
    expect(SUPPORTED_MIME_TYPES.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
  });

  it('supports expected file extensions', () => {
    expect(SUPPORTED_EXTENSIONS.has('.pdf')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.docx')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.txt')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.md')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.html')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.htm')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.rtf')).toBe(true);
  });

  it('has 10 MB max file size', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  // ── Plain Text Parsing ─────────────────────────────────────────────

  it('parses plain text', async () => {
    const buffer = Buffer.from('Hello World. This is a test document.');
    const result = await parseDocument(buffer, 'test.txt', 'text/plain');
    expect(result.name).toBe('test.txt');
    expect(result.mimeType).toBe('text/plain');
    expect(result.parseMethod).toBe('plaintext');
    expect(result.fullText).toBe('Hello World. This is a test document.');
    expect(result.wordCount).toBe(7);
  });

  it('parses markdown as plain text', async () => {
    const buffer = Buffer.from('# Heading\n\nSome **bold** text.');
    const result = await parseDocument(buffer, 'doc.md', 'text/markdown');
    expect(result.fullText).toContain('# Heading');
    expect(result.parseMethod).toBe('plaintext');
  });

  it('calculates page count based on word count', async () => {
    // 250 words per page
    const words = Array(500).fill('word').join(' ');
    const buffer = Buffer.from(words);
    const result = await parseDocument(buffer, 'long.txt', 'text/plain');
    expect(result.pageCount).toBe(2);
  });

  it('has minimum 1 page', async () => {
    const buffer = Buffer.from('Short.');
    const result = await parseDocument(buffer, 'short.txt', 'text/plain');
    expect(result.pageCount).toBe(1);
  });

  // ── HTML Stripping ─────────────────────────────────────────────────

  it('strips HTML tags', async () => {
    const html = '<h1>Title</h1><p>Some <strong>bold</strong> text.</p>';
    const buffer = Buffer.from(html);
    const result = await parseDocument(buffer, 'doc.html', 'text/html');
    expect(result.fullText).not.toContain('<h1>');
    expect(result.fullText).not.toContain('<strong>');
    expect(result.fullText).toContain('Title');
    expect(result.fullText).toContain('bold');
  });

  it('strips script and style tags', async () => {
    const html = '<style>body { color: red; }</style><script>alert("xss")</script><p>Content</p>';
    const buffer = Buffer.from(html);
    const result = await parseDocument(buffer, 'page.html', 'text/html');
    expect(result.fullText).not.toContain('color: red');
    expect(result.fullText).not.toContain('alert');
    expect(result.fullText).toContain('Content');
  });

  it('converts HTML entities', async () => {
    const html = '<p>A &amp; B &lt; C &gt; D &nbsp; E</p>';
    const buffer = Buffer.from(html);
    const result = await parseDocument(buffer, 'entities.html', 'text/html');
    expect(result.fullText).toContain('A & B');
    expect(result.fullText).toContain('< C');
    expect(result.fullText).toContain('> D');
  });

  it('converts br and p tags to newlines', async () => {
    const html = '<p>Line one</p><p>Line two</p><br/>Line three';
    const buffer = Buffer.from(html);
    const result = await parseDocument(buffer, 'breaks.html', 'text/html');
    expect(result.fullText).toContain('Line one');
    expect(result.fullText).toContain('Line two');
    expect(result.fullText).toContain('Line three');
  });

  // ── Extension-based routing ────────────────────────────────────────

  it('routes .htm files through HTML parser', async () => {
    const html = '<p>Hello</p>';
    const buffer = Buffer.from(html);
    const result = await parseDocument(buffer, 'page.htm', 'text/html');
    expect(result.fullText).toContain('Hello');
    expect(result.fullText).not.toContain('<p>');
  });

  it('routes by extension when MIME is generic', async () => {
    const buffer = Buffer.from('# Markdown content');
    // Generic MIME but .md extension
    const result = await parseDocument(buffer, 'readme.md', 'text/markdown');
    expect(result.parseMethod).toBe('plaintext');
  });

  // ── Unsupported formats ───────────────────────────────────────────

  it('throws for unsupported MIME type', async () => {
    const buffer = Buffer.from('data');
    await expect(
      parseDocument(buffer, 'file.xyz', 'application/octet-stream'),
    ).rejects.toThrow('Unsupported document type');
  });

  // ── Metadata ───────────────────────────────────────────────────────

  it('generates unique document IDs', async () => {
    const buffer = Buffer.from('Test content');
    const r1 = await parseDocument(buffer, 'a.txt', 'text/plain');
    const r2 = await parseDocument(buffer, 'b.txt', 'text/plain');
    expect(r1.id).not.toBe(r2.id);
    expect(r1.id).toMatch(/^doc-/);
  });

  it('includes file size in result', async () => {
    const text = 'Hello World';
    const buffer = Buffer.from(text);
    const result = await parseDocument(buffer, 'size.txt', 'text/plain');
    expect(result.size).toBe(buffer.length);
  });

  it('includes timestamp', async () => {
    const buffer = Buffer.from('Content');
    const result = await parseDocument(buffer, 'time.txt', 'text/plain');
    expect(result.parsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('detects sections in parsed text', async () => {
    const text = '1. Introduction\nThis is the intro.\n\n2. Background\nSome background.';
    const buffer = Buffer.from(text);
    const result = await parseDocument(buffer, 'doc.txt', 'text/plain');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
  });
});
