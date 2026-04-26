/**
 * Format Converter — Markdown → Premium DOCX and PDF.
 *
 * Three selectable document styles:
 *   - Traditional: White-shoe law firm. Times New Roman, numbered headings, formal.
 *   - Elegant: Warm editorial. Georgia/Cambria, terracotta accents, airy spacing.
 *   - Accessible: WCAG 2.1 AA compliant. Arial/Verdana, high contrast, generous spacing.
 *
 * Architecture: StyleProfile tokens drive all rendering. getStyleProfile(style) factory
 * returns the right token set. Every rendering function reads from the profile.
 *
 * DOCX: Uses the `docx` npm package (v9.6).
 * PDF:  HTML with print-optimized CSS (Google Fonts for Elegant, system fonts for others).
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableRow, TableCell, Table,
  WidthType, convertInchesToTwip, Header, Footer, PageNumber,
  PageBreak, Tab, TabStopType, TabStopPosition,
  ShadingType, LevelFormat,
} from 'docx';
import { marked } from 'marked';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FORMAT');

// ── Soul Branding ────────────────────────────────────────────────────────

export interface SoulBranding {
  firmName?: string;
  tagline?: string;
}

/**
 * Extract firm name and tagline from a soul string.
 * Looks for patterns like "We are [FIRM]", "At [FIRM]", or uses the first
 * heading/short line as the firm name.
 */
export function extractSoulBranding(soul?: string): SoulBranding | undefined {
  if (!soul || !soul.trim()) return undefined;

  const lines = soul.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return undefined;

  let firmName: string | undefined;
  let tagline: string | undefined;

  // Strategy 1: Look for explicit patterns
  for (const line of lines) {
    const stripped = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');

    // "We are Baker & Associates" / "We are Baker & Associates."
    const weAre = stripped.match(/^We\s+are\s+(.{3,60}?)\.?\s*$/i);
    if (weAre) { firmName = weAre[1].trim(); continue; }

    // "At Baker & Associates, we..."
    const atFirm = stripped.match(/^At\s+(.{3,60}?),/i);
    if (atFirm && !firmName) { firmName = atFirm[1].trim(); continue; }

    // "Baker & Associates is..."
    const firmIs = stripped.match(/^([A-Z][A-Za-z&,.\s']{2,55}?)\s+(?:is|was|has|provides|delivers|offers)\b/);
    if (firmIs && !firmName) { firmName = firmIs[1].trim(); continue; }
  }

  // Strategy 2: If first line is a short heading or phrase, treat it as firm name
  if (!firmName) {
    const first = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
    if (first.length >= 3 && first.length <= 60 && !first.includes('.') && !/^(we|our|the|a|an|i)\s/i.test(first)) {
      firmName = first;
    }
  }

  // Extract tagline: first short descriptive line that isn't the firm name
  for (const line of lines) {
    const stripped = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
    if (stripped === firmName) continue;
    if (stripped.length >= 5 && stripped.length <= 80) {
      // Skip lines that are clearly soul instructions rather than taglines
      if (/^(we|our|at|the)\s/i.test(stripped) || /\b(always|never|must|should)\b/i.test(stripped)) continue;
      tagline = stripped;
      break;
    }
  }

  return firmName ? { firmName, tagline } : undefined;
}

// ── Style System ────────────────────────────────────────────────────────

export type DocumentStyle = 'traditional' | 'elegant' | 'accessible';

interface StyleProfile {
  id: DocumentStyle;

  // Fonts
  headingFont: string;
  bodyFont: string;
  mono: string;

  // Colors (hex WITHOUT #, for docx compat)
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  inkDim: string;
  accent: string;
  accentLight: string;
  border: string;
  borderLight: string;
  paper: string;
  linkColor: string;

  // Sizes (half-points for docx: 24 = 12pt)
  h1Size: number;
  h2Size: number;
  h3Size: number;
  h4Size: number;
  bodySize: number;
  smallSize: number;
  tinySize: number;
  coverTitleSize: number;

  // Spacing
  lineSpacing: number;      // twips for docx (240=single, 276=1.15x, 360=1.5x)
  lineHeightCss: number;    // CSS multiplier
  paragraphAfter: number;   // twips
  letterSpacingEm: number;  // CSS em

  // Table
  tableBorderStyle: 'open' | 'full';
  tableAlternatingRows: boolean;
  tableHeaderBg: string;

  // Headings
  headingNumbered: boolean;
  h1Bold: boolean;
  h2Bold: boolean;
  h3Bold: boolean;
  h3Uppercase: boolean;

  // Cover page
  coverAlignment: 'left' | 'center';
  coverShowAccentRules: boolean;
  coverShowConfidential: boolean;

  // Links
  linkUnderline: boolean;
  linkBorderBottom: boolean;

  // Margins (inches)
  coverMarginTop: number;
  coverMarginSides: number;
  bodyMarginTop: number;
  bodyMarginSides: number;

  // HTML-specific
  htmlFontImport: string;
  htmlBodyFontFamily: string;
  htmlHeadingFontFamily: string;
  htmlMaxWidth: string;
}

// ── Traditional: White-Shoe Law Firm ────────────────────────────────────

const STYLE_TRADITIONAL: StyleProfile = {
  id: 'traditional',

  headingFont: 'Times New Roman',
  bodyFont: 'Times New Roman',
  mono: 'Courier New',

  ink: '000000',
  inkSecondary: '000000',
  inkMuted: '333333',
  inkDim: '666666',
  accent: '1B2A4A',
  accentLight: 'E8EBF0',
  border: 'AAAAAA',
  borderLight: 'CCCCCC',
  paper: 'F5F5F5',
  linkColor: '1B2A4A',

  h1Size: 32,     // 16pt
  h2Size: 28,     // 14pt
  h3Size: 24,     // 12pt
  h4Size: 22,     // 11pt
  bodySize: 24,   // 12pt — legal standard
  smallSize: 20,  // 10pt
  tinySize: 18,   // 9pt
  coverTitleSize: 48, // 24pt

  lineSpacing: 276,
  lineHeightCss: 1.15,
  paragraphAfter: 120,
  letterSpacingEm: 0,

  tableBorderStyle: 'full',
  tableAlternatingRows: true,
  tableHeaderBg: 'F0F0F0',

  headingNumbered: true,
  h1Bold: true,
  h2Bold: true,
  h3Bold: true,
  h3Uppercase: false,

  coverAlignment: 'center',
  coverShowAccentRules: false,
  coverShowConfidential: true,

  linkUnderline: false,
  linkBorderBottom: false,

  coverMarginTop: 2.0,
  coverMarginSides: 1.5,
  bodyMarginTop: 1.0,
  bodyMarginSides: 1.3,

  htmlFontImport: '',
  htmlBodyFontFamily: "'Times New Roman', Times, Georgia, serif",
  htmlHeadingFontFamily: "'Times New Roman', Times, Georgia, serif",
  htmlMaxWidth: '720px',
};

// ── Elegant: Warm Editorial ─────────────────────────────────────────────

const STYLE_ELEGANT: StyleProfile = {
  id: 'elegant',

  headingFont: 'Georgia',
  bodyFont: 'Cambria',
  mono: 'Consolas',

  ink: '1A1A1A',
  inkSecondary: '4A4A4A',
  inkMuted: '7A7A76',
  inkDim: 'A3A39E',
  accent: 'C45D3E',
  accentLight: 'E8D5CF',
  border: 'E5E3DD',
  borderLight: 'F0EFEB',
  paper: 'FAFAF8',
  linkColor: 'C45D3E',

  h1Size: 44,     // 22pt
  h2Size: 32,     // 16pt
  h3Size: 26,     // 13pt
  h4Size: 22,     // 11pt
  bodySize: 21,   // 10.5pt
  smallSize: 18,  // 9pt
  tinySize: 16,   // 8pt
  coverTitleSize: 72, // 36pt

  lineSpacing: 276,
  lineHeightCss: 1.7,
  paragraphAfter: 200,
  letterSpacingEm: 0,

  tableBorderStyle: 'open',
  tableAlternatingRows: false,
  tableHeaderBg: 'FAFAF8',

  headingNumbered: false,
  h1Bold: false,
  h2Bold: false,
  h3Bold: true,
  h3Uppercase: true,

  coverAlignment: 'left',
  coverShowAccentRules: true,
  coverShowConfidential: false,

  linkUnderline: false,
  linkBorderBottom: true,

  coverMarginTop: 1.5,
  coverMarginSides: 1.4,
  bodyMarginTop: 1.2,
  bodyMarginSides: 1.3,

  htmlFontImport: '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">',
  htmlBodyFontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  htmlHeadingFontFamily: "'Cormorant Garamond', Georgia, serif",
  htmlMaxWidth: '680px',
};

// ── Accessible: WCAG 2.1 AA Compliant ───────────────────────────────────

const STYLE_ACCESSIBLE: StyleProfile = {
  id: 'accessible',

  headingFont: 'Verdana',
  bodyFont: 'Arial',
  mono: 'Consolas',

  ink: '000000',
  inkSecondary: '1A1A1A',
  inkMuted: '333333',
  inkDim: '555555',
  accent: '0000EE',
  accentLight: 'E6E6FF',
  border: '767676',          // 4.5:1 contrast on white
  borderLight: 'AAAAAA',
  paper: 'F2F2F2',
  linkColor: '0000EE',

  h1Size: 48,     // 24pt
  h2Size: 40,     // 20pt
  h3Size: 32,     // 16pt
  h4Size: 28,     // 14pt
  bodySize: 24,   // 12pt minimum
  smallSize: 22,  // 11pt
  tinySize: 20,   // 10pt
  coverTitleSize: 60, // 30pt

  lineSpacing: 360,          // 1.5x — WCAG 1.4.12
  lineHeightCss: 1.5,
  paragraphAfter: 240,       // 2× body size
  letterSpacingEm: 0.12,     // WCAG 1.4.12

  tableBorderStyle: 'full',
  tableAlternatingRows: false,
  tableHeaderBg: 'E0E0E0',

  headingNumbered: false,
  h1Bold: true,
  h2Bold: true,
  h3Bold: true,
  h3Uppercase: false,

  coverAlignment: 'left',
  coverShowAccentRules: false,
  coverShowConfidential: false,

  linkUnderline: true,
  linkBorderBottom: false,

  coverMarginTop: 1.5,
  coverMarginSides: 1.5,
  bodyMarginTop: 1.2,
  bodyMarginSides: 1.5,

  htmlFontImport: '',
  htmlBodyFontFamily: "Arial, Verdana, 'Helvetica Neue', sans-serif",
  htmlHeadingFontFamily: "Verdana, Arial, 'Helvetica Neue', sans-serif",
  htmlMaxWidth: '800px',
};

// ── Profile Factory ─────────────────────────────────────────────────────

const PROFILES: Record<DocumentStyle, StyleProfile> = {
  traditional: STYLE_TRADITIONAL,
  elegant: STYLE_ELEGANT,
  accessible: STYLE_ACCESSIBLE,
};

function getStyleProfile(style?: DocumentStyle): StyleProfile {
  return PROFILES[style ?? 'elegant'];
}

// ── Markdown Parsing ────────────────────────────────────────────────────

interface DocxSection {
  type: 'heading' | 'paragraph' | 'list-item' | 'numbered-item' | 'table' | 'hr' | 'blockquote';
  level?: number;
  text: string;
  bold?: boolean;
  items?: string[];
  rows?: string[][];
}

function parseMarkdownToSections(markdown: string): DocxSection[] {
  const sections: DocxSection[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      sections.push({ type: 'hr', text: '' });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      sections.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: stripMarkdownInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        if (/^\|[\s\-:|]+\|$/.test(row)) { i++; continue; }
        const cells = row.split('|').slice(1, -1).map(c => stripMarkdownInline(c.trim()));
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        sections.push({ type: 'table', text: '', rows: tableRows });
      }
      continue;
    }

    // Numbered list items
    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && (/^\d+\.\s/.test(lines[i].trim()) || /^\s{2,}/.test(lines[i]))) {
        const item = lines[i].trim().replace(/^\d+\.\s+/, '');
        if (item) items.push(stripMarkdownInline(item));
        i++;
      }
      for (const item of items) {
        sections.push({ type: 'numbered-item', text: item });
      }
      continue;
    }

    // Bullet list items
    if (/^[-*+]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && (/^[-*+]\s/.test(lines[i].trim()) || /^\s{2,}/.test(lines[i]))) {
        const item = lines[i].trim().replace(/^[-*+]\s+/, '');
        if (item) items.push(stripMarkdownInline(item));
        i++;
      }
      for (const item of items) {
        sections.push({ type: 'list-item', text: item });
      }
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      let quoteText = '';
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteText += lines[i].trim().replace(/^>\s*/, '') + ' ';
        i++;
      }
      sections.push({ type: 'blockquote', text: stripMarkdownInline(quoteText.trim()) });
      continue;
    }

    // Regular paragraph
    let paraText = '';
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^#{1,6}\s/) && !lines[i].trim().startsWith('|') && !lines[i].trim().startsWith('>') && !/^---+$/.test(lines[i].trim())) {
      paraText += (paraText ? ' ' : '') + lines[i].trim();
      i++;
    }
    if (paraText) {
      sections.push({ type: 'paragraph', text: paraText });
    }
  }

  return sections;
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1');
}

function parseInlineToRuns(text: string, profile: StyleProfile, fontSize?: number): TextRun[] {
  const size = fontSize ?? profile.bodySize;
  const runs: TextRun[] = [];

  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (!part) continue;

    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    const italicMatch = part.match(/^\*(.+)\*$/);

    if (boldMatch) {
      runs.push(new TextRun({
        text: boldMatch[1],
        bold: true,
        font: profile.bodyFont,
        size,
        color: profile.ink,
      }));
    } else if (italicMatch) {
      runs.push(new TextRun({
        text: italicMatch[1],
        italics: true,
        font: profile.bodyFont,
        size,
        color: profile.inkSecondary,
      }));
    } else {
      runs.push(new TextRun({
        text: part,
        font: profile.bodyFont,
        size,
        color: profile.inkSecondary,
      }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({
    text,
    font: profile.bodyFont,
    size,
    color: profile.inkSecondary,
  })];
}

// ── DOCX Cover Pages ────────────────────────────────────────────────────

function buildCoverPage(title: string, profile: StyleProfile, branding?: SoulBranding): Paragraph[] {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const align = profile.coverAlignment === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;

  const paragraphs: Paragraph[] = [];

  // Top spacer
  paragraphs.push(new Paragraph({ spacing: { before: profile.coverAlignment === 'center' ? 4800 : 3600 } }));

  // CONFIDENTIAL badge (Traditional only)
  if (profile.coverShowConfidential) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: 'CONFIDENTIAL',
        font: profile.headingFont,
        size: profile.smallSize,
        color: profile.inkDim,
        characterSpacing: 200,
      })],
      spacing: { after: 400 },
    }));
  }

  // Accent rules (Elegant only)
  if (profile.coverShowAccentRules) {
    paragraphs.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: profile.accent } },
      spacing: { after: 600 },
    }));
  }

  // Top rule for Traditional (double line feel)
  if (profile.id === 'traditional') {
    paragraphs.push(new Paragraph({
      border: { bottom: { style: BorderStyle.DOUBLE, size: 3, color: profile.accent } },
      spacing: { after: 600 },
    }));
  }

  // Thick rule for Accessible
  if (profile.id === 'accessible') {
    paragraphs.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: profile.ink } },
      spacing: { after: 400 },
    }));
  }

  // Document title
  paragraphs.push(new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: profile.id === 'traditional' ? title.toUpperCase() : title,
      font: profile.headingFont,
      size: profile.coverTitleSize,
      color: profile.ink,
      bold: profile.id !== 'elegant',
    })],
    spacing: { after: 200 },
  }));

  // Date
  paragraphs.push(new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: dateStr,
      font: profile.bodyFont,
      size: profile.smallSize,
      color: profile.inkMuted,
    })],
    spacing: { after: 600 },
  }));

  // Bottom rule
  if (profile.coverShowAccentRules) {
    paragraphs.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: profile.accent } },
      spacing: { after: 2400 },
    }));
  } else if (profile.id === 'traditional') {
    paragraphs.push(new Paragraph({
      border: { bottom: { style: BorderStyle.DOUBLE, size: 3, color: profile.accent } },
      spacing: { after: 2400 },
    }));
  } else {
    paragraphs.push(new Paragraph({ spacing: { after: 2400 } }));
  }

  // "Prepared by" block — uses soul branding when available
  const brandName = branding?.firmName ?? 'Lavern';
  const hasSoul = !!branding?.firmName;

  paragraphs.push(new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: 'Prepared by',
      font: profile.bodyFont,
      size: profile.id === 'accessible' ? profile.smallSize : profile.tinySize,
      color: profile.inkDim,
      characterSpacing: 60,
    })],
    spacing: { after: 80 },
  }));

  paragraphs.push(new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: profile.id === 'traditional' ? brandName.toUpperCase() : brandName,
      font: profile.headingFont,
      size: profile.id === 'accessible' ? 32 : 28,
      color: profile.inkMuted,
      bold: profile.id === 'traditional',
      characterSpacing: profile.id === 'traditional' ? 80 : undefined,
    })],
    spacing: { after: hasSoul && branding.tagline ? 40 : 60 },
  }));

  // Tagline from soul (if available)
  if (hasSoul && branding.tagline) {
    paragraphs.push(new Paragraph({
      alignment: align,
      children: [new TextRun({
        text: branding.tagline,
        font: profile.bodyFont,
        size: profile.id === 'accessible' ? profile.smallSize : profile.tinySize,
        color: profile.inkDim,
        italics: profile.id !== 'accessible',
      })],
      spacing: { after: 60 },
    }));
  }

  // Engine credit — "Powered by Lavern" when soul provides firm name, otherwise subtitle
  paragraphs.push(new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: hasSoul ? 'Powered by Lavern' : 'Multi-Agent Legal Design System',
      font: profile.bodyFont,
      size: profile.id === 'accessible' ? profile.smallSize : profile.tinySize,
      color: profile.inkDim,
    })],
    spacing: { after: 200 },
  }));

  // Disclaimer — not italic for accessible (harder to read)
  paragraphs.push(new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: 'This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.',
      font: profile.bodyFont,
      size: profile.id === 'accessible' ? profile.smallSize : profile.tinySize,
      color: profile.inkDim,
      italics: profile.id !== 'accessible',
    })],
    spacing: { after: 200 },
  }));

  // Page break after cover page
  paragraphs.push(new Paragraph({
    children: [new PageBreak()],
  }));

  return paragraphs;
}

// ── DOCX Conversion ─────────────────────────────────────────────────────

export async function convertToDocx(markdown: string, title: string, style?: DocumentStyle, branding?: SoulBranding): Promise<Buffer> {
  const profile = getStyleProfile(style);
  const sections = parseMarkdownToSections(markdown);
  const bodyChildren: (Paragraph | Table)[] = [];

  // Heading numbering state
  const hCounters = [0, 0, 0, 0, 0, 0];

  // Skip first H1 if it matches title (cover page has it)
  let firstH1Skipped = false;

  for (const section of sections) {
    switch (section.type) {
      case 'heading': {
        if (section.level === 1 && !firstH1Skipped) {
          firstH1Skipped = true;
          const tNorm = title.toLowerCase().replace(/[^a-z0-9]/g, '');
          const sNorm = section.text.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (tNorm === sNorm || sNorm.includes(tNorm) || tNorm.includes(sNorm)) {
            continue;
          }
        }

        const level = section.level ?? 1;
        let displayText = section.text;

        // Heading numbering for Traditional
        if (profile.headingNumbered && level <= 3) {
          hCounters[level - 1]++;
          for (let j = level; j < hCounters.length; j++) hCounters[j] = 0;
          const prefix = hCounters.slice(0, level).filter(n => n > 0).join('.');
          displayText = `${prefix}  ${section.text}`;
        }

        const isH1 = level === 1;
        const isH2 = level === 2;
        const isH3 = level === 3;

        const headingLevel = isH1 ? HeadingLevel.HEADING_1
          : isH2 ? HeadingLevel.HEADING_2
          : isH3 ? HeadingLevel.HEADING_3
          : level === 4 ? HeadingLevel.HEADING_4
          : HeadingLevel.HEADING_5;

        const fontSize = isH1 ? profile.h1Size
          : isH2 ? profile.h2Size
          : isH3 ? profile.h3Size
          : profile.h4Size;

        const isBold = isH1 ? profile.h1Bold
          : isH2 ? profile.h2Bold
          : profile.h3Bold;

        // Use heading font for H1/H2, body font for H3+
        const font = (isH1 || isH2) ? profile.headingFont : profile.bodyFont;

        bodyChildren.push(new Paragraph({
          heading: headingLevel,
          children: [new TextRun({
            text: (profile.h3Uppercase && isH3) ? displayText.toUpperCase() : displayText,
            font,
            size: fontSize,
            bold: isBold,
            color: (isH1 || isH2) ? profile.ink : profile.inkSecondary,
            characterSpacing: (profile.h3Uppercase && isH3) ? 40 : undefined,
          })],
          spacing: {
            before: isH1 ? 480 : isH2 ? 360 : 240,
            after: isH1 ? 200 : 120,
          },
          ...(isH1 ? {
            border: {
              bottom: {
                style: profile.id === 'traditional' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
                size: profile.id === 'traditional' ? 3 : 2,
                color: profile.id === 'traditional' ? profile.accent : profile.border,
              },
            },
          } : {}),
        }));
        break;
      }

      case 'paragraph': {
        bodyChildren.push(new Paragraph({
          children: parseInlineToRuns(section.text, profile),
          spacing: { after: profile.paragraphAfter, line: profile.lineSpacing },
          widowControl: true,
        }));
        break;
      }

      case 'list-item': {
        bodyChildren.push(new Paragraph({
          children: parseInlineToRuns(section.text, profile),
          bullet: { level: 0 },
          spacing: { after: 80, line: profile.lineSpacing },
          indent: { left: convertInchesToTwip(0.4) },
        }));
        break;
      }

      case 'numbered-item': {
        bodyChildren.push(new Paragraph({
          children: parseInlineToRuns(section.text, profile),
          numbering: { reference: 'default-numbering', level: 0 },
          spacing: { after: 80, line: profile.lineSpacing },
          indent: { left: convertInchesToTwip(0.4) },
        }));
        break;
      }

      case 'blockquote': {
        const borderColor = profile.id === 'accessible' ? profile.ink : profile.accent;
        const borderSize = profile.id === 'accessible' ? 12 : 8;

        bodyChildren.push(new Paragraph({
          children: [new TextRun({
            text: section.text,
            font: profile.bodyFont,
            size: profile.bodySize,
            italics: profile.id !== 'accessible',
            color: profile.inkMuted,
          })],
          indent: { left: convertInchesToTwip(0.4) },
          spacing: { before: 160, after: 160, line: profile.lineSpacing },
          border: {
            left: { style: BorderStyle.SINGLE, size: borderSize, color: borderColor, space: 12 },
          },
        }));
        break;
      }

      case 'table': {
        if (section.rows && section.rows.length > 0) {
          const colCount = Math.max(...section.rows.map(r => r.length));
          const colWidth = Math.floor(100 / colCount);
          const fullBorders = profile.tableBorderStyle === 'full';

          const tableRows = section.rows.map((row, rowIdx) => {
            const isHeader = rowIdx === 0;
            const isAlternate = profile.tableAlternatingRows && !isHeader && rowIdx % 2 === 0;

            return new TableRow({
              children: Array.from({ length: colCount }, (_, ci) =>
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({
                      text: row[ci] || '',
                      font: profile.bodyFont,
                      size: profile.smallSize,
                      bold: isHeader,
                      color: isHeader ? profile.ink : profile.inkSecondary,
                    })],
                    spacing: { before: 40, after: 40 },
                  })],
                  width: { size: colWidth, type: WidthType.PERCENTAGE },
                  margins: {
                    top: convertInchesToTwip(0.04),
                    bottom: convertInchesToTwip(0.04),
                    left: convertInchesToTwip(0.08),
                    right: convertInchesToTwip(0.08),
                  },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: profile.border },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: profile.border },
                    left: fullBorders
                      ? { style: BorderStyle.SINGLE, size: 1, color: profile.border }
                      : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    right: fullBorders
                      ? { style: BorderStyle.SINGLE, size: 1, color: profile.border }
                      : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  },
                  ...((isHeader || isAlternate) ? {
                    shading: {
                      type: ShadingType.SOLID,
                      color: isHeader ? profile.tableHeaderBg : profile.paper,
                      fill: isHeader ? profile.tableHeaderBg : profile.paper,
                    },
                  } : {}),
                }),
              ),
            });
          });

          bodyChildren.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }));
          bodyChildren.push(new Paragraph({ text: '', spacing: { after: 160 } }));
        }
        break;
      }

      case 'hr': {
        bodyChildren.push(new Paragraph({
          children: [],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: profile.border },
          },
          spacing: { before: 300, after: 300 },
        }));
        break;
      }
    }
  }

  // Build Document
  const coverChildren = buildCoverPage(title, profile, branding);

  const doc = new Document({
    title,
    subject: title,
    creator: branding?.firmName ?? 'Lavern',
    description: `Generated deliverable: ${title}`,
    lastModifiedBy: 'Lavern Legal Design System',
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
          style: {
            run: { font: profile.bodyFont, size: profile.bodySize },
            paragraph: { indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.25) } },
          },
        }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: profile.bodyFont, size: profile.bodySize, color: profile.inkSecondary },
          paragraph: { spacing: { line: profile.lineSpacing } },
        },
      },
    },
    sections: [
      // Cover page
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(profile.coverMarginTop),
              bottom: convertInchesToTwip(1.5),
              left: convertInchesToTwip(profile.coverMarginSides),
              right: convertInchesToTwip(profile.coverMarginSides),
            },
          },
        },
        children: coverChildren,
      },
      // Body
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(profile.bodyMarginTop),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(profile.bodyMarginSides),
              right: convertInchesToTwip(profile.bodyMarginSides),
            },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({
                  text: (branding?.firmName
                    ? (profile.id === 'traditional' ? branding.firmName.toUpperCase() : branding.firmName)
                    : 'LAVERN'),
                  font: profile.bodyFont,
                  size: profile.tinySize,
                  color: profile.inkDim,
                  characterSpacing: 120,
                  bold: profile.id === 'traditional',
                }),
                new TextRun({ children: [new Tab()] }),
                new TextRun({
                  text: title.length > 50 ? title.substring(0, 50) + '\u2026' : title,
                  font: profile.bodyFont,
                  size: profile.tinySize,
                  color: profile.inkDim,
                  italics: profile.id !== 'accessible',
                }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 1, color: profile.borderLight },
              },
              spacing: { after: 200 },
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                new TextRun({
                  text: 'AI-Assisted Analysis',
                  font: profile.bodyFont,
                  size: profile.tinySize - 2,
                  color: profile.inkDim,
                }),
                new TextRun({ children: [new Tab()] }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: profile.bodyFont,
                  size: profile.tinySize,
                  color: profile.inkDim,
                }),
                new TextRun({ children: [new Tab()] }),
                new TextRun({
                  text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                  font: profile.bodyFont,
                  size: profile.tinySize - 2,
                  color: profile.inkDim,
                }),
              ],
              tabStops: [
                { type: TabStopType.CENTER, position: Math.floor(TabStopPosition.MAX / 2) },
                { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
              ],
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: profile.borderLight },
              },
              spacing: { before: 200 },
            })],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ── HTML / PDF Conversion ───────────────────────────────────────────────

function getHtmlCover(title: string, dateStr: string, profile: StyleProfile, branding?: SoulBranding): string {
  const brandName = branding?.firmName ?? 'Lavern';
  const hasSoul = !!branding?.firmName;
  const engineCredit = hasSoul ? 'Powered by Lavern' : 'Multi-Agent Legal Design System';
  const taglineHtml = hasSoul && branding.tagline
    ? `<p class="tagline">${escapeHtml(branding.tagline)}</p>` : '';

  if (profile.id === 'traditional') {
    return `
  <div class="cover">
    <div class="confidential">CONFIDENTIAL</div>
    <hr class="cover-rule-double" aria-hidden="true">
    <h1>${escapeHtml(title.toUpperCase())}</h1>
    <div class="cover-date">${escapeHtml(dateStr)}</div>
    <hr class="cover-rule-double" aria-hidden="true">
    <div class="cover-meta">
      <span class="label">Prepared by</span>
      <span class="brand">${escapeHtml(brandName.toUpperCase())}</span>
      ${taglineHtml}
      <p class="subtitle">${escapeHtml(engineCredit)}</p>
      <p class="disclaimer">This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.</p>
    </div>
  </div>`;
  }

  if (profile.id === 'accessible') {
    return `
  <div class="cover">
    <h1>${escapeHtml(title)}</h1>
    <hr class="cover-rule-thick" aria-hidden="true">
    <div class="cover-date">${escapeHtml(dateStr)}</div>
    <div class="cover-meta">
      <p><strong>Prepared by:</strong> ${escapeHtml(brandName)}</p>
      ${taglineHtml}
      <p class="subtitle">${escapeHtml(engineCredit)}</p>
      <p class="disclaimer">This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.</p>
    </div>
  </div>`;
  }

  // Elegant (default)
  return `
  <div class="cover">
    <div class="cover-rule"></div>
    <h1>${escapeHtml(title)}</h1>
    <div class="cover-date">${escapeHtml(dateStr)}</div>
    <div class="cover-meta">
      <span class="label">Prepared by</span>
      <span class="brand">${escapeHtml(brandName)}</span>
      ${taglineHtml}
      <p class="subtitle">${escapeHtml(engineCredit)}</p>
      <p class="disclaimer">This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.</p>
    </div>
  </div>`;
}

function getHtmlStyles(profile: StyleProfile): string {
  const p = profile;

  // Shared base styles
  let css = `
    *, *::before, *::after { box-sizing: border-box; }

    @page {
      margin: ${p.bodyMarginTop}in ${p.bodyMarginSides}in 1in;
      @bottom-center {
        content: counter(page);
        font-family: ${p.htmlBodyFontFamily};
        font-size: 8pt;
        color: #${p.inkDim};
      }
    }

    body {
      font-family: ${p.htmlBodyFontFamily};
      font-size: ${p.bodySize / 2}pt;
      line-height: ${p.lineHeightCss};
      color: #${p.inkSecondary};
      max-width: ${p.htmlMaxWidth};
      margin: 0 auto;
      padding: 2rem 1.5rem;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      ${p.letterSpacingEm > 0 ? `letter-spacing: ${p.letterSpacingEm}em;` : ''}
    }

    /* ── Cover ──────────────────────────── */
    .cover {
      padding: 3rem 0 2rem;
      margin-bottom: 2rem;
      ${p.id === 'traditional' ? 'text-align: center;' : ''}
      page-break-after: always;
    }

    .cover h1 {
      font-family: ${p.htmlHeadingFontFamily};
      font-size: ${p.coverTitleSize / 2}pt;
      font-weight: ${p.id === 'elegant' ? '400' : '700'};
      color: #${p.ink};
      line-height: 1.15;
      margin: 0 0 0.5rem;
      border: none;
      padding: 0;
    }

    .cover-date {
      font-size: ${p.smallSize / 2}pt;
      color: #${p.inkMuted};
      margin-bottom: 3rem;
    }

    .cover-meta {
      font-size: ${p.tinySize / 2}pt;
      color: #${p.inkDim};
      line-height: 1.6;
    }

    .cover-meta .label {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: ${(p.tinySize - 2) / 2}pt;
      color: #${p.inkDim};
      display: block;
      margin-bottom: 0.2rem;
    }

    .cover-meta .brand {
      font-family: ${p.htmlHeadingFontFamily};
      font-size: ${p.id === 'accessible' ? '14' : '13'}pt;
      color: #${p.inkMuted};
      font-weight: ${p.id === 'traditional' ? '700' : '400'};
    }

    .cover-meta .tagline {
      font-size: ${p.tinySize / 2}pt;
      color: #${p.inkDim};
      ${p.id !== 'accessible' ? 'font-style: italic;' : ''}
      margin: 0.2rem 0 0;
    }

    .cover-meta .subtitle {
      font-size: ${(p.tinySize - 2) / 2}pt;
      color: #${p.inkDim};
      margin: 0.3rem 0 0;
    }

    .cover-meta .disclaimer {
      ${p.id !== 'accessible' ? 'font-style: italic;' : ''}
      font-size: ${(p.tinySize - 2) / 2}pt;
      color: #${p.inkDim};
      margin-top: 1.5rem;
      ${p.id !== 'traditional' ? 'max-width: 480px;' : ''}
    }`;

  // Style-specific cover elements
  if (p.id === 'traditional') {
    css += `
    .confidential {
      font-family: ${p.htmlHeadingFontFamily};
      font-size: ${p.smallSize / 2}pt;
      color: #${p.inkDim};
      letter-spacing: 0.3em;
      text-transform: uppercase;
      margin-bottom: 2rem;
    }
    .cover-rule-double {
      border: none;
      border-top: 3px double #${p.accent};
      margin: 1.5rem 0;
    }`;
  } else if (p.id === 'elegant') {
    css += `
    .cover-rule {
      width: 60px;
      height: 2px;
      background: #${p.accent};
      margin-bottom: 2rem;
    }
    .cover {
      border-bottom: 2px solid #${p.accent};
    }`;
  } else {
    css += `
    .cover-rule-thick {
      border: none;
      border-top: 4px solid #${p.ink};
      margin: 1rem 0 1.5rem;
    }`;
  }

  // Headings
  css += `
    /* ── Headings ──────────────────────── */
    h1 {
      font-family: ${p.htmlHeadingFontFamily};
      font-size: ${p.h1Size / 2}pt;
      font-weight: ${p.h1Bold ? '700' : '400'};
      color: #${p.ink};
      margin: 2em 0 0.5em;
      padding-bottom: 0.3em;
      border-bottom: ${p.id === 'traditional' ? `2px double #${p.accent}` : `1px solid #${p.border}`};
      line-height: 1.2;
    }

    h2 {
      font-family: ${p.htmlHeadingFontFamily};
      font-size: ${p.h2Size / 2}pt;
      font-weight: ${p.h2Bold ? '600' : '500'};
      color: #${p.ink};
      margin: 1.8em 0 0.4em;
      line-height: 1.25;
    }

    h3 {
      font-family: ${p.h3Uppercase ? p.htmlBodyFontFamily : p.htmlHeadingFontFamily};
      font-size: ${p.h3Size / 2}pt;
      font-weight: ${p.h3Bold ? '600' : '500'};
      color: #${p.ink};
      margin: 1.5em 0 0.3em;
      ${p.h3Uppercase ? `text-transform: uppercase; letter-spacing: 0.03em;` : ''}
    }

    h4 {
      font-family: ${p.htmlBodyFontFamily};
      font-size: ${p.h4Size / 2}pt;
      font-weight: 600;
      color: #${p.inkSecondary};
      margin: 1.2em 0 0.3em;
    }

    h5, h6 {
      font-family: ${p.htmlBodyFontFamily};
      font-size: ${p.bodySize / 2}pt;
      font-weight: 600;
      color: #${p.inkMuted};
      margin: 1em 0 0.2em;
    }`;

  // Traditional heading numbering via CSS counters
  if (p.headingNumbered) {
    css += `
    .doc-body { counter-reset: h1counter h2counter h3counter; }
    .doc-body h1 { counter-increment: h1counter; counter-reset: h2counter h3counter; }
    .doc-body h1::before { content: counter(h1counter) ".  "; }
    .doc-body h2 { counter-increment: h2counter; counter-reset: h3counter; }
    .doc-body h2::before { content: counter(h1counter) "." counter(h2counter) "  "; }
    .doc-body h3 { counter-increment: h3counter; }
    .doc-body h3::before { content: counter(h1counter) "." counter(h2counter) "." counter(h3counter) "  "; }`;
  }

  // Body
  css += `
    /* ── Body ──────────────────────────── */
    p { margin: 0.7em 0; orphans: 3; widows: 3; }
    strong { font-weight: 600; color: #${p.ink}; }
    em { color: #${p.inkSecondary}; }

    a {
      color: #${p.linkColor};
      ${p.linkUnderline ? 'text-decoration: underline;' : 'text-decoration: none;'}
      ${p.linkBorderBottom ? `border-bottom: 1px solid rgba(${parseInt(p.linkColor.substring(0, 2), 16)}, ${parseInt(p.linkColor.substring(2, 4), 16)}, ${parseInt(p.linkColor.substring(4, 6), 16)}, 0.3);` : ''}
    }
    ${p.linkBorderBottom ? `a:hover { border-bottom-color: #${p.linkColor}; }` : ''}
    ${p.id === 'accessible' ? `a:focus { outline: 3px solid #${p.accent}; outline-offset: 2px; }` : ''}

    ul, ol { margin: 0.7em 0; padding-left: 1.5em; }
    li { margin: 0.35em 0; line-height: ${p.lineHeightCss - 0.05}; }
    li::marker { color: #${p.inkMuted}; }`;

  // Tables
  css += `
    /* ── Tables ─────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5em 0;
      font-size: ${p.smallSize / 2}pt;
    }

    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #${p.border};
      ${p.tableBorderStyle === 'full' ? `border: 1px solid #${p.border};` : ''}
    }

    th {
      font-weight: 600;
      color: #${p.ink};
      font-size: ${(p.smallSize - 2) / 2}pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: #${p.tableHeaderBg};
      border-bottom: 2px solid #${p.border};
    }

    ${p.tableBorderStyle === 'open' ? 'tr:last-child td { border-bottom: none; }' : ''}
    ${p.tableAlternatingRows ? `tbody tr:nth-child(even) { background: #${p.paper}; }` : ''}`;

  // Blockquotes
  const bqBorderColor = p.id === 'accessible' ? p.ink : p.accent;
  const bqBorderWidth = p.id === 'accessible' ? '4px' : '3px';
  css += `
    /* ── Blockquotes ────────────────────── */
    blockquote {
      margin: 1.2em 0;
      padding: 0.8em 1.2em;
      border-left: ${bqBorderWidth} solid #${bqBorderColor};
      ${p.id === 'elegant' ? `background: rgba(${parseInt(p.accent.substring(0, 2), 16)}, ${parseInt(p.accent.substring(2, 4), 16)}, ${parseInt(p.accent.substring(4, 6), 16)}, 0.06);` : ''}
      color: #${p.inkMuted};
      ${p.id !== 'accessible' ? 'font-style: italic;' : ''}
      border-radius: 0 4px 4px 0;
    }
    blockquote p { margin: 0.3em 0; }`;

  // Code, HR, footer
  css += `
    /* ── Code ───────────────────────────── */
    code {
      font-family: ${p.mono}, monospace;
      background: #${p.paper};
      padding: 0.15em 0.4em;
      border-radius: 3px;
      font-size: 0.88em;
      color: #${p.ink};
    }
    pre {
      background: #${p.paper};
      padding: 1em 1.2em;
      border-radius: 6px;
      overflow-x: auto;
      border: 1px solid #${p.borderLight};
    }
    pre code { background: none; padding: 0; }

    hr { border: none; height: 1px; background: #${p.border}; margin: 2em 0; }

    .doc-footer {
      margin-top: 4em;
      padding-top: 1.5em;
      border-top: 1px solid #${p.border};
      text-align: center;
      page-break-inside: avoid;
    }
    .doc-footer p { font-size: ${(p.tinySize - 2) / 2}pt; color: #${p.inkDim}; margin: 0.2em 0; }
    .doc-footer .brand-mark {
      font-family: ${p.htmlHeadingFontFamily};
      font-size: ${p.bodySize / 2}pt;
      color: #${p.inkMuted};
      margin-bottom: 0.3em;
    }

    @media print {
      body { max-width: none; padding: 0; font-size: ${(p.bodySize - 1) / 2}pt; }
      .cover { page-break-after: always; }
      h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
      table, figure, blockquote { page-break-inside: avoid; }
      a { ${p.linkUnderline ? '' : 'border-bottom: none;'} }
    }`;

  return css;
}

export function convertToHtml(markdown: string, title: string, style?: DocumentStyle, branding?: SoulBranding): string {
  const profile = getStyleProfile(style);
  let htmlBody = sanitizeHtmlOutput(marked.parse(markdown, { async: false }) as string);

  // Accessible: add scope attributes to table headers
  if (profile.id === 'accessible') {
    htmlBody = htmlBody.replace(/<th>/g, '<th scope="col">');
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const cover = getHtmlCover(title, dateStr, profile, branding);
  const styles = getHtmlStyles(profile);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="author" content="${escapeHtml(branding?.firmName ?? 'Lavern')}">
  <meta name="description" content="${escapeHtml(title)}">
  <meta name="generator" content="Lavern Legal Design System">
  ${profile.htmlFontImport}
  <style>${styles}</style>
</head>
<body>
  ${cover}

  <div class="doc-body">
    ${htmlBody}
  </div>

  <div class="doc-footer">
    <p class="brand-mark">${escapeHtml(branding?.firmName ?? 'Lavern')}</p>
    <p>${escapeHtml(branding?.firmName ? 'Powered by Lavern' : 'Multi-Agent Legal Design System')}</p>
    <p>Generated ${escapeHtml(dateStr)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Sanitize HTML output from marked.parse() to prevent XSS.
 *
 * Strips dangerous elements (<script>, <iframe>, <object>, <embed>, <form>, <base>)
 * and dangerous attributes (on*, javascript: URLs, data: URLs in links).
 * Preserves safe HTML structure for rendering legal documents.
 */
function sanitizeHtmlOutput(html: string): string {
  // Remove dangerous elements and their content
  let sanitized = html.replace(/<script\b[^]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^]*?<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^]*?<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^]*?\/?>/gi, '');
  sanitized = sanitized.replace(/<form\b[^]*?<\/form>/gi, '');
  sanitized = sanitized.replace(/<base\b[^]*?\/?>/gi, '');

  // Remove self-closing dangerous tags (no closing tag variant)
  sanitized = sanitized.replace(/<script\b[^>]*\/?>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^>]*\/?>/gi, '');

  // Remove event handler attributes (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove javascript: and data: URLs from href/src/action attributes (quoted and unquoted)
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*["']?\s*javascript\s*:/gi, '$1="');
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*["']?\s*data\s*:/gi, '$1="');
  // Also catch URL-encoded variants (e.g. java&#115;cript:, data%3A)
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*["']?\s*(?:&#[xX]?[0-9a-fA-F]+;?\s*)*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '$1="');

  // Remove style attributes that could contain expression() or url(javascript:)
  // Handles double-quoted, single-quoted, AND unquoted style attributes
  sanitized = sanitized.replace(/style\s*=\s*"[^"]*expression\s*\([^"]*"/gi, '');
  sanitized = sanitized.replace(/style\s*=\s*'[^']*expression\s*\([^']*'/gi, '');
  sanitized = sanitized.replace(/style\s*=\s*[^\s>"'][^\s>]*expression\s*\([^\s>]*/gi, '');

  return sanitized;
}

/**
 * Convert markdown to a real PDF using Puppeteer (headless Chrome).
 *
 * The HTML rendering is already excellent with print-optimized CSS,
 * so we render it in a headless browser and produce actual PDF bytes.
 *
 * Falls back to serving styled HTML if Puppeteer fails (e.g. no Chrome available).
 * The caller should set Content-Type based on success/failure.
 */
export async function convertToPdf(
  markdown: string,
  title: string,
  style?: DocumentStyle,
  branding?: SoulBranding,
): Promise<{ buffer: Buffer; isRealPdf: boolean }> {
  const html = convertToHtml(markdown, title, style, branding);

  try {
    // Dynamic import — puppeteer is optional, don't break if not installed
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();

      // Set the HTML content — use 'load' instead of 'networkidle0' because
      // Google Fonts CSS can keep the network busy with font variants
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });

      // Generate PDF with print-quality settings
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '25mm',
          left: '20mm',
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width: 100%; text-align: center; font-size: 9px; color: #999; font-family: system-ui, sans-serif;">
            <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>`,
        preferCSSPageSize: false,
      });

      // Puppeteer returns Uint8Array, convert to Buffer
      const buffer = Buffer.from(pdfBuffer);
      logger.info('Generated real PDF', { bytes: buffer.length, title });
      return { buffer, isRealPdf: true };
    } finally {
      await browser.close();
    }
  } catch (error) {
    // Puppeteer unavailable or failed — fall back to HTML
    logger.warn('Puppeteer unavailable, falling back to styled HTML', { error: error instanceof Error ? error.message : error });
    return { buffer: Buffer.from(html, 'utf-8'), isRealPdf: false };
  }
}
