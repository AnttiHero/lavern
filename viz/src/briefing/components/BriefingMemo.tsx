/**
 * BriefingMemo — Engagement Brief display with edit toggle.
 *
 * When an EngagementBrief is provided, renders structured sections.
 * Falls back to raw markdown rendering when only memoText is available.
 * Edit toggle switches to raw text for manual overrides.
 */

import { useState } from 'react';
import type { EngagementBrief, Sufficiency } from '../hooks/useBriefingAnalysis.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  memoText: string;
  onMemoChange: (text: string) => void;
  onCommence: () => void;
  engagementBrief?: EngagementBrief | null;
  sufficiency?: Sufficiency | null;
}

export function BriefingMemo({
  memoText,
  onMemoChange,
  onCommence,
  engagementBrief,
  sufficiency,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div style={styles.container}>
      {/* Memo card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Engagement Brief</span>
          <div style={styles.headerRight}>
            {sufficiency && (
              <span style={{
                ...styles.sufficiencyBadge,
                borderColor: sufficiency.verdict === 'strong' ? colors.success
                  : sufficiency.verdict === 'adequate' ? colors.warning
                  : colors.danger,
                color: sufficiency.verdict === 'strong' ? colors.success
                  : sufficiency.verdict === 'adequate' ? colors.warning
                  : colors.danger,
              }}>
                Context: {sufficiency.score}%
              </span>
            )}
            <span style={styles.draft}>DRAFT</span>
          </div>
        </div>

        {isEditing ? (
          <textarea
            value={memoText}
            onChange={e => onMemoChange(e.target.value)}
            style={styles.textarea}
            rows={16}
          />
        ) : engagementBrief ? (
          /* Structured brief rendering */
          <div style={styles.memoBody}>
            {/* Objective */}
            <h3 style={styles.sectionHeading}>Objective</h3>
            <div style={styles.paragraph}>{engagementBrief.objective}</div>

            {/* Summary */}
            <h3 style={styles.sectionHeading}>Summary</h3>
            <div style={styles.paragraph}>{engagementBrief.summary}</div>

            {/* Document Analysis */}
            {engagementBrief.documentAnalysis && (
              <>
                <h3 style={styles.sectionHeading}>Document Analysis</h3>
                <div style={styles.paragraph}>{engagementBrief.documentAnalysis}</div>
              </>
            )}

            {/* Scope & Constraints */}
            <h3 style={styles.sectionHeading}>Scope & Constraints</h3>
            <div style={styles.paragraph}>{engagementBrief.scopeAndConstraints}</div>

            {/* Risk Factors */}
            {engagementBrief.riskFactors.length > 0 && (
              <>
                <h3 style={styles.sectionHeading}>Risk Factors</h3>
                {engagementBrief.riskFactors.map((risk, i) => (
                  <div key={i} style={styles.listItem}>
                    <span style={{ color: colors.danger }}>{'\u2022'}</span> {risk}
                  </div>
                ))}
              </>
            )}

            {/* Success Criteria */}
            {engagementBrief.successCriteria.length > 0 && (
              <>
                <h3 style={styles.sectionHeading}>Success Criteria</h3>
                {engagementBrief.successCriteria.map((criterion, i) => (
                  <div key={i} style={styles.listItem}>
                    <span style={{ color: colors.success }}>{'\u2022'}</span> {criterion}
                  </div>
                ))}
              </>
            )}

            {/* Special Instructions */}
            {engagementBrief.specialInstructions?.trim() && (
              <>
                <h3 style={styles.sectionHeading}>Special Instructions</h3>
                <div style={styles.paragraph}>{engagementBrief.specialInstructions}</div>
              </>
            )}
          </div>
        ) : (
          /* Fallback: raw markdown rendering */
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
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sufficiencyBadge: {
    fontSize: 10,
    fontFamily: fonts.mono,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.pill,
    border: '1px solid',
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
    resize: 'vertical' as const,
    minHeight: 200,
    boxSizing: 'border-box' as const,
  },
  memoBody: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
    margin: '18px 0 6px 0',
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
    lineHeight: 1.6,
  },
  paragraph: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
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
    padding: '14px 44px',
    borderRadius: 100,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
};
