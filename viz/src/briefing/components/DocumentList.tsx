/**
 * DocumentList — Rich preview cards for uploaded documents.
 *
 * v12: Enhanced from a simple file list to show:
 * - File icon (PDF/DOCX/text)
 * - Page count, word count
 * - Detected section headings (first 5)
 * - "Parsed" badge when backend parsing succeeds
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { UploadedDocument, FrontendParsedDocument } from '../hooks/useDocumentUpload.js';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string): string {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  if (ext === '.pdf') return '\u00A7'; // §
  if (ext === '.docx' || ext === '.doc') return '\u00B6'; // ¶
  return '\u2261'; // ≡
}

interface Props {
  documents: UploadedDocument[];
  parsedDocuments?: FrontendParsedDocument[];
  onRemove: (id: string) => void;
}

export function DocumentList({ documents, parsedDocuments = [], onRemove }: Props) {
  if (documents.length === 0) return null;

  // Build lookup for parsed data
  const parsedMap = new Map<string, FrontendParsedDocument>();
  for (const pd of parsedDocuments) {
    parsedMap.set(pd.id, pd);
  }

  return (
    <div style={styles.list}>
      {documents.map(doc => {
        const parsed = parsedMap.get(doc.id);

        return (
          <div key={doc.id} style={styles.card}>
            {/* Header row */}
            <div style={styles.headerRow}>
              <span style={styles.icon}>{getFileIcon(doc.name)}</span>
              <div style={styles.nameColumn}>
                <span style={styles.name}>{doc.name}</span>
                <span style={styles.meta}>
                  {formatSize(doc.size)}
                  {parsed && ` \u00B7 ${parsed.pageCount} pg \u00B7 ${parsed.wordCount.toLocaleString()} words`}
                </span>
              </div>
              {parsed && (
                <span style={styles.parsedBadge}>Parsed</span>
              )}
              <button
                onClick={() => onRemove(doc.id)}
                style={styles.removeBtn}
                title="Remove"
                onMouseEnter={e => { e.currentTarget.style.color = colors.danger; }}
                onMouseLeave={e => { e.currentTarget.style.color = colors.textDim; }}
              >
                {'\u00D7'}
              </button>
            </div>

            {/* Section headings preview (when parsed) */}
            {parsed && parsed.sections.length > 0 && (
              <div style={styles.sectionsPreview}>
                <span style={styles.sectionsLabel}>Sections:</span>
                {parsed.sections.slice(0, 5).map((s, i) => (
                  <span key={i} style={styles.sectionTag}>{s.heading}</span>
                ))}
                {parsed.sections.length > 5 && (
                  <span style={styles.moreTag}>+{parsed.sections.length - 5} more</span>
                )}
              </div>
            )}

            {/* Defined terms preview */}
            {parsed && parsed.definedTerms.length > 0 && (
              <div style={styles.termsPreview}>
                <span style={styles.sectionsLabel}>Terms:</span>
                <span style={styles.termsText}>
                  {parsed.definedTerms.slice(0, 6).join(', ')}
                  {parsed.definedTerms.length > 6 ? `, +${parsed.definedTerms.length - 6} more` : ''}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginTop: 12,
  },
  card: {
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 18,
    color: colors.textDim,
    flexShrink: 0,
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  name: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  meta: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  parsedBadge: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.success,
    backgroundColor: 'rgba(46, 125, 50, 0.08)',
    padding: '2px 8px',
    borderRadius: radii.sm,
    flexShrink: 0,
    letterSpacing: 0.3,
  },
  removeBtn: {
    border: 'none',
    background: 'none',
    fontSize: 18,
    color: colors.textDim,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    flexShrink: 0,
    transition: 'color 0.2s ease',
  },
  sectionsPreview: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${colors.bgPanel}`,
  },
  sectionsLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginRight: 4,
  },
  sectionTag: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel,
    padding: '1px 6px',
    borderRadius: 3,
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  moreTag: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  termsPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  termsText: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textDim,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
