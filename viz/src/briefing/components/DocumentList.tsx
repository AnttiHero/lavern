/**
 * DocumentList — Row list of uploaded files with remove button.
 */

import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import type { UploadedDocument } from '../hooks/useDocumentUpload.js';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  documents: UploadedDocument[];
  onRemove: (id: string) => void;
}

export function DocumentList({ documents, onRemove }: Props) {
  if (documents.length === 0) return null;

  return (
    <div style={styles.list}>
      {documents.map(doc => (
        <div key={doc.id} style={styles.row}>
          <span style={styles.icon}>{'\u00A7'}</span>
          <span style={styles.name}>{doc.name}</span>
          <span style={styles.size}>{formatSize(doc.size)}</span>
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
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 12,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  icon: {
    fontSize: 14,
    color: colors.textDim,
    flexShrink: 0,
  },
  name: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.text,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  size: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    flexShrink: 0,
  },
  removeBtn: {
    border: 'none',
    background: 'none',
    fontSize: 16,
    color: colors.textDim,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    flexShrink: 0,
    transition: 'color 0.2s ease',
  },
};
