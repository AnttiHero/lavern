/**
 * Tabulate Format Converters — TabulateResult → CSV / DOCX / HTML / Markdown.
 *
 * The Tabulate workflow produces a structured TabulateResult; the user
 * downloads it in any of:
 *   - CSV       — one CSV per table, returned as a {filename: content} map
 *                 (the API zips them into a single .zip download)
 *   - DOCX      — a single Word document with all tables rendered as native
 *                 Word tables (formatted, low-confidence cells highlighted)
 *   - HTML      — a single self-contained HTML document for browser preview
 *                 + share-via-link
 *   - Markdown  — a single .md with all tables as markdown tables
 *
 * Provenance + confidence are surfaced in every format:
 *   - CSV: appended columns (_source, _confidence) per data column
 *   - DOCX/HTML: hover/title attributes; low-confidence cells highlighted
 *   - Markdown: footnote-style annotations
 */

import {
  Document, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableRow as DocxTableRow, TableCell as DocxTableCell,
  Table as DocxTable, WidthType, ShadingType, Packer,
} from 'docx';
import type {
  TabulateResult, ExtractedTable, TableColumn, TableCell as TblCell, CellValue,
  CurrencyValue, DurationValue,
} from './tabulate-types.js';

// ── Cell value formatting ──────────────────────────────────────────────

/** Render a cell value to a plain string suitable for CSV / table cells. */
function formatCellValue(value: CellValue, type: TableColumn['type']): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'currency': {
      if (typeof value === 'object' && value && 'amount' in value && 'currency' in value) {
        const cv = value as CurrencyValue;
        return `${cv.currency} ${formatNumber(cv.amount)}`;
      }
      return String(value);
    }
    case 'duration': {
      if (typeof value === 'object' && value && 'count' in value && 'unit' in value) {
        const dv = value as DurationValue;
        const unit = dv.unit.replace('_', ' ');
        return `${dv.count} ${unit}`;
      }
      return String(value);
    }
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'boolean':
      return value === true ? 'Yes' : value === false ? 'No' : '';
    case 'date':
      return typeof value === 'string' ? value : String(value);
    default:
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

function formatNumber(n: number): string {
  // Use thousands separator, up to 2 decimal places (no trailing zeros).
  if (!Number.isFinite(n)) return String(n);
  const fixed = Math.abs(n) >= 1 && Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return fixed;
}

// ── CSV ────────────────────────────────────────────────────────────────

function escapeCsv(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert one table to CSV. Includes per-data-column _source + _confidence
 * sidecar columns so the audit trail rides along with the data.
 */
function tableToCsv(table: ExtractedTable): string {
  const dataKeys = table.columns.map(c => c.key);
  const headers: string[] = [];
  for (const col of table.columns) {
    headers.push(col.label);
    headers.push(`${col.label} — source`);
    headers.push(`${col.label} — confidence`);
  }
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of table.rows) {
    const fields: string[] = [];
    for (const col of table.columns) {
      const cell = row.cells[col.key];
      if (!cell) {
        fields.push('', '', '');
        continue;
      }
      fields.push(escapeCsv(formatCellValue(cell.value, col.type)));
      fields.push(escapeCsv(cell.source));
      fields.push(escapeCsv(cell.confidence.toFixed(2)));
    }
    lines.push(fields.join(','));
  }
  // Use dataKeys for stable iteration order even though we use col.key above
  void dataKeys;
  return lines.join('\n') + '\n';
}

/**
 * Convert a full TabulateResult to a map of {filename: csv content}.
 * Caller (API route) zips them.
 */
export function convertTabulateToCsvBundle(result: TabulateResult): Record<string, string> {
  const bundle: Record<string, string> = {};
  for (const t of result.tables) {
    const safeName = t.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
    bundle[`${safeName}.csv`] = tableToCsv(t);
  }
  // Index file
  const index = [
    'table_id,title,source,row_count,column_count',
    ...result.tables.map(t =>
      [t.id, escapeCsv(t.title), escapeCsv(t.source), String(t.rows.length), String(t.columns.length)].join(','),
    ),
  ].join('\n') + '\n';
  bundle['_index.csv'] = index;
  return bundle;
}

/**
 * Convert a TabulateResult to a single concatenated CSV (one big file with
 * blank-line separators + a header row before each table). Useful for "just
 * give me one file I can paste into Excel."
 */
export function convertTabulateToSingleCsv(result: TabulateResult): string {
  const parts: string[] = [];
  parts.push(`# ${result.documentTitle}`);
  parts.push(`# ${result.summary}`);
  parts.push('');
  for (const t of result.tables) {
    parts.push(`## ${t.title} (${t.source})`);
    if (t.description) parts.push(`# ${t.description}`);
    parts.push(tableToCsv(t).trimEnd());
    parts.push('');
  }
  if (result.specialistReferrals.length > 0) {
    parts.push('## Specialist Referrals');
    parts.push('clause,why,specialist');
    for (const r of result.specialistReferrals) {
      parts.push([escapeCsv(r.clause), escapeCsv(r.why), escapeCsv(r.specialist)].join(','));
    }
  }
  return parts.join('\n') + '\n';
}

// ── DOCX ───────────────────────────────────────────────────────────────

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_FILL = 'FFF4D6'; // soft amber

function shadingForCell(cell: TblCell | undefined): { fill: string; type: typeof ShadingType.SOLID; color: string } | undefined {
  if (cell && cell.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { fill: LOW_CONFIDENCE_FILL, type: ShadingType.SOLID, color: 'auto' };
  }
  return undefined;
}

function buildDocxTable(table: ExtractedTable): DocxTable {
  const headerRow = new DocxTableRow({
    tableHeader: true,
    children: table.columns.map(col => new DocxTableCell({
      shading: { fill: 'EEEEEE', type: ShadingType.SOLID, color: 'auto' },
      children: [new Paragraph({
        children: [new TextRun({ text: col.label, bold: true })],
      })],
    })),
  });

  const dataRows = table.rows.map(row => new DocxTableRow({
    children: table.columns.map(col => {
      const cell = row.cells[col.key];
      const value = cell ? formatCellValue(cell.value, col.type) : '';
      const sourceText = cell?.source || '';
      const conf = cell?.confidence ?? 1;
      const cellChildren: Paragraph[] = [
        new Paragraph({ children: [new TextRun({ text: value })] }),
      ];
      if (sourceText) {
        cellChildren.push(new Paragraph({
          children: [new TextRun({
            text: `${sourceText} · ${(conf * 100).toFixed(0)}%`,
            italics: true,
            size: 16, // half-points → 8pt
            color: '888888',
          })],
        }));
      }
      return new DocxTableCell({
        shading: shadingForCell(cell),
        children: cellChildren,
      });
    }),
  }));

  return new DocxTable({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'EEEEEE' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: 'EEEEEE' },
    },
  });
}

export async function convertTabulateToDocx(result: TabulateResult, title?: string): Promise<Buffer> {
  const bodyChildren: (Paragraph | DocxTable)[] = [];

  // Title
  bodyChildren.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: title ?? result.documentTitle, bold: true, size: 40 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }));

  // Summary
  if (result.summary) {
    bodyChildren.push(new Paragraph({
      children: [new TextRun({ text: result.summary, italics: true, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }));
  }

  // Per-table sections
  for (const table of result.tables) {
    bodyChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: table.title, bold: true })],
      spacing: { before: 360, after: 120 },
    }));
    if (table.source) {
      bodyChildren.push(new Paragraph({
        children: [new TextRun({ text: `Source: ${table.source}`, italics: true, size: 18, color: '888888' })],
        spacing: { after: 120 },
      }));
    }
    if (table.description) {
      bodyChildren.push(new Paragraph({
        children: [new TextRun({ text: table.description })],
        spacing: { after: 200 },
      }));
    }
    bodyChildren.push(buildDocxTable(table));
    if (table.notes) {
      bodyChildren.push(new Paragraph({
        children: [new TextRun({ text: `Notes: ${table.notes}`, italics: true, size: 18, color: '666666' })],
        spacing: { before: 120, after: 240 },
      }));
    }
  }

  // Defined terms appendix
  if (result.definedTerms.length > 0) {
    bodyChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Defined Terms', bold: true })],
      spacing: { before: 480, after: 180 },
    }));
    for (const dt of result.definedTerms) {
      bodyChildren.push(new Paragraph({
        children: [
          new TextRun({ text: `${dt.term}: `, bold: true }),
          new TextRun({ text: dt.meaning }),
          new TextRun({ text: ` (${dt.source})`, italics: true, color: '888888' }),
        ],
        spacing: { after: 120 },
      }));
    }
  }

  // Specialist referrals
  if (result.specialistReferrals.length > 0) {
    bodyChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Specialist Referrals', bold: true })],
      spacing: { before: 480, after: 180 },
    }));
    for (const ref of result.specialistReferrals) {
      bodyChildren.push(new Paragraph({
        children: [
          new TextRun({ text: `${ref.specialist} — `, bold: true }),
          new TextRun({ text: `${ref.why} ` }),
          new TextRun({ text: `(${ref.clause})`, italics: true, color: '888888' }),
        ],
        spacing: { after: 120 },
      }));
    }
  }

  // Footer note about low-confidence highlighting
  bodyChildren.push(new Paragraph({
    children: [new TextRun({
      text: `Cells highlighted in amber have model confidence below ${(LOW_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% — verify before relying on them.`,
      italics: true, size: 16, color: '888888',
    })],
    spacing: { before: 480 },
  }));

  const doc = new Document({
    creator: 'Lavern',
    title: title ?? result.documentTitle,
    sections: [{ children: bodyChildren }],
  });

  return Packer.toBuffer(doc);
}

// ── HTML ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function convertTabulateToHtml(result: TabulateResult, title?: string): string {
  const docTitle = escapeHtml(title ?? result.documentTitle);
  const tablesHtml = result.tables.map(t => buildHtmlTable(t)).join('\n\n');

  const definedTermsHtml = result.definedTerms.length === 0 ? '' : `
    <section class="appendix">
      <h2>Defined Terms</h2>
      <dl>
        ${result.definedTerms.map(dt => `
          <dt>${escapeHtml(dt.term)}</dt>
          <dd>${escapeHtml(dt.meaning)} <span class="src">(${escapeHtml(dt.source)})</span></dd>
        `).join('')}
      </dl>
    </section>`;

  const referralsHtml = result.specialistReferrals.length === 0 ? '' : `
    <section class="appendix">
      <h2>Specialist Referrals</h2>
      <ul>
        ${result.specialistReferrals.map(r => `
          <li><strong>${escapeHtml(r.specialist)}</strong> — ${escapeHtml(r.why)} <span class="src">(${escapeHtml(r.clause)})</span></li>
        `).join('')}
      </ul>
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    :root {
      --bg: #FAF7F0;
      --fg: #1A140A;
      --muted: #888;
      --border: #DCD2BB;
      --accent: #B47A3A;
      --low-conf: #FFF4D6;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 40px 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 40px; margin: 0 0 8px 0; letter-spacing: -0.5px; }
    .summary { font-style: italic; color: var(--muted); margin: 0 0 32px 0; }
    h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 24px; margin: 48px 0 8px 0; }
    .table-source { color: var(--muted); font-style: italic; font-size: 13px; margin: 0 0 8px 0; }
    .table-description { margin: 0 0 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; background: white; border: 1px solid var(--border); margin-bottom: 8px; }
    th { background: #F0EBDC; text-align: left; padding: 10px 12px; font-weight: 600; border-bottom: 1px solid var(--border); }
    td { padding: 10px 12px; border-bottom: 1px solid #EEE; vertical-align: top; }
    td.low-conf { background: var(--low-conf); }
    .cell-source { display: block; color: var(--muted); font-size: 11px; font-style: italic; margin-top: 2px; }
    .table-notes { color: var(--muted); font-style: italic; font-size: 13px; margin: 8px 0 24px 0; }
    .appendix { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
    .src { color: var(--muted); font-style: italic; font-size: 12px; }
    dt { font-weight: 600; margin-top: 12px; }
    dd { margin-left: 0; margin-bottom: 8px; }
    .legend { color: var(--muted); font-size: 12px; font-style: italic; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="container">
    <h1>${docTitle}</h1>
    ${result.summary ? `<p class="summary">${escapeHtml(result.summary)}</p>` : ''}
    ${tablesHtml}
    ${definedTermsHtml}
    ${referralsHtml}
    <p class="legend">Cells with an amber background have model confidence below ${(LOW_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% — verify before relying on them.</p>
  </div>
</body>
</html>`;
}

function buildHtmlTable(t: ExtractedTable): string {
  const headers = t.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
  const rows = t.rows.map(row => {
    const cells = t.columns.map(col => {
      const cell = row.cells[col.key];
      if (!cell) return '<td></td>';
      const value = formatCellValue(cell.value, col.type);
      const lowConf = cell.confidence < LOW_CONFIDENCE_THRESHOLD ? ' class="low-conf"' : '';
      const source = cell.source
        ? `<span class="cell-source" title="confidence ${(cell.confidence * 100).toFixed(0)}%">${escapeHtml(cell.source)} · ${(cell.confidence * 100).toFixed(0)}%</span>`
        : '';
      return `<td${lowConf}>${escapeHtml(value)}${source}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `<section>
  <h2>${escapeHtml(t.title)}</h2>
  ${t.source ? `<p class="table-source">Source: ${escapeHtml(t.source)}</p>` : ''}
  ${t.description ? `<p class="table-description">${escapeHtml(t.description)}</p>` : ''}
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  ${t.notes ? `<p class="table-notes">Notes: ${escapeHtml(t.notes)}</p>` : ''}
</section>`;
}

// ── Markdown ───────────────────────────────────────────────────────────

function escapeMd(s: string): string {
  // Escape | and \n inside cells for table integrity
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function convertTabulateToMarkdown(result: TabulateResult): string {
  const parts: string[] = [];
  parts.push(`# ${result.documentTitle}\n`);
  if (result.summary) parts.push(`*${result.summary}*\n`);

  for (const t of result.tables) {
    parts.push(`## ${t.title}\n`);
    if (t.source) parts.push(`**Source:** ${t.source}\n`);
    if (t.description) parts.push(`${t.description}\n`);

    // Header row
    parts.push('| ' + t.columns.map(c => escapeMd(c.label)).join(' | ') + ' |');
    parts.push('| ' + t.columns.map(() => '---').join(' | ') + ' |');
    for (const row of t.rows) {
      const cells = t.columns.map(col => {
        const cell = row.cells[col.key];
        if (!cell) return '';
        const v = formatCellValue(cell.value, col.type);
        const conf = cell.confidence < LOW_CONFIDENCE_THRESHOLD ? ` ⚠️${(cell.confidence * 100).toFixed(0)}%` : '';
        return escapeMd(v + conf);
      });
      parts.push('| ' + cells.join(' | ') + ' |');
    }
    parts.push('');
    if (t.notes) parts.push(`> ${t.notes}\n`);
  }

  if (result.definedTerms.length > 0) {
    parts.push(`## Defined Terms\n`);
    for (const dt of result.definedTerms) {
      parts.push(`- **${dt.term}** — ${dt.meaning} *(${dt.source})*`);
    }
    parts.push('');
  }

  if (result.specialistReferrals.length > 0) {
    parts.push(`## Specialist Referrals\n`);
    for (const r of result.specialistReferrals) {
      parts.push(`- **${r.specialist}** — ${r.why} *(${r.clause})*`);
    }
    parts.push('');
  }

  parts.push(`---\n*Cells marked with ⚠️ have model confidence below ${(LOW_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%.*\n`);
  return parts.join('\n');
}
