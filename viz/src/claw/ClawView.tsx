/**
 * ClawView — The firm's remote dashboard.
 *
 * Shows Claw Mode status when running on a Mac Mini (or anywhere).
 * Polls GET /api/claw/status and /api/claw/documents for live data.
 */

import { useState, useEffect, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

// ── Types ───────────────────────────────────────────────────────────────

interface ClawStatus {
  profile: {
    company: string;
    jurisdiction: string;
    industry: string;
    intensity: string;
    style: string;
    createdAt: string;
  };
  watchPaths: string[];
  budget: {
    totalUsd: number;
    spentUsd: number;
    remainingUsd: number;
    exhausted: boolean;
  };
  documents: {
    total: number;
    reviewed: number;
    flagged: number;
    pending: number;
    errors: number;
    confidential: number;
    frontier: number;
  };
  sessions: {
    completed: number;
    failed: number;
  };
  lastScan: string;
  daemon: {
    installed: boolean;
    running: boolean;
    pid?: number;
  };
}

interface ClawDocument {
  name: string;
  path: string;
  type: string;
  status: string;
  sizeBytes: number;
  lastModified: string;
  lastReviewed: string | null;
  findings: { critical: number; major: number; minor: number } | null;
  costUsd: number | null;
  error: string | null;
  confidential: boolean;
}

interface Props {
  onBack: () => void;
}

// ── Component ───────────────────────────────────────────────────────────

export default function ClawView({ onBack }: Props) {
  const [status, setStatus] = useState<ClawStatus | null>(null);
  const [documents, setDocuments] = useState<ClawDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, docsRes] = await Promise.all([
        fetch('/api/claw/status', { credentials: 'include' }),
        fetch('/api/claw/documents', { credentials: 'include' }),
      ]);

      if (statusRes.status === 404) {
        setError('No Claw Mode profile found. Run `marble claw init` first.');
        setLoading(false);
        return;
      }

      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents ?? []);
      }
      setError(null);
    } catch {
      setError('Cannot connect to the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + poll every 10s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await fetch('/api/claw/scan', { method: 'POST', credentials: 'include' });
      await fetchData();
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Loading Claw Mode status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <button onClick={onBack} style={styles.backButton}>Back</button>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (!status) return null;

  const budgetPct = status.budget.totalUsd > 0
    ? (status.budget.spentUsd / status.budget.totalUsd) * 100
    : 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>Back</button>
        <div>
          <h1 style={styles.title}>Claw Mode</h1>
          <p style={styles.subtitle}>
            {status.profile.company} &middot; {status.profile.jurisdiction} &middot; {status.profile.industry}
          </p>
        </div>
        <div style={styles.daemonBadge}>
          <span style={{
            ...styles.statusDot,
            backgroundColor: status.daemon.running ? colors.success : colors.textMuted,
          }} />
          {status.daemon.running ? `Running (PID ${status.daemon.pid ?? '?'})` : status.daemon.installed ? 'Installed (stopped)' : 'Not installed'}
        </div>
      </div>

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <StatCard label="Documents" value={status.documents.total} />
        <StatCard label="Reviewed" value={status.documents.reviewed} color={colors.success} />
        <StatCard label="Flagged" value={status.documents.flagged} color={colors.danger} />
        <StatCard label="Pending" value={status.documents.pending} color={colors.warning} />
        <StatCard label="Errors" value={status.documents.errors} color={status.documents.errors > 0 ? colors.danger : colors.textMuted} />
        <StatCard label="Sessions" value={status.sessions.completed} />
      </div>

      {/* Processing Model Split */}
      {(status.documents.confidential > 0 || status.documents.frontier > 0) && (
        <div style={styles.modelSplitRow}>
          <div style={styles.modelCard}>
            <div style={styles.modelIcon}>🔒</div>
            <div style={styles.modelCount}>{status.documents.confidential}</div>
            <div style={styles.modelLabel}>Local</div>
            <div style={styles.modelSublabel}>On-device · $0</div>
          </div>
          <div style={styles.modelCard}>
            <div style={styles.modelIcon}>☁️</div>
            <div style={styles.modelCount}>{status.documents.frontier}</div>
            <div style={styles.modelLabel}>Frontier</div>
            <div style={styles.modelSublabel}>Claude · Full pipeline</div>
          </div>
        </div>
      )}

      {/* Budget Bar */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Budget</span>
          <span style={styles.budgetText}>
            ${status.budget.spentUsd.toFixed(2)} / ${status.budget.totalUsd.toFixed(2)} USD
          </span>
        </div>
        <div style={styles.budgetTrack}>
          <div style={{
            ...styles.budgetFill,
            width: `${Math.min(100, budgetPct)}%`,
            backgroundColor: status.budget.exhausted ? colors.danger : budgetPct > 80 ? colors.warning : colors.success,
          }} />
        </div>
        <div style={styles.budgetFooter}>
          <span>${status.budget.remainingUsd.toFixed(2)} remaining</span>
          {status.budget.exhausted && <span style={{ color: colors.danger, fontWeight: 600 }}>Budget exhausted</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={styles.actionsRow}>
        <button onClick={handleScan} disabled={scanning} style={styles.scanButton}>
          {scanning ? 'Scanning...' : 'Trigger Scan'}
        </button>
        <span style={styles.lastScan}>
          Last scan: {new Date(status.lastScan).toLocaleString()}
        </span>
      </div>

      {/* Document Table */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Documents ({documents.length})</span>
        </div>
        {documents.length === 0 ? (
          <div style={styles.emptyState}>No documents tracked yet.</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Findings</th>
                  <th style={styles.th}>Cost</th>
                  <th style={styles.th}>Last Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, i) => (
                  <tr key={i} style={doc.status === 'flagged' ? styles.flaggedRow : undefined}>
                    <td style={styles.td}>
                      {doc.confidential && <span style={styles.lockIcon} title="Processed locally — privilege preserved">🔒</span>}
                      <span style={styles.docName}>{doc.name}</span>
                    </td>
                    <td style={styles.td}>{doc.type}</td>
                    <td style={styles.td}>
                      <StatusBadge status={doc.status} />
                    </td>
                    <td style={styles.td}>
                      {doc.findings ? (
                        <span>
                          {doc.findings.critical > 0 && <span style={styles.criticalBadge}>{doc.findings.critical}C</span>}
                          {doc.findings.major > 0 && <span style={styles.majorBadge}>{doc.findings.major}M</span>}
                          {doc.findings.minor > 0 && <span style={styles.minorBadge}>{doc.findings.minor}m</span>}
                        </span>
                      ) : (
                        <span style={{ color: colors.textDim }}>&mdash;</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {doc.confidential
                        ? <span style={styles.localCostBadge}>Local</span>
                        : doc.costUsd != null ? `$${doc.costUsd.toFixed(2)}` : '\u2014'}
                    </td>
                    <td style={styles.td}>
                      {doc.lastReviewed ? new Date(doc.lastReviewed).toLocaleString() : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Watch Paths */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Watch Paths</span>
        </div>
        <ul style={styles.pathList}>
          {status.watchPaths.map((p, i) => (
            <li key={i} style={styles.pathItem}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color: color ?? colors.text }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const badgeColors: Record<string, { bg: string; fg: string }> = {
    reviewed: { bg: colors.successBg, fg: colors.success },
    flagged:  { bg: 'rgba(196, 93, 62, 0.1)', fg: colors.danger },
    new:      { bg: 'rgba(46, 125, 156, 0.08)', fg: colors.sonnet },
    queued:   { bg: 'rgba(46, 125, 156, 0.08)', fg: colors.sonnet },
    stale:    { bg: colors.warningBg, fg: colors.warning },
    processing: { bg: 'rgba(46, 125, 156, 0.08)', fg: colors.sonnet },
    error:    { bg: 'rgba(196, 93, 62, 0.1)', fg: colors.danger },
  };
  const c = badgeColors[status] ?? { bg: colors.bgPanel, fg: colors.textMuted };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: radii.pill,
      fontSize: '11px',
      fontWeight: 600,
      backgroundColor: c.bg,
      color: c.fg,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {status}
    </span>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: `${spacing.xl} ${spacing.lg}`,
    fontFamily: fonts.sans,
    color: colors.text,
    minHeight: '100vh',
    backgroundColor: colors.bg,
  },
  loadingText: {
    textAlign: 'center',
    padding: spacing.xl,
    color: colors.textMuted,
    fontSize: '14px',
  },
  errorBox: {
    padding: spacing.lg,
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    border: `1px solid ${colors.danger}`,
    borderRadius: radii.md,
    color: colors.danger,
    fontSize: '14px',
    marginTop: spacing.lg,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
    paddingBottom: spacing.md,
    borderBottom: `1px solid ${colors.border}`,
  },
  backButton: {
    padding: '6px 14px',
    fontSize: '13px',
    fontFamily: fonts.sans,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    color: colors.textSecondary,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: '28px',
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '13px',
    color: colors.textMuted,
    margin: '4px 0 0',
  },
  daemonBadge: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: colors.textSecondary,
    padding: '6px 12px',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
  },
  statusDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    fontFamily: fonts.serif,
  },
  statLabel: {
    fontSize: '11px',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginTop: '2px',
  },
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: '16px',
    fontWeight: 600,
  },
  budgetText: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: fonts.mono,
  },
  budgetTrack: {
    height: 8,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: radii.pill,
    transition: 'width 0.3s ease',
  },
  budgetFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: colors.textMuted,
    marginTop: '6px',
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  scanButton: {
    padding: '8px 20px',
    fontSize: '13px',
    fontFamily: fonts.sans,
    fontWeight: 600,
    backgroundColor: colors.text,
    color: colors.bgCard,
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  lastScan: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  tableWrap: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: colors.textMuted,
    fontWeight: 600,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: 'middle' as const,
  },
  flaggedRow: {
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
  },
  docName: {
    fontWeight: 500,
    fontFamily: fonts.mono,
    fontSize: '12px',
  },
  criticalBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: radii.pill,
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: 'rgba(196, 93, 62, 0.12)',
    color: colors.danger,
    marginRight: '4px',
  },
  majorBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: radii.pill,
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: colors.warningBg,
    color: colors.warning,
    marginRight: '4px',
  },
  minorBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: radii.pill,
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: colors.bgPanel,
    color: colors.textMuted,
    marginRight: '4px',
  },
  lockIcon: {
    marginRight: '6px',
    fontSize: '12px',
  },
  localCostBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: radii.pill,
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: 'rgba(46, 125, 156, 0.08)',
    color: colors.sonnet,
  },
  modelSplitRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  modelCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
  },
  modelIcon: {
    fontSize: '20px',
    marginBottom: '2px',
  },
  modelCount: {
    fontSize: '28px',
    fontWeight: 700,
    fontFamily: fonts.serif,
  },
  modelLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.text,
  },
  modelSublabel: {
    fontSize: '11px',
    color: colors.textMuted,
  },
  emptyState: {
    padding: spacing.lg,
    textAlign: 'center' as const,
    color: colors.textMuted,
    fontSize: '14px',
  },
  pathList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  pathItem: {
    padding: '6px 0',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: '13px',
    fontFamily: fonts.mono,
    color: colors.textSecondary,
  },
};
