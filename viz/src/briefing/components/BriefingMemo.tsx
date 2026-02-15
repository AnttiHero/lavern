/**
 * BriefingMemo — Generated briefing memo display with edit toggle.
 */

import { useState } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  memoText: string;
  onMemoChange: (text: string) => void;
  onCommence: () => void;
}

export function BriefingMemo({ memoText, onMemoChange, onCommence }: Props) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div style={styles.container}>
      {/* Memo card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Briefing Memo</span>
          <span style={styles.draft}>DRAFT</span>
        </div>

        {isEditing ? (
          <textarea
            value={memoText}
            onChange={e => onMemoChange(e.target.value)}
            style={styles.textarea}
            rows={16}
          />
        ) : (
          <div style={styles.memoBody}>
            {memoText.split('\n').map((line, i) => {
              if (line.startsWith('# ')) {
                return null; // Skip top-level heading (shown as card title)
              }
              if (line.startsWith('## ')) {
                return (
                  <h3 key={i} style={styles.sectionHeading}>
                    {line.replace('## ', '')}
                  </h3>
                );
              }
              if (line.startsWith('### ')) {
                return (
                  <h4 key={i} style={styles.subHeading}>
                    {line.replace('### ', '')}
                  </h4>
                );
              }
              if (line.startsWith('**') && line.endsWith('**')) {
                return (
                  <div key={i} style={styles.label}>
                    {line.replace(/\*\*/g, '')}
                  </div>
                );
              }
              if (line.startsWith('- ')) {
                return (
                  <div key={i} style={styles.listItem}>
                    {'\u2022'} {line.replace('- ', '')}
                  </div>
                );
              }
              if (line.trim() === '') {
                return <div key={i} style={{ height: 8 }} />;
              }
              return (
                <div key={i} style={styles.paragraph}>
                  {line}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button
          onClick={() => setIsEditing(!isEditing)}
          style={styles.editBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
        >
          {isEditing ? 'Preview' : 'Edit'}
        </button>
        <button
          onClick={onCommence}
          style={styles.commenceBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        >
          Continue to Staffing {'\u2192'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottom: `1px solid ${colors.border}`,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
  },
  draft: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '2px 8px',
    borderRadius: radii.pill,
  },
  textarea: {
    width: '100%',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 1.6,
    padding: '12px 14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: 200,
  },
  memoBody: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    margin: '16px 0 4px 0',
  },
  subHeading: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textSecondary,
    margin: '12px 0 4px 0',
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    marginTop: 4,
  },
  listItem: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    paddingLeft: 8,
  },
  paragraph: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editBtn: {
    padding: '8px 16px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  commenceBtn: {
    padding: '11px 28px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
};
