/**
 * QuickDropZone — "Drop & Go" mode.
 *
 * Full drag-drop zone that reads the file, infers matter fields from
 * the filename and content, then shows an editable summary card.
 */

import { useState, useCallback, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { ClientFormData } from '../hooks/useIntakeState.js';

interface Props {
  onSubmit: (data: ClientFormData) => void;
  loading: boolean;
}

// Keyword → matter type mapping
const KEYWORD_TYPE_MAP: Array<{ keywords: string[]; type: string; label: string }> = [
  { keywords: ['contract', 'agreement', 'terms', 'tos', 'eula', 'license', 'nda'], type: 'contract_review', label: 'Contract Review' },
  { keywords: ['design', 'template', 'layout', 'branding', 'visual', 'review', 'improve', 'redraft'], type: 'document_redesign', label: 'Document Review' },
  { keywords: ['research', 'memo', 'memorandum', 'brief', 'analysis'], type: 'legal_research', label: 'Legal Research' },
  { keywords: ['advisory', 'opinion', 'question', 'query', 'counsel'], type: 'legal_question', label: 'Legal Advisory' },
  { keywords: ['risk', 'assessment', 'compliance', 'audit', 'review'], type: 'risk_assessment', label: 'Risk Assessment' },
];

function inferMatterType(text: string): { type: string; label: string } {
  const lower = text.toLowerCase();
  for (const entry of KEYWORD_TYPE_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return { type: entry.type, label: entry.label };
    }
  }
  return { type: 'general', label: 'General' };
}

function humanizeFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '') // strip extension
    .replace(/[-_]+/g, ' ') // replace separators
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
    .replace(/\b\w/g, c => c.toUpperCase()); // title case
}

interface InferredData {
  clientName: string;
  matterTitle: string;
  matterDescription: string;
  matterType: string;
  matterTypeLabel: string;
  jurisdiction: string;
  estimatedBudgetUsd: number;
  feeStructure: string;
  fileName: string;
}

export function QuickDropZone({ onSubmit, loading }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [inferred, setInferred] = useState<InferredData | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const title = humanizeFilename(file.name);
    const typeInfo = inferMatterType(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const description = content.slice(0, 500).trim() || `Uploaded document: ${file.name}`;
      // Re-check type from content if filename was generic
      const contentType = typeInfo.type === 'general' ? inferMatterType(content) : typeInfo;

      setInferred({
        clientName: 'Client',
        matterTitle: title,
        matterDescription: description,
        matterType: contentType.type,
        matterTypeLabel: contentType.label,
        jurisdiction: 'US',
        estimatedBudgetUsd: 10,
        feeStructure: 'hourly',
        fileName: file.name,
      });
    };
    reader.onerror = () => {
      // FileReader failed — fall through to filename-only inference
      setInferred({
        clientName: 'Client',
        matterTitle: title,
        matterDescription: `Uploaded document: ${file.name}`,
        matterType: typeInfo.type,
        matterTypeLabel: typeInfo.label,
        jurisdiction: 'US',
        estimatedBudgetUsd: 10,
        feeStructure: 'hourly',
        fileName: file.name,
      });
    };

    if (
      file.type.startsWith('text/') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.rtf')
    ) {
      reader.readAsText(file);
    } else {
      // For binary files, just use filename
      setInferred({
        clientName: 'Client',
        matterTitle: title,
        matterDescription: `Uploaded document: ${file.name}`,
        matterType: typeInfo.type,
        matterTypeLabel: typeInfo.label,
        jurisdiction: 'US',
        estimatedBudgetUsd: 10,
        feeStructure: 'hourly',
        fileName: file.name,
      });
    }
  }, []);

  const handlePasteSubmit = useCallback(() => {
    if (!pasteText.trim()) return;
    const typeInfo = inferMatterType(pasteText);
    const firstLine = pasteText.split('\n')[0]?.trim().slice(0, 80) || 'Pasted matter';
    setInferred({
      clientName: 'Client',
      matterTitle: firstLine,
      matterDescription: pasteText.slice(0, 500).trim(),
      matterType: typeInfo.type,
      matterTypeLabel: typeInfo.label,
      jurisdiction: 'US',
      estimatedBudgetUsd: 10,
      feeStructure: 'hourly',
      fileName: '',
    });
  }, [pasteText]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }, [processFile]);

  const handleConfirm = useCallback(() => {
    if (!inferred) return;
    onSubmit({
      clientName: inferred.clientName,
      matterTitle: inferred.matterTitle,
      matterDescription: inferred.matterDescription,
      matterType: inferred.matterType,
      jurisdiction: inferred.jurisdiction,
      estimatedBudgetUsd: inferred.estimatedBudgetUsd,
      feeStructure: inferred.feeStructure,
    });
  }, [inferred, onSubmit]);

  const updateField = useCallback((key: keyof InferredData, value: string) => {
    setInferred(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  // ── Inferred summary card ──────────────────────────────────────────
  if (inferred) {
    return (
      <div style={styles.summaryContainer}>
        <div style={styles.summaryTitle}>
          {inferred.fileName ? `Inferred from ${inferred.fileName}` : 'Inferred from text'}
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Client</span>
            <input
              style={styles.fieldInput}
              value={inferred.clientName}
              onChange={e => updateField('clientName', e.target.value)}
            />
          </div>
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Matter</span>
            <input
              style={styles.fieldInput}
              value={inferred.matterTitle}
              onChange={e => updateField('matterTitle', e.target.value)}
            />
          </div>
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Type</span>
            <span style={styles.typeBadge}>{inferred.matterTypeLabel}</span>
          </div>
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Region</span>
            <input
              style={{ ...styles.fieldInput, maxWidth: 80 }}
              value={inferred.jurisdiction}
              onChange={e => updateField('jurisdiction', e.target.value)}
            />
          </div>
        </div>

        <div style={styles.confirmRow}>
          <button onClick={() => setInferred(null)} style={styles.redoBtn}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
          >
            {'\u2190'} Start over
          </button>
          <button onClick={handleConfirm} disabled={loading} style={{
            ...styles.confirmBtn,
            opacity: loading ? 0.6 : 1,
          }}
            onMouseEnter={e => { if (!loading) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          >
            {loading ? 'Running checks...' : 'Looks good \u2192'}
          </button>
        </div>
      </div>
    );
  }

  // ── Drop zone ──────────────────────────────────────────────────────
  return (
    <div style={styles.dropContainer}>
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={e => { e.preventDefault(); setIsDragOver(false); }}
        onClick={() => inputRef.current?.click()}
        style={{
          ...styles.zone,
          borderColor: isDragOver ? colors.accent : colors.border,
          backgroundColor: isDragOver ? colors.accentLight : colors.bgPanel,
          transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <div style={styles.dropIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={isDragOver ? colors.accent : colors.textDim} strokeWidth="1.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <line x1="12" y1="12" x2="12" y2="18" />
            <path d="M9 15l3-3 3 3" />
          </svg>
        </div>

        <div style={styles.dropTitle}>Drop a document here</div>
        <div style={styles.dropHint}>
          PDF, DOC, TXT, MD — we'll figure out the rest
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      <div style={styles.orRow}>
        <div style={styles.orLine} />
        <span style={styles.orText}>or</span>
        <div style={styles.orLine} />
      </div>

      {pasteMode ? (
        <div style={styles.pasteArea}>
          <textarea
            autoFocus
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste contract text, matter description, or any relevant content..."
            style={styles.pasteInput}
            rows={5}
          />
          <div style={styles.pasteActions}>
            <button onClick={() => setPasteMode(false)} style={styles.cancelBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textDim; b.style.borderColor = colors.border; }}
            >Cancel</button>
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              style={{
                ...styles.pasteSubmitBtn,
                opacity: pasteText.trim() ? 1 : 0.4,
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            >
              Analyze Text {'\u2192'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setPasteMode(true)} style={styles.pasteToggle}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
        >
          Paste text instead
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dropContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.lg,
  },
  zone: {
    width: '100%',
    border: '2px dashed',
    borderRadius: radii.lg,
    padding: '48px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  dropIcon: { marginBottom: 12, opacity: 0.6 },
  dropTitle: {
    fontSize: 16, fontFamily: fonts.sans, fontWeight: 500,
    color: colors.textSecondary,
  },
  dropHint: {
    fontSize: 12, fontFamily: fonts.sans, color: colors.textDim,
    marginTop: 6,
  },
  orRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', maxWidth: 300,
  },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 11, color: colors.textDim, fontFamily: fonts.sans },

  pasteToggle: {
    padding: '8px 20px', borderRadius: radii.sm,
    border: `1px solid ${colors.border}`, backgroundColor: 'transparent',
    color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12,
    cursor: 'pointer', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  pasteArea: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 8,
  },
  pasteInput: {
    width: '100%', padding: '12px 14px',
    backgroundColor: colors.bgInput, border: `1px solid ${colors.border}`,
    borderRadius: radii.md, fontFamily: fonts.sans, fontSize: 13,
    color: colors.text, resize: 'vertical', lineHeight: 1.5,
  },
  pasteActions: {
    display: 'flex', justifyContent: 'space-between',
  },
  cancelBtn: {
    padding: '6px 14px', borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`, backgroundColor: 'transparent',
    color: colors.textDim, fontFamily: fonts.sans, fontSize: 12,
    cursor: 'pointer', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  pasteSubmitBtn: {
    padding: '8px 20px', borderRadius: radii.sm,
    border: `2px solid ${colors.text}`, backgroundColor: colors.text, color: '#fff',
    fontFamily: fonts.sans, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  // ── Summary card ──────────────────────────────────────────────────
  summaryContainer: {
    display: 'flex', flexDirection: 'column', gap: spacing.md,
  },
  summaryTitle: {
    fontSize: 12, fontFamily: fonts.sans, fontWeight: 500,
    color: colors.textDim, textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryCard: {
    backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`,
    borderRadius: radii.lg, padding: spacing.lg,
    display: 'flex', flexDirection: 'column', gap: spacing.sm,
  },
  fieldRow: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  fieldLabel: {
    fontSize: 11, fontFamily: fonts.sans, fontWeight: 600,
    color: colors.textDim, width: 56, flexShrink: 0,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldInput: {
    flex: 1, padding: '6px 10px',
    backgroundColor: colors.bgInput, border: `1px solid ${colors.border}`,
    borderRadius: radii.sm, fontFamily: fonts.sans, fontSize: 13,
    color: colors.text,
  },
  typeBadge: {
    fontSize: 12, fontFamily: fonts.sans, fontWeight: 500,
    color: colors.accent, backgroundColor: colors.accentLight,
    padding: '3px 10px', borderRadius: radii.pill,
  },
  confirmRow: {
    display: 'flex', justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  redoBtn: {
    padding: '8px 16px', borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`, backgroundColor: 'transparent',
    color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12,
    cursor: 'pointer', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  confirmBtn: {
    padding: '10px 24px', borderRadius: radii.sm,
    border: `2px solid ${colors.text}`, backgroundColor: colors.text, color: '#fff',
    fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
};
