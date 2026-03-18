/**
 * MyCasesView — Active and past sessions.
 *
 * Moved here from the dashboard to keep the main page focused.
 * Shows active sessions (connect) and past sessions (replay).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

const WORKFLOW_LABELS: Record<string, string> = {
  counsel: 'Counsel',
  review: 'Review',
  roundtable: 'Full Bench',
  'legal-design': 'Full Bench',
  adversarial: 'Research',
  'full-bench': 'Full Bench',
};

function formatDuration(ms: number): string {
  if (ms <= 0) return '';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '\u2026' : id;
}

export default function MyCasesView({ onConnectSession, onConnectReplay, onBack }: Props) {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialFetchDone = useRef(false);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      // Only show loading spinner on the initial fetch to avoid UI flash on polls
      if (isInitial || !initialFetchDone.current) {
        setLoading(true);
      }
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
        setError('Unable to load active sessions. Please try again.');
      }
      if (archiveRes.status === 'fulfilled' && archiveRes.value) {
        setArchivedSessions(archiveRes.value.sessions ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
      initialFetchDone.current = true;
    }
  }, []);

  useEffect(() => {
    fetchData(true);

    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!interval) {
        interval = setInterval(() => {
          // Skip poll when tab is not visible
          if (document.visibilityState === 'hidden') return;
          fetchData(false);
        }, 5000);
      }
    };

    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Fetch immediately when tab becomes visible again, then resume polling
        fetchData(false);
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
          Lavern <span style={styles.titleItalic}>Cases</span>
        </h1>
        <button
          style={styles.refreshBtn}
          onClick={() => fetchData(false)}
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
            <div
              key={s.id}
              style={styles.activeCard}
              onMouseEnter={e => { const c = e.currentTarget; c.style.borderColor = colors.borderHover; c.style.transform = 'translateY(-2px)'; c.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
              onMouseLeave={e => { const c = e.currentTarget; c.style.borderColor = colors.border; c.style.transform = 'translateY(0)'; c.style.boxShadow = 'none'; }}
            >
              <div style={styles.activeCardTop}>
                <div style={styles.activeCardInfo}>
                  <span style={styles.stepBadge}>{s.currentStep.replace(/_/g, ' ')}</span>
                  <span style={styles.sessionIdMuted}>{shortId(s.id)}</span>
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
                <span>{s.completedSteps} steps complete</span>
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
          {archivedSessions.slice(0, 20).map((s) => {
            const tierLabel = s.workflowId ? (WORKFLOW_LABELS[s.workflowId] ?? s.workflowId) : '';
            const dateStr = s.completedAt
              ? new Date(s.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : '';
            return (
              <div
                key={s.id}
                style={styles.pastCard}
                onMouseEnter={e => { const c = e.currentTarget; c.style.borderColor = colors.borderHover; c.style.transform = 'translateY(-2px)'; c.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { const c = e.currentTarget; c.style.borderColor = colors.border; c.style.transform = 'translateY(0)'; c.style.boxShadow = 'none'; }}
              >
                <div style={styles.pastCardHeader}>
                  <span style={styles.pastTitle}>{s.title}</span>
                  {tierLabel && <span style={styles.tierBadge}>{tierLabel}</span>}
                </div>
                <div style={styles.pastMetaRow}>
                  {s.findingsCount > 0 && <span>{s.findingsCount} findings</span>}
                  <span>${s.costUsd.toFixed(2)}</span>
                  {s.durationMs > 0 && <span>{formatDuration(s.durationMs)}</span>}
                  {dateStr && <span>{dateStr}</span>}
                </div>
                <button
                  style={styles.replayButton}
                  onClick={() => onConnectReplay(s.id)}
                  onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
                  onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
                >
                  View Results {'\u2192'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
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
    transition: 'border-color 0.25s ease, box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
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
  sessionIdMuted: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textDim,
    fontWeight: 400,
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
    gap: 8,
    transition: 'border-color 0.25s ease, box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  pastCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  pastTitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    fontWeight: 600,
    lineHeight: 1.3,
    flex: 1,
    overflow: 'hidden' as const,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },
  tierBadge: {
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.sm,
    backgroundColor: colors.bgPanel,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  pastMetaRow: {
    display: 'flex',
    gap: 10,
    fontSize: 11,
    color: colors.textDim,
    flexWrap: 'wrap' as const,
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
