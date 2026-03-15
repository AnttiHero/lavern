/**
 * ClawView — "The Night Shift."
 *
 * Remote monitoring dashboard for Claw Mode.
 * Dark hero zone, amber accent, four tabs: Overview, Documents, Deliveries, Config.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, spacing } from '../staffing/styles/tokens.js';
import { LoadingW } from '../components/LoadingW.js';
import { useClawData } from './hooks/useClawData.js';
import { useClawDemoSimulator, type ClawLogEntry } from './hooks/useClawDemoSimulator.js';
import { ClawHeader } from './components/ClawHeader.js';
import { CommandStrip } from './components/CommandStrip.js';
import { ClawTabBar, type ClawTab } from './components/ClawTabBar.js';
import { OverviewTab } from './components/OverviewTab.js';
import { DocumentsTab } from './components/DocumentsTab.js';
import { DeliveriesTab } from './components/DeliveriesTab.js';
import { ConfigTab } from './components/ConfigTab.js';

interface Props {
  onBack: () => void;
}

export default function ClawView({ onBack }: Props) {
  const { status, documents, deliveries, loading, demoMode, scanning, triggerScan, toggleEthicalMode, setStatus, setDocuments, setDeliveries } = useClawData();
  const [activeTab, setActiveTab] = useState<ClawTab>('overview');
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [activityLog, setActivityLog] = useState<ClawLogEntry[]>([]);

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
        <div style={styles.loadingWrap}>
          <LoadingW />
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <button onClick={onBack} style={styles.plainBackBtn}>{'\u2190'} Back</button>
          <div style={styles.errorBox}>
            No Claw Mode profile found. Run <code style={styles.code}>whiteshoe claw init</code> to get started.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
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
          demoMode={demoMode}
          demoPlaying={demoPlaying}
          onWatchDemo={() => { setActivityLog([]); setDemoPlaying(true); }}
          ethicalMode={status.ethicalMode}
        />

        {/* Tab navigation */}
        <ClawTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          documentCount={documents.length}
          deliveryCount={deliveries.length}
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
    backgroundColor: colors.bg,
    paddingTop: spacing.xxxl,
    paddingBottom: 80,
  },
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: `0 ${spacing.xl}px`,
  },
  loadingWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
  },
  plainBackBtn: {
    padding: '6px 14px',
    fontSize: 13,
    fontFamily: fonts.sans,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    cursor: 'pointer',
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  errorBox: {
    padding: spacing.lg,
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    border: '1px solid rgba(196, 93, 62, 0.2)',
    borderRadius: 8,
    color: colors.danger,
    fontSize: 14,
    fontFamily: fonts.sans,
    lineHeight: 1.6,
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: 13,
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    padding: '1px 6px',
    borderRadius: 3,
  },
  footer: {
    textAlign: 'center' as const,
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    marginTop: spacing.xxl,
    paddingTop: spacing.xl,
    opacity: 0.5,
  },
};
