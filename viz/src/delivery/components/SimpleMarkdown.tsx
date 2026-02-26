/**
 * SimpleMarkdown — Lightweight markdown renderer for delivery previews.
 *
 * Handles: headings, bold/italic, bullet lists, tables, horizontal rules, paragraphs.
 * No external dependencies — just React + inline styles.
 */

import { colors, fonts, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  content: string;
}

/** Render inline formatting: **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Process: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(
        <code key={match.index} style={sty.inlineCode}>{match[4]}</code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/** Parse a markdown table block (array of lines) into JSX */
function renderTable(lines: string[]): React.ReactNode {
  const rows = lines
    .filter(l => !l.match(/^\s*\|[-:\s|]+\|\s*$/))  // Skip separator rows
    .map(l =>
      l.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0)
    );

  if (rows.length === 0) return null;

  const [header, ...body] = rows;

  return (
    <div style={sty.tableWrapper}>
      <table style={sty.table}>
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} style={sty.th}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        {body.length > 0 && (
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={sty.td}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

export function SimpleMarkdown({ content }: Props) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={sty.h1}>{renderInline(line.slice(2))}</h1>);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={sty.h2}>{renderInline(line.slice(3))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={sty.h3}>{renderInline(line.slice(4))}</h3>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} style={sty.hr} />);
      i++;
      continue;
    }

    // Table block: collect consecutive lines starting with |
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<div key={`table-${i}`}>{renderTable(tableLines)}</div>);
      continue;
    }

    // Bullet list: collect consecutive lines starting with -
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={sty.ul}>
          {items.map((item, j) => (
            <li key={j} style={sty.li}>{renderInline(item)}</li>
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
        <ol key={`ol-${i}`} style={sty.ol}>
          {items.map((item, j) => (
            <li key={j} style={sty.li}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('- ') &&
      !lines[i].trim().startsWith('|') &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} style={sty.p}>
          {renderInline(paraLines.join(' '))}
        </p>
      );
    }
  }

  return <div style={sty.root}>{elements}</div>;
}

const sty: Record<string, React.CSSProperties> = {
  root: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.7,
  },
  h1: {
    fontSize: 22,
    fontWeight: 600,
    fontFamily: fonts.serif,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    lineHeight: 1.3,
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    lineHeight: 1.3,
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    lineHeight: 1.3,
  },
  p: {
    margin: `0 0 ${spacing.sm}px`,
  },
  hr: {
    border: 'none',
    borderTop: `1px solid ${colors.border}`,
    margin: `${spacing.md}px 0`,
  },
  ul: {
    margin: `0 0 ${spacing.sm}px`,
    paddingLeft: 20,
  },
  ol: {
    margin: `0 0 ${spacing.sm}px`,
    paddingLeft: 20,
  },
  li: {
    marginBottom: 4,
  },
  inlineCode: {
    fontFamily: fonts.mono,
    fontSize: 12,
    backgroundColor: colors.bgPanel,
    padding: '1px 5px',
    borderRadius: 3,
  },
  tableWrapper: {
    overflowX: 'auto' as const,
    marginBottom: spacing.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 12,
    fontFamily: fonts.sans,
  },
  th: {
    textAlign: 'left' as const,
    fontWeight: 600,
    color: colors.text,
    padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '6px 12px',
    borderBottom: `1px solid ${colors.bgPanel}`,
    color: colors.textSecondary,
  },
};
