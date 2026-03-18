/**
 * CoworkFolderPanel — Connected folder display inside QuickStart card.
 *
 * Shows folder name, file list with checkboxes, and a disconnect button.
 * Visual style matches DocumentList.tsx — same tokens, fonts, spacing.
 */

import type { CoworkFile, CoworkStatus } from './coworkStore.js';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface Props {
  folderName: string;
  files: CoworkFile[];
  status: CoworkStatus;
  onToggleFile: (name: string, selected: boolean) => void;
  onDisconnect: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CoworkFolderPanel({ folderName, files, status, onToggleFile, onDisconnect }: Props) {
  const selectedCount = files.filter(f => f.selected).length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={styles.folderName}>{folderName}</span>
          <span style={styles.fileCount}>
            {selectedCount}/{files.length} file{files.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={onDisconnect} style={styles.disconnectBtn} title="Disconnect folder">
          {'\u00D7'}
        </button>
      </div>

      {/* File list */}
      {status === 'reading' ? (
        <div style={styles.loadingRow}>
          <span style={styles.loadingText}>Reading folder{'\u2026'}</span>
        </div>
      ) : files.length === 0 ? (
        <div style={styles.emptyRow}>
          <span style={styles.emptyText}>No supported files found</span>
        </div>
      ) : (
        <div style={styles.fileList}>
          {files.map(file => (
            <label key={file.name} style={styles.fileRow}>
              <input
                type="checkbox"
                checked={file.selected}
                onChange={e => onToggleFile(file.name, e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.fileName}>{file.name}</span>
              <span style={styles.fileSize}>{formatSize(file.size)}</span>
            </label>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>
          Lavern will read selected files and save results here
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.sm}px ${spacing.md}px`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  folderName: {
    fontSize: 12,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileCount: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
    flexShrink: 0,
  },
  disconnectBtn: {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    fontSize: 14,
    color: colors.textMuted,
    flexShrink: 0,
    transition: 'border-color 0.15s ease, color 0.15s ease',
  },
  fileList: {
    maxHeight: 160,
    overflowY: 'auto' as const,
    padding: `0 ${spacing.md}px`,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 0',
    cursor: 'pointer',
  },
  checkbox: {
    width: 14,
    height: 14,
    flexShrink: 0,
    accentColor: colors.accent,
  },
  fileName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.text,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileSize: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
    flexShrink: 0,
  },
  loadingRow: {
    padding: `${spacing.md}px`,
    textAlign: 'center' as const,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  emptyRow: {
    padding: `${spacing.md}px`,
    textAlign: 'center' as const,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  footer: {
    padding: `${spacing.xs}px ${spacing.md}px ${spacing.sm}px`,
  },
  footerText: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic' as const,
  },
};
