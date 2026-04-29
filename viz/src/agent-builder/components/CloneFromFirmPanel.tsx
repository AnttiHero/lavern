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
  const [firmSoul, setFirmSoul] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Looks like a domain if it has at least one dot and a TLD-ish suffix.
  // Scheme is optional — we auto-prepend https:// at submit time.
  const looksLikeDomain = (s: string): boolean => {
    const cleaned = s.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleaned) && cleaned.length >= 4;
  };
  const canRun = phase === 'input' && looksLikeDomain(url);
  const normalisedUrl = (raw: string): string => {
    const trimmed = raw.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const pushLog = useCallback((m: string) => setLogs(prev => [...prev, m]), []);

  const startImport = useCallback(async () => {
    const targetUrl = normalisedUrl(url);
    setPhase('running');
    setLogs([`▸ Target: ${targetUrl}`]);
    setAgents([]);
    setFirmName('');
    setFirmTagline('');
    setFirmSoul('');
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
          url: targetUrl,
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
        const e = evt as { type?: string; message?: string; step?: string; profile?: GeneratedAgent; firmName?: string; firmTagline?: string; cost?: number; text?: string; soul?: string };
        switch (e.type) {
          case 'log':
            if (typeof e.message === 'string') pushLog(`· ${e.message}`);
            return false;
          case 'progress':
            if (typeof e.step === 'string') pushLog(`⟢ ${e.step.toUpperCase()}`);
            return false;
          case 'firm':
            if (e.firmName) setFirmName(String(e.firmName));
            if (e.firmTagline) setFirmTagline(String(e.firmTagline));
            return false;
          case 'soul':
            if (typeof e.soul === 'string') setFirmSoul(e.soul);
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
      {/* Inline keyframes for the cinematic reveal animations */}
      <style>{`
        @keyframes phrase-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes phrase-pulse {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 0.6; }
        }
        @keyframes card-rise {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
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
              placeholder="wachtell.com"
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
          {/* Parchment overlay — quiet waiting state. The soul is the
              mid-wait visual; until then, just an elegant pulse. */}
          {(phase === 'running' || (phase === 'done' && !firmName)) && (
            <div style={styles.parchment}>
              {firmName ? (
                <div style={styles.firmChapter}>
                  <div style={styles.firmName}>{firmName}</div>
                  {firmTagline && <div style={styles.firmTagline}>{firmTagline}</div>}
                </div>
              ) : (
                <>
                  <div style={styles.parchmentLabel}>Studying the firm</div>
                  <div style={styles.parchmentPulse}>·  ·  ·</div>
                </>
              )}
            </div>
          )}

          {/* Once the firm name is known, show it as a chapter title above the team */}
          {phase === 'done' && firmName && (
            <div style={styles.firmChapterStandalone}>
              <div style={styles.firmName}>{firmName}</div>
              {firmTagline && <div style={styles.firmTagline}>{firmTagline}</div>}
            </div>
          )}

          {/* Firm soul — appears once Sonnet returns */}
          {firmSoul && (
            <div style={styles.soulCard}>
              <div style={styles.soulLabel}>This is how they sound</div>
              <div style={styles.soulText}>{firmSoul}</div>
            </div>
          )}

          {/* Compact log line — for transparency, not the headline anymore */}
          {logs.length > 0 && phase === 'running' && (
            <div style={styles.logTrace}>
              {logs.slice(-3).map((line, i) => (
                <div key={i} style={styles.logTraceLine}>{line}</div>
              ))}
            </div>
          )}

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
      {/* Receipt: the literal phrase from the site that justified this agent.
          This is the headline. The rest is supporting cast. */}
      {agent.seenOnSite && (
        <div style={miniStyles.receipt}>
          <span style={miniStyles.receiptMark}>“</span>
          {agent.seenOnSite}
          <span style={miniStyles.receiptMark}>”</span>
        </div>
      )}
      <div style={miniStyles.row}>
        <img src={avatar} alt="" width={64} height={64} style={miniStyles.avatar} />
        <div style={miniStyles.body}>
          <div style={miniStyles.name}>{agent.displayName}</div>
          <div style={miniStyles.archetype}>{agent.personality.archetype}</div>
          <div style={miniStyles.tagline}>{agent.tagline}</div>
          <div style={miniStyles.meta}>
            <span>{agent.seniority}</span>
            <span>·</span>
            <span>${agent.billingRateUsd.toLocaleString()}/hr</span>
          </div>
        </div>
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
    maxWidth: 1200,
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
  // Parchment — the cinematic "reading the firm" panel that replaces the
  // previous developer-console log pane. Editorial, dignified, slow.
  parchment: {
    background: 'linear-gradient(180deg, #FBF7EE 0%, #F5EFDF 100%)',
    color: '#2B2418',
    border: `1px solid #DCD2BB`,
    borderRadius: radii.md,
    padding: '48px 40px',
    minHeight: 180,
    boxShadow: 'inset 0 0 80px rgba(120, 90, 40, 0.06), 0 1px 2px rgba(0,0,0,0.04)',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  parchmentLabel: {
    fontFamily: fonts.sans, fontSize: 10, fontWeight: 500,
    color: 'rgba(43,36,24,0.45)',
    textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: 14,
  },
  parchmentPulse: {
    fontFamily: fonts.serif,
    color: 'rgba(43,36,24,0.35)',
    fontSize: 18, letterSpacing: 6,
    marginTop: 12,
    animation: 'phrase-pulse 1.6s ease-in-out infinite',
  },
  firmChapter: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: '1px solid rgba(43,36,24,0.12)',
  },
  firmName: {
    fontFamily: fonts.serif, fontSize: 28, fontWeight: 500,
    color: '#1A140A', letterSpacing: 0.2,
  },
  firmTagline: {
    fontFamily: fonts.serif, fontSize: 14,
    color: 'rgba(43,36,24,0.62)',
    marginTop: 4, fontStyle: 'italic',
  },
  firmChapterStandalone: {
    paddingBottom: 12,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 4,
  },
  // Soul card — appears once Sonnet returns. The firm's house voice.
  soulCard: {
    background: '#1A140A',
    color: '#F5EFDF',
    borderRadius: radii.md,
    padding: '28px 32px',
    border: '1px solid #2B2418',
  },
  soulLabel: {
    fontFamily: fonts.sans, fontSize: 10, fontWeight: 500,
    color: '#E8845C',
    textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: 12,
  },
  soulText: {
    fontFamily: fonts.serif, fontSize: 17,
    color: '#F5EFDF',
    lineHeight: 1.6, fontStyle: 'italic',
  },
  // Compact running log — small, technical, secondary
  logTrace: {
    fontFamily: `'SF Mono','Fira Code',Menlo,monospace`,
    fontSize: 11,
    color: colors.textDim,
    padding: '8px 12px',
    background: 'transparent',
    borderTop: `1px dashed ${colors.border}`,
    borderBottom: `1px dashed ${colors.border}`,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  logTraceLine: {
    opacity: 0.7,
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
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: 14,
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
    display: 'flex', flexDirection: 'column', gap: 14,
    padding: 22,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    animation: 'card-rise 500ms ease-out both',
  },
  // Receipt: the literal phrase from the site that justifies this agent.
  // This is the headline — the credibility hook.
  receipt: {
    fontFamily: fonts.serif, fontSize: 14,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: 1.55,
    paddingBottom: 14,
    borderBottom: `1px solid ${colors.border}`,
    // No clamp — let the receipt breathe to its full length. These quotes
    // are the credibility hook; truncating them mid-sentence undermines the
    // whole point.
  },
  receiptMark: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.accent,
    fontStyle: 'normal',
    margin: '0 2px',
    fontWeight: 600,
    lineHeight: 0,
  },
  row: {
    display: 'flex', gap: 14, alignItems: 'flex-start',
  },
  avatar: {
    borderRadius: '50%',
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  body: {
    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1,
  },
  name: {
    fontFamily: fonts.serif, fontSize: 17, fontWeight: 500, color: colors.text,
    letterSpacing: 0.1,
  },
  archetype: {
    fontFamily: fonts.sans, fontSize: 10, color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.8,
    fontWeight: 600,
    marginTop: 1,
  },
  tagline: {
    fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary,
    lineHeight: 1.5,
    marginTop: 5,
    // Allow up to 3 lines instead of clamping at 2
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  meta: {
    display: 'flex', gap: 6,
    fontFamily: fonts.sans, fontSize: 11, color: colors.textDim,
    marginTop: 6,
  },
};
