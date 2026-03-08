/**
 * CreateCollectionModal — Inline form for creating a new KB collection.
 */

import { useState } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

const DOC_TYPES = [
  { value: 'precedent', label: 'Precedent' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'regulation', label: 'Regulation' },
  { value: 'template', label: 'Template' },
  { value: 'other', label: 'Other' },
];

interface Props {
  onCreate: (opts: { name: string; description?: string; docType?: string; jurisdiction?: string }) => Promise<void>;
  onCancel: () => void;
}

export function CreateCollectionModal({ onCreate, onCancel }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [docType, setDocType] = useState('precedent');
  const [jurisdiction, setJurisdiction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        docType,
        jurisdiction: jurisdiction.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.label}>New Collection</div>

      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Collection name"
        style={styles.input}
        autoFocus
      />

      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        style={{ ...styles.input, resize: 'vertical' as const }}
      />

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <span style={styles.fieldLabel}>Type</span>
          <select value={docType} onChange={e => setDocType(e.target.value)} style={styles.select}>
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div style={styles.fieldGroup}>
          <span style={styles.fieldLabel}>Jurisdiction</span>
          <input
            type="text"
            value={jurisdiction}
            onChange={e => setJurisdiction(e.target.value)}
            placeholder="e.g. US, EU, UK"
            style={{ ...styles.input, marginBottom: 0 }}
          />
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.actions}>
        <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          style={{
            ...styles.createBtn,
            opacity: submitting || !name.trim() ? 0.4 : 1,
          }}
        >
          {submitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.accent}`,
    borderRadius: radii.md,
    padding: spacing.xl,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.accent,
    marginBottom: spacing.md,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgInput,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.sm,
    boxSizing: 'border-box' as const,
  },
  row: {
    display: 'flex',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  fieldGroup: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    display: 'block',
    marginBottom: 4,
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgInput,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.text,
  },
  error: {
    fontSize: 11,
    color: '#C45D3E',
    fontFamily: fonts.sans,
    marginBottom: spacing.sm,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    padding: '6px 16px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 11,
    cursor: 'pointer',
  },
  createBtn: {
    padding: '6px 20px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },
};
