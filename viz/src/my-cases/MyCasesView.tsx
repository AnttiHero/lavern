/**
 * MyCasesView — Active and past sessions.
 *
 * Moved here from the dashboard to keep the main page focused.
 * Shows active sessions (connect) and past sessions (replay).
 */

import { useState, useEffect, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface ActiveSession {
  id: string;
  currentStep: string;
  completedSteps: number;
  eventCount: number;
  cost: number;
  budget: number;
}

interface ArchivedSession {
  id: string;
  title: string;
  status: string;
  workflowId: string | null;
  teamRoles: string[];
  findingsCount: number;
  resolutionsCount: number;
  costUsd: number;
  budgetUsd: number;
  createdAt: string;
  completedAt: string | null;
  durationMs: number;
}

interface Props {
  onConnectSession: (id: string) => void;
  onConnectReplay: (id: string) => void;
  onBack: () => void;
}

export default function MyCasesView({ onConnectSession, onConnectReplay, onBack }: Props) {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [sessionsRes, archiveRes] = await Promise.allSettled([
        fetch('/api/sessions', { credentials: 'include' }).then(r => {
          if (!r.ok) throw new Error(`Sessions: HTTP ${r.status}`);
          return r.json();
        }),
        fetch('/api/sessions/archive', { credentials: 'include' }).then(r => {
          if (!r.ok) return { sessions: [] };
          return r.json();
        }),
      ]);

      if (sessionsRes.status === 'fulfilled' && sessionsRes.value) {
        setActiveSessions(sessionsRes.value.sessions ?? []);
      } else if (sessionsRes.status === 'rejected') {
        console.warn('[MyCases] Failed to fetch active sessions:', sessionsRes.reason);
      }
      if (archiveRes.status === 'fulfilled' && archiveRes.value) {
        setArchivedSessions(archiveRes.value.sessions ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button
          onClick={onBack}
          style={styles.backBtn}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >
          {'\u2190'} Back
        </button>
        <h1 style={styles.title}>
          Marble <span style={styles.titleItalic}>Cases</span>
        </h1>
        <button
          style={styles.refreshBtn}
          onClick={fetchData}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >
          Refresh
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* ── Active Sessions ─────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionLine} />
          <span style={styles.sectionTitle}>Active Sessions</span>
          <span style={styles.sectionBadge}>{activeSessions.length}</span>
          <div style={styles.sectionLine} />
        </div>

        {loading && activeSessions.length === 0 && (
          <div style={styles.empty}>Loading...</div>
        )}
        {!loading && activeSessions.length === 0 && (
          <div style={styles.empty}>No active sessions</div>
        )}

        <div style={styles.activeGrid}>
          {activeSessions.map((s) => (
            <div key={s.id} style={styles.activeCard}>
              <div style={styles.activeCardTop}>
                <div style={styles.activeCardInfo}>
                  <span style={styles.sessionId}>{s.id}</span>
                  <span style={styles.stepBadge}>{s.currentStep.replace(/_/g, ' ')}</span>
                </div>
                <button
                  style={styles.connectButton}
                  onClick={() => onConnectSession(s.id)}
                  onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
                  onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
                >
                  Connect
                </button>
              </div>
              <div style={styles.cardMeta}>
                <span>{s.completedSteps} steps</span>
                <span>{s.eventCount} events</span>
                <span>${s.cost.toFixed(2)} / ${s.budget.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Past Sessions (from SQLite archive) ────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionLine} />
          <span style={styles.sectionTitle}>Past Sessions</span>
          <span style={styles.sectionBadge}>{archivedSessions.length}</span>
          <div style={styles.sectionLine} />
        </div>

        {archivedSessions.length === 0 && !loading && (
          <div style={styles.empty}>No past sessions found</div>
        )}

        <div style={styles.pastGrid}>
          {archivedSessions.slice(0, 20).map((s) => (
            <div key={s.id} style={styles.pastCard}>
              <span style={styles.pastSessionId}>{s.title}</span>
              <span style={{
                ...styles.statusBadge,
                backgroundColor: s.status === 'completed' ? colors.successBg : colors.warningBg,
                color: s.status === 'completed' ? colors.success : colors.warning,
              }}>
                {s.status}
              </span>
              <div style={styles.pastMeta}>
                <span>{s.findingsCount} findings</span>
                <span>${s.costUsd.toFixed(2)}</span>
                {s.completedAt && (
                  <span>{new Date(s.completedAt).toLocaleDateString()}</span>
                )}
              </div>
              {s.teamRoles.length > 0 && (
                <div style={styles.pastMeta}>
                  <span>{s.teamRoles.length} agents</span>
                  {s.durationMs > 0 && (
                    <span>{Math.round(s.durationMs / 1000)}s</span>
                  )}
                </div>
              )}
              <button
                style={styles.replayButton}
                onClick={() => onConnectReplay(s.id)}
                onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
              >
                View {'\u2192'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100vh',
    overflow: 'auto',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    maxWidth: 900,
    margin: '0 auto',
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  backBtn: {
    background: 'none',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    padding: '5px 14px',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
    whiteSpace: 'nowrap' as const,
  },
  title: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.5,
  },
  titleItalic: {
    fontStyle: 'italic' as const,
    fontWeight: 300,
  },
  refreshBtn: {
    background: 'none',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    padding: '5px 14px',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
    whiteSpace: 'nowrap' as const,
  },

  // ── Sections ────────────────────────────────────────────────────────
  section: {
    marginBottom: 44,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '2px 8px',
    borderRadius: radii.sm,
  },

  // ── Active session cards ──────────────────────────────────────────
  activeGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  activeCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '14px 18px',
    transition: 'border-color 0.15s ease',
  },
  activeCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeCardInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  sessionId: {
    fontSize: 13,
    fontFamily: fonts.mono,
    color: colors.text,
    fontWeight: 500,
  },
  stepBadge: {
    fontSize: 10,
    backgroundColor: colors.bgPanel,
    color: colors.textMuted,
    padding: '2px 10px',
    borderRadius: radii.sm,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  cardMeta: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: colors.textMuted,
  },
  connectButton: {
    backgroundColor: colors.text,
    color: '#fff',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    padding: '6px 18px',
    cursor: 'pointer',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  // ── Past session cards ────────────────────────────────────────────
  pastGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 10,
  },
  pastCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  pastSessionId: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.text,
    fontWeight: 500,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.sm,
    alignSelf: 'flex-start' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  pastMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    fontSize: 11,
    color: colors.textDim,
  },
  replayButton: {
    marginTop: 4,
    backgroundColor: 'transparent',
    color: colors.text,
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  // ── Common ──────────────────────────────────────────────────────
  empty: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center' as const,
    padding: '20px',
  },
  error: {
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    color: colors.danger,
    border: '1px solid rgba(196, 93, 62, 0.2)',
    borderRadius: radii.md,
    padding: '10px 16px',
    marginBottom: 24,
    fontSize: 13,
    fontFamily: fonts.sans,
  },
};
