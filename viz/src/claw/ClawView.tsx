/**
 * ClawView — "The Night Shift."
 *
 * Remote monitoring dashboard for Claw Mode.
 * Dark hero zone, amber accent, four tabs: Overview, Documents, Deliveries, Config.
 */

import { useState, useCallback, useEffect } from 'react';
import { fonts, spacing } from '../staffing/styles/tokens.js';
import { CLAW } from './theme.js';
import { LoadingW } from '../components/LoadingW.js';
import { useClawData } from './hooks/useClawData.js';
import { useClawDemoSimulator, type ClawLogEntry } from './hooks/useClawDemoSimulator.js';
import { ClawHeader } from './components/ClawHeader.js';
import { CommandStrip } from './components/CommandStrip.js';
import { ClawTabBar, type ClawTab } from './components/ClawTabBar.js';
import { OverviewTab } from './components/OverviewTab.js';
import { DocumentsTab } from './components/DocumentsTab.js';
import { DeliveriesTab } from './components/DeliveriesTab.js';
import { PrecedentsTab } from './components/PrecedentsTab.js';
import { ConfigTab } from './components/ConfigTab.js';

interface Props {
  onBack: () => void;
}

export default function ClawView({ onBack }: Props) {
  const { status, documents, deliveries, precedents, precedentSummary, loading, demoMode, scanning, paused, triggerScan, toggleEthicalMode, togglePause, setStatus, setDocuments, setDeliveries } = useClawData();
  const [activeTab, setActiveTab] = useState<ClawTab>('overview');
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [activityLog, setActivityLog] = useState<ClawLogEntry[]>([]);

  // Auto-start demo when landing via ?demo=true
  useEffect(() => {
    if (window.location.hash.includes('?demo=true') && !loading && status) {
      setActivityLog([]);
      setDemoPlaying(true);
      setActiveTab('overview');
    }
  }, [loading, status]);

  useClawDemoSimulator({
    active: demoPlaying,
    onStatusUpdate: useCallback((fn: (s: any) => any) => setStatus(prev => prev ? fn(prev) : prev), [setStatus]),
    onDocumentsUpdate: setDocuments,
    onDeliveriesUpdate: setDeliveries,
    onLogEntry: useCallback((entry: ClawLogEntry) => setActivityLog(prev => [...prev, entry]), []),
    onComplete: useCallback(() => setDemoPlaying(false), []),
  });

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.grain} />
        <div style={styles.fog} />
        <div style={styles.loadingWrap}>
          <LoadingW />
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={styles.page}>
        <div style={styles.grain} />
        <div style={styles.fog} />
        <div style={styles.container}>
          <button onClick={onBack} style={styles.plainBackBtn}>{'\u2190'} Back</button>
          <div style={styles.errorBox}>
            No Clawern profile found. Run <code style={styles.code}>lavern claw init</code> to get started.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Film grain overlay — matches lavern.ai/claw */}
      <div style={styles.grain} />
      {/* Fog vignette */}
      <div style={styles.fog} />
      <div style={styles.container}>
        {/* Dark hero header */}
        <ClawHeader
          company={status.profile.company}
          jurisdiction={status.profile.jurisdiction}
          industry={status.profile.industry}
          daemon={status.daemon}
          demoMode={demoMode}
          onBack={onBack}
        />

        {/* Persistent command strip */}
        <CommandStrip
          lastScan={status.lastScan}
          scanning={scanning}
          budget={status.budget}
          onScan={triggerScan}
          paused={paused}
          onTogglePause={togglePause}
          demoMode={demoMode}
          demoPlaying={demoPlaying}
          onWatchDemo={() => { setActivityLog([]); setDemoPlaying(true); setActiveTab('overview'); }}
          ethicalMode={status.ethicalMode}
        />

        {/* Tab navigation */}
        <ClawTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          documentCount={documents.length}
          deliveryCount={deliveries.length}
          precedentCount={precedents.length}
        />

        {/* Tab content */}
        {activeTab === 'overview' && (
          <OverviewTab
            status={status}
            documents={documents}
            deliveries={deliveries}
            demoMode={demoMode}
            activityLog={activityLog}
          />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            documents={documents}
            demoMode={demoMode}
          />
        )}
        {activeTab === 'deliveries' && (
          <DeliveriesTab
            deliveries={deliveries}
          />
        )}
        {activeTab === 'precedents' && (
          <PrecedentsTab
            precedents={precedents}
            summary={precedentSummary}
            demoMode={demoMode}
          />
        )}
        {activeTab === 'config' && (
          <ConfigTab
            profile={status.profile}
            watchPaths={status.watchPaths}
            budget={{ totalUsd: status.budget.totalUsd }}
            demoMode={demoMode}
            ethicalMode={status.ethicalMode}
            onToggleEthical={toggleEthicalMode}
            lastHeartbeat={status.lastHeartbeat}
          />
        )}

        {/* Footer */}
        <div style={styles.footer}>
          It works while you sleep.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: CLAW.bg,
    paddingTop: spacing.xxxl,
    paddingBottom: 80,
    position: 'relative',
    isolation: 'isolate',
  },
  // Film grain overlay — SVG feTurbulence, 0.65 opacity, subtle animation
  grain: {
    position: 'fixed',
    inset: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)' opacity='0.65'/%3E%3C/svg%3E")`,
    opacity: 0.18,
    pointerEvents: 'none',
    zIndex: 1,
    mixBlendMode: 'overlay',
  },
  // Radial fog vignette
  fog: {
    position: 'fixed',
    inset: 0,
    background: 'radial-gradient(ellipse at 50% 0%, rgba(232,132,92,0.04) 0%, transparent 60%), radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.5) 0%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: `0 ${spacing.xl}px`,
    position: 'relative',
    zIndex: 2,
  },
  loadingWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    position: 'relative',
    zIndex: 2,
  },
  plainBackBtn: {
    padding: '6px 14px',
    fontSize: 13,
    fontFamily: fonts.sans,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: 4,
    cursor: 'pointer',
    color: CLAW.textSecondary,
    marginBottom: spacing.lg,
  },
  errorBox: {
    padding: spacing.lg,
    backgroundColor: CLAW.dangerBg,
    border: `1px solid ${CLAW.dangerBorder}`,
    borderRadius: 8,
    color: CLAW.danger,
    fontSize: 14,
    fontFamily: fonts.sans,
    lineHeight: 1.6,
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: 13,
    backgroundColor: CLAW.dangerBg,
    color: CLAW.danger,
    padding: '1px 6px',
    borderRadius: 3,
  },
  footer: {
    textAlign: 'center' as const,
    fontSize: 13,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: CLAW.textMuted,
    marginTop: spacing.xxl,
    paddingTop: spacing.xl,
    letterSpacing: 0.3,
  },
};
