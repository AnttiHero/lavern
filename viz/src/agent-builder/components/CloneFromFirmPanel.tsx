/**
 * CloneFromFirmPanel — paste a firm URL, get 5 agents back.
 *
 * Flow:
 *   1. User pastes https URL (+ optional hint, + count 3–8)
 *   2. POST /api/agent-builder/import-firm (SSE stream)
 *   3. Live log cinematically shows: Fetching → Analyzing → Generating
 *   4. Each agent arrives via `type: 'agent'` events; we collect them
 *   5. On `done`, user sees a card grid + "Save all" / "Try another"
 *
 * Saves are performed by the parent via onComplete(profiles).
 */

import { useState, useCallback, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { AgentProfile } from '../../types/agent-profile.js';

// ── Types that mirror backend GeneratedAgent ──────────────────────────

interface GeneratedAgent {
  displayName: string;
  tagline: string;
  category: 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';
  seniority: 'partner' | 'senior-associate' | 'associate' | 'junior' | 'specialist' | 'counsel';
  costTier: 'opus' | 'sonnet' | 'haiku';
  billingRateUsd: number;
  skills: {
    precision: number; creativity: number; speed: number; depth: number;
    negotiation: number; communication: number; research: number; risk: number;
  };
  personality: {
    archetype: string;
    traits: Record<string, number>;
    workStyle: string;
  };
  practiceAreas: string[];
  strengths: string[];
  limitations: string[];
  seenOnSite: string;
}

type Phase = 'input' | 'running' | 'done' | 'error';

interface Props {
  onCancel: () => void;
  onComplete: (profiles: AgentProfile[], firmName: string) => void;
}

export function CloneFromFirmPanel({ onCancel, onComplete }: Props) {
  const [url, setUrl] = useState('');
  const [hint, setHint] = useState('');
  const [count, setCount] = useState(5);
  const [phase, setPhase] = useState<Phase>('input');
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<GeneratedAgent[]>([]);
  const [firmName, setFirmName] = useState('');
  const [firmTagline, setFirmTagline] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canRun = phase === 'input' && url.trim().length > 4 && /^https?:\/\//i.test(url.trim());

  const pushLog = useCallback((m: string) => setLogs(prev => [...prev, m]), []);

  const startImport = useCallback(async () => {
    setPhase('running');
    setLogs([`▸ Target: ${url.trim()}`]);
    setAgents([]);
    setFirmName('');
    setFirmTagline('');
    setErrorMsg(null);
    setCost(null);

    const controller = new AbortController();
    abortRef.current = controller;

    // Overall ceiling — if nothing finishes within 5 minutes, abort with a
    // clean error rather than spinning forever. The server's internal calls
    // are bounded (12 s scrape × 3 + 240 s LLM), so 5 min is generous.
    const overallTimeout = setTimeout(() => {
      if (abortRef.current) {
        controller.abort(new DOMException('Overall timeout (5 min) reached', 'TimeoutError'));
      }
    }, 5 * 60 * 1000);

    let receivedDone = false;
    let sawError = false;

    try {
      const res = await fetch('/api/agent-builder/import-firm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          count,
          hint: hint.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let pendingError: string | null = null;

      // Helper: handle one parsed event. Returns true if we should stop the loop.
      const handleEvent = (evt: unknown): boolean => {
        const e = evt as { type?: string; message?: string; step?: string; profile?: GeneratedAgent; firmName?: string; firmTagline?: string; cost?: number };
        switch (e.type) {
          case 'log':
            if (typeof e.message === 'string') pushLog(`· ${e.message}`);
            return false;
          case 'progress':
            if (typeof e.step === 'string') pushLog(`⟢ ${e.step.toUpperCase()}`);
            return false;
          case 'agent':
            if (e.profile) {
              setAgents(prev => [...prev, e.profile as GeneratedAgent]);
              pushLog(`✓ ${e.profile.displayName} — ${e.profile.personality?.archetype ?? ''}`);
            }
            return false;
          case 'done':
            if (e.firmName) setFirmName(String(e.firmName));
            if (e.firmTagline) setFirmTagline(String(e.firmTagline));
            if (typeof e.cost === 'number') setCost(e.cost);
            receivedDone = true;
            setPhase('done');
            return true;
          case 'error':
            sawError = true;
            pendingError = e.message || 'Firm import failed (no detail).';
            return true;
          case 'heartbeat':
            // Server keepalive — no UI change, just consume.
            return false;
          default:
            return false;
        }
      };

      streamLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE lines end in \n; split, keep the trailing partial line in buffer.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          // Comments (": …") are valid SSE keepalive lines — ignore.
          if (line.startsWith(':') || line === '') continue;
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          let evt: unknown;
          try {
            evt = JSON.parse(payload);
          } catch {
            // Malformed JSON in a line — skip silently. Most likely a chunk
            // boundary issue that will resolve on the next read; if not,
            // we'll either see a real event later or hit stream end.
            continue;
          }
          if (handleEvent(evt)) break streamLoop;
        }
      }

      // Stream ended — figure out why.
      if (sawError && pendingError) {
        throw new Error(pendingError);
      }
      if (!receivedDone) {
        throw new Error(
          'The server closed the stream without finishing. The site may be slow, blocked, or the model timed out. Try a different URL.',
        );
      }
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        // User cancelled — silent. Phase already reset by cancelInFlight.
        return;
      }
      if (e.name === 'TimeoutError') {
        setErrorMsg('Took longer than 5 minutes — aborted. The site may be slow or the model is hung.');
      } else {
        setErrorMsg(e.message || 'Firm import failed.');
      }
      setPhase('error');
    } finally {
      clearTimeout(overallTimeout);
      abortRef.current = null;
    }
  }, [url, hint, count, pushLog]);

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    setPhase('input');
  }, []);

  const saveAll = useCallback(() => {
    const profiles: AgentProfile[] = agents.map(g => toAgentProfile(g));
    onComplete(profiles, firmName);
  }, [agents, firmName, onComplete]);

  const reset = useCallback(() => {
    setPhase('input');
    setLogs([]);
    setAgents([]);
    setErrorMsg(null);
    setFirmName('');
    setFirmTagline('');
    setCost(null);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Clone a firm</div>
        <div style={styles.sub}>
          Paste a firm's public homepage URL. We'll read it, analyze the archetypes
          it runs on, and mint {count} agents based on what we find.
        </div>
      </div>

      {phase === 'input' && (
        <div style={styles.form}>
          <label style={styles.label}>
            Firm URL
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.wachtell.com"
              autoFocus
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Optional hint
            <input
              type="text"
              value={hint}
              onChange={e => setHint(e.target.value.slice(0, 200))}
              placeholder="e.g. focus on M&A partners, or tech-transactions style"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            How many agents?
            <div style={styles.countRow}>
              {[3, 4, 5, 6, 7, 8].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  style={{
                    ...styles.countBtn,
                    ...(count === n ? styles.countBtnActive : {}),
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>

          <div style={styles.disclaimer}>
            Only works on publicly accessible sites. We don't store the content.
            Pages behind login, pure JavaScript apps, or bot-blocked sites may fail.
          </div>

          <div style={styles.actions}>
            <button onClick={onCancel} style={styles.secondaryBtn}>Back</button>
            <button
              onClick={startImport}
              disabled={!canRun}
              style={{ ...styles.primaryBtn, opacity: canRun ? 1 : 0.5 }}
            >
              Conjure the firm →
            </button>
          </div>
        </div>
      )}

      {(phase === 'running' || phase === 'done' || phase === 'error') && (
        <div style={styles.stage}>
          <div style={styles.logPane}>
            {firmName && (
              <div style={styles.firmBanner}>
                <div style={styles.firmName}>{firmName}</div>
                {firmTagline && <div style={styles.firmTagline}>{firmTagline}</div>}
              </div>
            )}
            <div style={styles.logList}>
              {logs.map((line, i) => (
                <div key={i} style={styles.logLine}>{line}</div>
              ))}
              {phase === 'running' && <div style={styles.logLinePulse}>▸ working…</div>}
            </div>
          </div>

          {agents.length > 0 && (
            <div style={styles.roster}>
              <div style={styles.rosterLabel}>
                {agents.length} agent{agents.length === 1 ? '' : 's'} ready
                {cost !== null && <span style={styles.costChip}>${cost.toFixed(3)}</span>}
              </div>
              <div style={styles.agentGrid}>
                {agents.map((a, i) => (
                  <AgentMiniCard key={i} agent={a} />
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div style={styles.error}>
              {errorMsg}
            </div>
          )}

          <div style={styles.actions}>
            {phase === 'running' && (
              <button onClick={cancelInFlight} style={styles.secondaryBtn}>
                Cancel
              </button>
            )}
            {phase === 'error' && (
              <>
                <button onClick={reset} style={styles.secondaryBtn}>Try another URL</button>
                <button onClick={onCancel} style={styles.secondaryBtn}>Back</button>
              </>
            )}
            {phase === 'done' && (
              <>
                <button onClick={reset} style={styles.secondaryBtn}>Try another firm</button>
                <button
                  onClick={saveAll}
                  disabled={agents.length === 0}
                  style={{ ...styles.primaryBtn, opacity: agents.length === 0 ? 0.5 : 1 }}
                >
                  Save all {agents.length} to roster →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mini card ─────────────────────────────────────────────────────────

function AgentMiniCard({ agent }: { agent: GeneratedAgent }) {
  const avatar = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(agent.displayName)}&backgroundColor=transparent`;
  return (
    <div style={miniStyles.card}>
      <img src={avatar} alt="" width={48} height={48} style={miniStyles.avatar} />
      <div style={miniStyles.body}>
        <div style={miniStyles.name}>{agent.displayName}</div>
        <div style={miniStyles.archetype}>{agent.personality.archetype}</div>
        <div style={miniStyles.tagline}>{agent.tagline}</div>
        <div style={miniStyles.meta}>
          <span>{agent.seniority}</span>
          <span>·</span>
          <span>${agent.billingRateUsd.toLocaleString()}/hr</span>
        </div>
        {agent.seenOnSite && (
          <div style={miniStyles.cite}>“{agent.seenOnSite}”</div>
        )}
      </div>
    </div>
  );
}

// ── Conversion ─────────────────────────────────────────────────────────

function toAgentProfile(g: GeneratedAgent): AgentProfile {
  return {
    // role is overwritten by addAgent — placeholder here
    role: '',
    displayName: g.displayName,
    tagline: g.tagline,
    category: g.category,
    seniority: g.seniority,
    costTier: g.costTier,
    billingRateUsd: g.billingRateUsd,
    skills: g.skills,
    personality: {
      archetype: g.personality.archetype,
      // Full 5 axes — backend enforces all 5, but cast through Record for type safety
      traits: g.personality.traits as unknown as AgentProfile['personality']['traits'],
      workStyle: g.personality.workStyle,
    },
    practiceAreas: g.practiceAreas,
    strengths: g.strengths,
    limitations: g.limitations,
    optional: true,
    defaultSelected: false,
    avatarSeed: g.displayName,
  };
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 880,
    margin: '0 auto',
    padding: `${spacing.xl} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  header: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  title: {
    fontFamily: fonts.serif, fontSize: 32, fontWeight: 500, color: colors.text,
  },
  sub: {
    fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, lineHeight: 1.5,
  },
  form: {
    display: 'flex', flexDirection: 'column', gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  label: {
    display: 'flex', flexDirection: 'column', gap: 6,
    fontFamily: fonts.sans, fontSize: 11, fontWeight: 500,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    boxSizing: 'border-box',
    textTransform: 'none',
    letterSpacing: 0,
  },
  countRow: {
    display: 'flex', gap: 6, marginTop: 4,
  },
  countBtn: {
    minWidth: 40, padding: '8px 0',
    fontFamily: fonts.sans, fontSize: 13,
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    textTransform: 'none',
    letterSpacing: 0,
  },
  countBtnActive: {
    backgroundColor: colors.text,
    color: colors.bgCard,
    borderColor: colors.text,
    fontWeight: 600,
  },
  disclaimer: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.textDim,
    lineHeight: 1.5, fontStyle: 'italic',
  },
  actions: {
    display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4,
  },
  primaryBtn: {
    padding: '11px 22px',
    fontFamily: fonts.sans, fontSize: 12, fontWeight: 600,
    letterSpacing: 1.2, textTransform: 'uppercase',
    backgroundColor: colors.text,
    color: colors.bgCard,
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '11px 22px',
    fontFamily: fonts.sans, fontSize: 12, fontWeight: 500,
    letterSpacing: 1, textTransform: 'uppercase',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  stage: {
    display: 'flex', flexDirection: 'column', gap: spacing.lg,
  },
  logPane: {
    backgroundColor: '#0e0e0e',
    color: '#E8E6DF',
    borderRadius: radii.md,
    padding: spacing.lg,
    fontFamily: `'SF Mono','Fira Code',Menlo,monospace`,
    fontSize: 12,
    lineHeight: 1.6,
    minHeight: 160,
    maxHeight: 300,
    overflowY: 'auto',
  },
  firmBanner: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  firmName: {
    fontFamily: fonts.serif, fontSize: 18, color: '#FAF9F6', letterSpacing: 0.3,
  },
  firmTagline: {
    fontSize: 11, color: 'rgba(250,249,246,0.55)', marginTop: 2, fontStyle: 'italic',
  },
  logList: {
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  logLine: {
    color: 'rgba(232,230,223,0.75)',
  },
  logLinePulse: {
    color: '#E8845C',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  roster: {
    display: 'flex', flexDirection: 'column', gap: spacing.md,
  },
  rosterLabel: {
    display: 'flex', alignItems: 'baseline', gap: 10,
    fontFamily: fonts.sans, fontSize: 11, fontWeight: 500,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  costChip: {
    fontFamily: fonts.sans, fontSize: 10, color: colors.textDim,
    padding: '2px 8px',
    border: `1px solid ${colors.border}`,
    borderRadius: 99,
    textTransform: 'none',
    letterSpacing: 0,
  },
  agentGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
  },
  error: {
    padding: spacing.md,
    backgroundColor: 'rgba(196,93,62,0.08)',
    border: `1px solid rgba(196,93,62,0.3)`,
    borderRadius: radii.sm,
    fontFamily: fonts.sans, fontSize: 13,
    color: '#C45D3E',
  },
};

const miniStyles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex', gap: 10,
    padding: 10,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  avatar: {
    borderRadius: '50%',
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  body: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
  },
  name: {
    fontFamily: fonts.serif, fontSize: 14, fontWeight: 500, color: colors.text,
  },
  archetype: {
    fontFamily: fonts.sans, fontSize: 10, color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tagline: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  meta: {
    display: 'flex', gap: 5,
    fontFamily: fonts.sans, fontSize: 10, color: colors.textDim,
  },
  cite: {
    fontFamily: fonts.sans, fontSize: 10, fontStyle: 'italic',
    color: colors.textDim, marginTop: 4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
};
