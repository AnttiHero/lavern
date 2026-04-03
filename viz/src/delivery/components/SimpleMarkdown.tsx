/**
 * SimpleMarkdown — Delivery document renderer.
 *
 * Three real Lavern style profiles, faithfully replicated from
 * src/assembly/format-converter.ts:
 *
 *   traditional  — Times New Roman, numbered headings, navy accent, formal
 *   elegant      — Cormorant Garamond + Inter, warm terracotta, open tables
 *   accessible   — Verdana/Arial, WCAG AA, large type, letter spacing
 *
 * Handles: h1–h6, bold/italic/code, bullets, numbered lists,
 * blockquotes, tables, horizontal rules, paragraphs.
 */

export type DocStyle = 'traditional' | 'elegant' | 'accessible';

interface StyleProfile {
  bodyFont: string;
  headingFont: string;
  fontImport?: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  accent: string;
  border: string;
  borderLight: string;
  paper: string;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  bodySize: number;
  lineHeight: number;
  letterSpacing: number;
  headingNumbered: boolean;
  h1Bold: boolean;
  h2Bold: boolean;
  h3Bold: boolean;
  h3Uppercase: boolean;
  tableBorderStyle: 'open' | 'full';
  tableAlternatingRows: boolean;
  tableHeaderBg: string;
  blockquoteStyle: 'left-bar' | 'filled' | 'plain';
  linkUnderline: boolean;
}

const TRADITIONAL: StyleProfile = {
  bodyFont: "'Times New Roman', Times, Georgia, serif",
  headingFont: "'Times New Roman', Times, Georgia, serif",
  ink: '#000000',
  inkSecondary: '#000000',
  inkMuted: '#333333',
  accent: '#1B2A4A',
  border: '#AAAAAA',
  borderLight: '#CCCCCC',
  paper: '#F5F5F5',
  h1Size: 16,
  h2Size: 14,
  h3Size: 12,
  bodySize: 12,
  lineHeight: 1.15,
  letterSpacing: 0,
  headingNumbered: true,
  h1Bold: true,
  h2Bold: true,
  h3Bold: true,
  h3Uppercase: false,
  tableBorderStyle: 'full',
  tableAlternatingRows: true,
  tableHeaderBg: '#F0F0F0',
  blockquoteStyle: 'left-bar',
  linkUnderline: false,
};

const ELEGANT: StyleProfile = {
  bodyFont: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  headingFont: "'Cormorant Garamond', Georgia, serif",
  fontImport: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Inter:wght@300;400;500&display=swap',
  ink: '#1A1A1A',
  inkSecondary: '#4A4A4A',
  inkMuted: '#7A7A76',
  accent: '#C45D3E',
  border: '#E5E3DD',
  borderLight: '#F0EFEB',
  paper: '#FAFAF8',
  h1Size: 22,
  h2Size: 16,
  h3Size: 13,
  bodySize: 10.5,
  lineHeight: 1.7,
  letterSpacing: 0,
  headingNumbered: false,
  h1Bold: false,
  h2Bold: false,
  h3Bold: true,
  h3Uppercase: true,
  tableBorderStyle: 'open',
  tableAlternatingRows: false,
  tableHeaderBg: '#FAFAF8',
  blockquoteStyle: 'filled',
  linkUnderline: false,
};

const ACCESSIBLE: StyleProfile = {
  bodyFont: "Arial, Verdana, 'Helvetica Neue', sans-serif",
  headingFont: "Verdana, Arial, 'Helvetica Neue', sans-serif",
  ink: '#000000',
  inkSecondary: '#1A1A1A',
  inkMuted: '#333333',
  accent: '#0000CC',
  border: '#767676',
  borderLight: '#AAAAAA',
  paper: '#F2F2F2',
  h1Size: 24,
  h2Size: 20,
  h3Size: 16,
  bodySize: 12,
  lineHeight: 1.5,
  letterSpacing: 0.12,
  headingNumbered: false,
  h1Bold: true,
  h2Bold: true,
  h3Bold: true,
  h3Uppercase: false,
  tableBorderStyle: 'full',
  tableAlternatingRows: false,
  tableHeaderBg: '#E0E0E0',
  blockquoteStyle: 'left-bar',
  linkUnderline: true,
};

const PROFILES: Record<DocStyle, StyleProfile> = {
  traditional: TRADITIONAL,
  elegant: ELEGANT,
  accessible: ACCESSIBLE,
};

interface Props {
  content: string;
  docStyle?: DocStyle;
}

/** Render inline formatting: **bold**, *italic*, `code`, [link](url) */
function renderInline(text: string, p: StyleProfile): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code key={match.index} style={{
          fontFamily: 'Consolas, monospace',
          fontSize: '0.9em',
          background: p.borderLight,
          padding: '1px 5px',
          borderRadius: 3,
          letterSpacing: 0,
        }}>{match[4]}</code>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <a key={match.index} href={match[6]} target="_blank" rel="noopener noreferrer"
          style={{
            color: p.accent,
            textDecoration: p.linkUnderline ? 'underline' : 'none',
            borderBottom: (!p.linkUnderline) ? `1px solid ${p.accent}55` : 'none',
          }}>
          {match[5]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function renderTable(lines: string[], p: StyleProfile): React.ReactNode {
  const rows = lines
    .filter(l => !l.match(/^\s*\|[-:\s|]+\|\s*$/))
    .map(l => l.split('|').map(c => c.trim()).filter(c => c.length > 0));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const isOpen = p.tableBorderStyle === 'open';
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    fontFamily: p.headingFont,
    fontWeight: 600,
    fontSize: p.bodySize * 0.9,
    color: p.ink,
    padding: '8px 12px',
    background: p.tableHeaderBg,
    borderBottom: isOpen ? `2px solid ${p.accent}` : `1px solid ${p.border}`,
    borderRight: isOpen ? 'none' : `1px solid ${p.border}`,
  };
  const tdStyle = (ri: number): React.CSSProperties => ({
    padding: '7px 12px',
    fontSize: p.bodySize * 0.9,
    color: p.inkSecondary,
    borderBottom: `1px solid ${p.borderLight}`,
    borderRight: isOpen ? 'none' : `1px solid ${p.borderLight}`,
    background: (p.tableAlternatingRows && ri % 2 === 1) ? '#F8F8F8' : 'transparent',
  });
  return (
    <div style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: isOpen ? 'none' : `1px solid ${p.border}` }}>
        <thead>
          <tr>{header.map((cell, i) => <th key={i} style={thStyle}>{renderInline(cell, p)}</th>)}</tr>
        </thead>
        {body.length > 0 && (
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={tdStyle(ri)}>{renderInline(cell, p)}</td>)}</tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

function isBulletLine(line: string): boolean {
  return /^[-*+]\s/.test(line);
}

// Per-style heading counters (module-level, reset per render)
let h1Counter = 0;
let h2Counter = 0;
let h3Counter = 0;

export function SimpleMarkdown({ content, docStyle = 'elegant' }: Props) {
  const p = PROFILES[docStyle];

  // Reset numbering counters
  h1Counter = 0; h2Counter = 0; h3Counter = 0;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2];

      if (level === 1) {
        if (p.headingNumbered) h1Counter++;
        h2Counter = 0; h3Counter = 0;
        const label = p.headingNumbered ? `${h1Counter}.  ${text}` : text;
        elements.push(
          <div key={i} style={{
            fontFamily: p.headingFont,
            fontSize: p.h1Size,
            fontWeight: p.h1Bold ? 700 : 300,
            color: p.ink,
            lineHeight: 1.15,
            letterSpacing: p.headingNumbered ? 0 : -0.3,
            marginTop: 28,
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: p.headingNumbered
              ? `2px double ${p.accent}`
              : `1px solid ${p.border}`,
          }}>{label}</div>
        );
      } else if (level === 2) {
        if (p.headingNumbered) h2Counter++;
        h3Counter = 0;
        const label = p.headingNumbered ? `${h1Counter}.${h2Counter}  ${text}` : text;
        elements.push(
          <div key={i} style={{
            fontFamily: p.headingFont,
            fontSize: p.h2Size,
            fontWeight: p.h2Bold ? 700 : 400,
            color: p.h2Bold ? p.ink : p.accent,
            lineHeight: 1.2,
            marginTop: 22,
            marginBottom: 8,
            borderLeft: !p.headingNumbered && !p.h2Bold ? `3px solid ${p.accent}` : 'none',
            paddingLeft: !p.headingNumbered && !p.h2Bold ? 10 : 0,
          }}>{label}</div>
        );
      } else if (level === 3) {
        if (p.headingNumbered) h3Counter++;
        const label = p.headingNumbered ? `${h1Counter}.${h2Counter}.${h3Counter}  ${text}` : text;
        elements.push(
          <div key={i} style={{
            fontFamily: p.headingFont,
            fontSize: p.h3Size,
            fontWeight: p.h3Bold ? 700 : 400,
            color: p.inkSecondary,
            lineHeight: 1.3,
            letterSpacing: p.h3Uppercase ? '0.1em' : 0,
            textTransform: p.h3Uppercase ? 'uppercase' : 'none',
            marginTop: 18,
            marginBottom: 6,
          }}>{label}</div>
        );
      } else {
        elements.push(
          <div key={i} style={{
            fontFamily: p.headingFont,
            fontSize: p.h3Size * 0.9,
            fontWeight: 600,
            color: p.inkMuted,
            marginTop: 12,
            marginBottom: 4,
          }}>{text}</div>
        );
      }
      i++; continue;
    }

    // HR
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: `1px solid ${p.border}`, margin: '16px 0' }} />);
      i++; continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      elements.push(
        <pre key={`code-${i}`} style={{
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          lineHeight: 1.6,
          background: p.borderLight,
          border: `1px solid ${p.border}`,
          borderRadius: 4,
          padding: '12px 16px',
          overflow: 'auto',
          margin: '10px 0',
          whiteSpace: 'pre',
          color: p.ink,
          letterSpacing: 0,
        }}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      const bqStyle: React.CSSProperties = p.blockquoteStyle === 'filled'
        ? {
            background: `${p.accent}10`,
            border: `none`,
            borderLeft: `3px solid ${p.accent}`,
            borderRadius: 4,
            padding: '10px 14px',
            color: p.inkSecondary,
            margin: '10px 0',
            fontStyle: 'normal',
          }
        : {
            borderLeft: `3px solid ${p.accent}`,
            paddingLeft: 14,
            color: p.inkMuted,
            fontStyle: 'italic',
            margin: '10px 0',
          };
      elements.push(
        <blockquote key={`bq-${i}`} style={bqStyle}>
          {renderInline(quoteLines.join(' '), p)}
        </blockquote>
      );
      continue;
    }

    // Table
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<div key={`table-${i}`}>{renderTable(tableLines, p)}</div>);
      continue;
    }

    // Bullet list
    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: '6px 0 10px', paddingLeft: 0, listStyle: 'none' }}>
          {items.map((item, j) => (
            <li key={j} style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              marginBottom: 4, fontSize: p.bodySize, color: p.inkSecondary,
              lineHeight: p.lineHeight, letterSpacing: p.letterSpacing,
              fontFamily: p.bodyFont,
            }}>
              <span style={{ color: p.accent, flexShrink: 0, fontSize: p.bodySize * 0.8 }}>
                {p.headingNumbered ? '—' : p.blockquoteStyle === 'filled' ? '◆' : '→'}
              </span>
              <span>{renderInline(item, p)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: '6px 0 10px', paddingLeft: 20 }}>
          {items.map((item, j) => (
            <li key={j} style={{
              marginBottom: 4, fontSize: p.bodySize, color: p.inkSecondary,
              lineHeight: p.lineHeight, letterSpacing: p.letterSpacing,
              fontFamily: p.bodyFont,
            }}>
              {renderInline(item, p)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,6}\s/) &&
      !isBulletLine(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('```') &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\*\*\*+$/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} style={{
          margin: '0 0 10px',
          fontSize: p.bodySize,
          fontFamily: p.bodyFont,
          color: p.inkSecondary,
          lineHeight: p.lineHeight,
          letterSpacing: p.letterSpacing,
        }}>
          {renderInline(paraLines.join(' '), p)}
        </p>
      );
    }
  }

  return (
    <>
      {ELEGANT.fontImport && docStyle === 'elegant' && (
        <link rel="stylesheet" href={ELEGANT.fontImport} />
      )}
      <div style={{
        fontSize: p.bodySize,
        fontFamily: p.bodyFont,
        color: p.ink,
        lineHeight: p.lineHeight,
        letterSpacing: p.letterSpacing,
        background: p.paper,
        padding: '24px 28px',
        borderRadius: 6,
      }}>
        {elements}
      </div>
    </>
  );
}
