/**
 * DocumentDropZone — Drag & drop area + click to browse.
 */

import { useResponsive } from '../../hooks/useMediaQuery.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface Props {
  isDragOver: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onClick: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function DocumentDropZone({
  isDragOver,
  inputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onClick,
  onFileInput,
}: Props) {
  const { isMobile } = useResponsive();

  // On touch devices, show a prominent upload button instead of drag-drop hints
  if (isMobile) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <button
          type="button"
          onClick={onClick}
          style={styles.mobileButton}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 8 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Files
        </button>
        <div style={styles.formats}>PDF, DOC, DOCX, TXT, MD, RTF, HTML</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html"
          onChange={onFileInput}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      style={{
        ...styles.zone,
        borderColor: isDragOver ? colors.accent : colors.border,
        backgroundColor: isDragOver ? colors.accentLight : colors.bgPanel,
      }}
    >
      {/* Document icon */}
      <div style={styles.icon}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="1.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>

      <div style={styles.text}>Drop documents here</div>
      <div style={styles.hint}>or click to browse</div>
      <div style={styles.formats}>PDF, DOC, DOCX, TXT, MD, RTF, HTML</div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html"
        onChange={onFileInput}
        style={{ display: 'none' }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  zone: {
    border: `2px dashed ${colors.border}`,
    borderRadius: radii.lg,
    padding: '40px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  icon: {
    marginBottom: 12,
    opacity: 0.5,
  },
  text: {
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    marginTop: 4,
  },
  formats: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    marginTop: 8,
    letterSpacing: 0.3,
  },
  mobileButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    padding: '12px 32px',
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: colors.text,
    border: 'none',
    borderRadius: radii.md,
    cursor: 'pointer',
    letterSpacing: 0.3,
    width: '100%',
  } as React.CSSProperties,
};
