/**
 * TheWorkTab — The primary deliverable, presented beautifully.
 *
 * Editorial layout: serif hero title, pull-quote executive summary,
 * elegant before/after transformation cards, refined dimension bars,
 * and download panel for work product export.
 */

import { useState, useMemo } from 'react';
import type { DeliveryData } from '../hooks/useDeliveryData.js';
import type { AssemblyStatus } from '../hooks/useDeliveryData.js';
import { DownloadPanel } from './DownloadPanel.js';
import { DerivativesPanel } from './DerivativesPanel.js';
import { RevisionPanel } from './RevisionPanel.js';
import { ShareTeamModal } from './ShareTeamModal.js';
import { SimpleMarkdown, type DocStyle } from './SimpleMarkdown.js';
import { useAgentProfiles, type AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
  assemblyStatus: AssemblyStatus;
  onRetryAssembly?: () => void;
}

export function TheWorkTab({ data, assemblyStatus, onRetryAssembly }: Props) {
  const [docStyle, setDocStyle] = useState<DocStyle>('elegant');
  const [activeRevisionDoc, setActiveRevisionDoc] = useState<string | null>(null);
  const [activeRevisionVersion, setActiveRevisionVersion] = useState<number | null>(null);
  const [showShareTeam, setShowShareTeam] = useState(false);

  // Resolve team role keys → AgentProfile objects so we can hand the modal
  // a complete picture for the share card. Filter out infrastructure /
  // orchestrator roles — the share card showcases the substantive lineup
  // (lawyers + specialists). Cap at 6 (the OG renderer's max).
  const { allProfiles } = useAgentProfiles();
  const teamProfiles: AgentProfile[] = useMemo(() => {
    const byRole = new Map(allProfiles.map(p => [p.role, p]));
    const roles = (data.agentPerformance ?? []).map(a => a.role);
    return roles
      .map(r => byRole.get(r))
      .filter((p): p is AgentProfile => !!p)
      .filter(p => p.category === 'lawyer' || p.category === 'specialist')
      .slice(0, 6);
  }, [allProfiles, data.agentPerformance]);
  const canShareTeam = teamProfiles.length > 0 && !data.sessionId.startsWith('demo-session');

  const displayDocument = activeRevisionDoc ?? data.finalOutput;
  const hasDocument = assemblyStatus === 'ready' && displayDocument.length > 100;
  // Only show assembly failure after polling has definitively ended (timeout/error).
  // While still polling, the assembler may still be working — don't flash the error.
  const assemblyFailed = assemblyStatus === 'timeout' || assemblyStatus === 'error';

  return (
    <div>
      {/* ── Hero title ──────────────────────────────────────────── */}
      <div style={styles.heroSection}>
        <div style={styles.heroOverline}>Delivered Work Product</div>
        <h2 style={styles.heroTitle}>{data.documentTitle}</h2>
        <div style={styles.heroDivider} />
      </div>

      {/* ── Assembly failure notice ────────────────────────────── */}
      {assemblyFailed && !data.sessionId.startsWith('demo-session') && (
        <div style={styles.assemblyFailedNotice}>
          <div style={styles.assemblyFailedIcon}>⚠</div>
          <div style={styles.assemblyFailedContent}>
            <div style={styles.assemblyFailedTitle}>Document assembly did not complete</div>
            <div style={styles.assemblyFailedBody}>
              The agents completed their analysis, but the final document could not be assembled.
              You can retry assembly, or download the structured analysis data (JSON) which contains
              all findings, debate resolutions, and recommendations.
            </div>
            {onRetryAssembly && (
              <button onClick={onRetryAssembly} style={styles.assemblyFailedRetry}>
                Retry Assembly
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Revision controls (version pills + Send back CTA) ─────────── */}
      <RevisionPanel
        sessionId={data.sessionId}
        onActiveDocumentChange={(doc, version) => {
          setActiveRevisionDoc(doc);
          setActiveRevisionVersion(version);
        }}
      />

      {/* ── Share team CTA — sits below the revision panel ─────────────── */}
      {canShareTeam && (
        <div style={styles.shareTeamRow}>
          <div style={styles.shareTeamHint}>
            <span style={styles.shareTeamLabel}>Your lineup</span>
            <span style={styles.shareTeamMembers}>
              {teamProfiles.map(p => p.displayName).join(' · ')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowShareTeam(true)}
            style={styles.shareTeamBtn}
            aria-label="Share your team as a card"
          >
            Share your team <span style={styles.shareTeamArrow}>→</span>
          </button>
        </div>
      )}

      {showShareTeam && (
        <ShareTeamModal
          agents={teamProfiles}
          defaultTitle={data.documentTitle}
          onClose={() => setShowShareTeam(false)}
        />
      )}

      {/* ── Document preview — the deliverable is what the client came for ── */}
      {hasDocument && (
        <div style={styles.previewSection}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>
              Document Preview
              {activeRevisionVersion ? ` · v${activeRevisionVersion}` : ''}
            </div>
            <div style={styles.sectionCount}>{displayDocument.length.toLocaleString()} chars</div>
          </div>
          <div style={styles.previewCard}>
            {data.sessionId.startsWith('demo-session') && (
              <div style={styles.mockBanner}>MOCK DOCUMENT</div>
            )}
            <SimpleMarkdown
              docStyle={docStyle}
              content={
                displayDocument.substring(0, 5000) +
                (displayDocument.length > 5000 ? '\n\n---\n\n*... download full document below*' : '')
              }
            />
          </div>
        </div>
      )}

      {/* ── Executive summary — editorial pull-quote style ─────── */}
      <div style={styles.summarySection}>
        <div style={styles.summaryQuoteMark}>{'\u201C'}</div>
        <p style={styles.summaryText}>{data.executiveSummary}</p>
        <div style={styles.summaryLabel}>Analysis Summary</div>
      </div>

      {/* ── Downloads — below the content ───────────────────────── */}
      <DownloadPanel
        data={data}
        assemblyStatus={assemblyStatus}
        onRetry={onRetryAssembly}
        selectedStyle={docStyle}
        onStyleChange={setDocStyle}
      />


      {/* ── Derivatives — live sessions only ────────────────────── */}
      {!data.sessionId.startsWith('demo-session') && (
        <DerivativesPanel data={data} assemblyStatus={assemblyStatus} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // ── Share team row ─────────────────────────────────────────────
  shareTeamRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: `${spacing.sm}px ${spacing.md}px`,
    background: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    flexWrap: 'wrap' as const,
  },
  shareTeamHint: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  shareTeamLabel: {
    fontSize: 9,
    fontWeight: 700,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  shareTeamMembers: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    maxWidth: 600,
  },
  shareTeamBtn: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSelected}`,
    borderRadius: radii.sm,
    padding: '7px 16px',
    cursor: 'pointer',
    minHeight: 34,
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  shareTeamArrow: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 1,
  },

  // ── Hero ──────────────────────────────────────────────────────
  heroSection: {
    textAlign: 'center' as const,
    marginBottom: spacing.xxl,
  },
  heroOverline: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.5,
    lineHeight: 1.2,
  },
  heroDivider: {
    width: 48,
    height: 1,
    backgroundColor: colors.accent,
    margin: '20px auto 0',
    opacity: 0.5,
  },

  // ── Executive Summary ──────────────────────────────────────────
  summarySection: {
    position: 'relative' as const,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '36px 40px 28px',
    marginBottom: spacing.xxl,
  },
  summaryQuoteMark: {
    position: 'absolute' as const,
    top: 12,
    left: 24,
    fontSize: 48,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.accent,
    opacity: 0.25,
    lineHeight: 1,
    userSelect: 'none' as const,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 1.8,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontWeight: 400,
    margin: 0,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginTop: 20,
    textAlign: 'right' as const,
  },

  // ── Assembly Failed Notice ─────────────────────────────────────
  assemblyFailedNotice: {
    display: 'flex',
    gap: 16,
    padding: '20px 24px',
    backgroundColor: 'rgba(180, 60, 60, 0.04)',
    border: '1px solid rgba(180, 60, 60, 0.2)',
    borderRadius: radii.sm,
    marginBottom: spacing.xxl,
  },
  assemblyFailedIcon: {
    fontSize: 24,
    flexShrink: 0,
    lineHeight: 1,
  },
  assemblyFailedContent: {
    flex: 1,
  },
  assemblyFailedTitle: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 8,
  },
  assemblyFailedBody: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  assemblyFailedRetry: {
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: '#fff',
    backgroundColor: colors.accent,
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },

  // ── Document Preview ──────────────────────────────────────────
  previewSection: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  previewCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: spacing.xl,
    maxHeight: 600,
    overflow: 'auto' as const,
  },
  mockBanner: {
    display: 'inline-block',
    fontSize: 9,
    fontWeight: 700,
    fontFamily: fonts.sans,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: colors.textDim,
    border: `1px solid ${colors.border}`,
    borderRadius: 2,
    padding: '3px 8px',
    marginBottom: 20,
  },
  // previewText removed — replaced by SimpleMarkdown renderer

  // ── Sections ──────────────────────────────────────────────────
  section: { marginBottom: spacing.xxl },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },

  // ── Key Changes ───────────────────────────────────────────────
  changesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  changeCard: {
    display: 'flex',
    gap: 20,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: `${spacing.lg}px ${spacing.xl}px`,
  },
  changeNumber: {
    fontSize: 20,
    fontWeight: 300,
    fontFamily: fonts.sans,
    color: colors.border,
    lineHeight: 1,
    flexShrink: 0,
    width: 32,
    paddingTop: 2,
  },
  changeContent: {
    flex: 1,
    minWidth: 0,
  },
  changeTitle: {
    fontSize: 15,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 12,
  },
  changeColumns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: spacing.lg,
  },
  changeBefore: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  changeAfter: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  changeColumnLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  changeDotBefore: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.textDim,
    opacity: 0.4,
  },
  changeDotAfter: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.accent,
  },
  changeColumnText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
  },

  // ── Dimensions ────────────────────────────────────────────────
  dimensionsCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: `${spacing.md}px ${spacing.xl}px`,
  },
  dimensionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: '12px 0',
  },
  dimensionLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.text,
    flexShrink: 0,
  },
  barOuter: {
    flex: 1,
  },
  barRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.bgPanel,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barBefore: {
    height: '100%',
    backgroundColor: 'rgba(26, 26, 26, 0.15)',
    borderRadius: 2,
  },
  barAfter: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
    opacity: 0.7,
  },
  scoreGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontFamily: fonts.mono,
    flexShrink: 0,
    width: 80,
  },
  scoreBefore: { color: colors.textDim },
  scoreArrow: { color: colors.textDim, fontSize: 10 },
  scoreAfter: { color: colors.text, fontWeight: 600 },
  deltaTag: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: colors.success,
    backgroundColor: 'rgba(46, 125, 50, 0.06)',
    padding: '2px 8px',
    borderRadius: radii.sm,
    flexShrink: 0,
  },

};
