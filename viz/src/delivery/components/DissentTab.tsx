/**
 * DissentTab — "The Dissent".
 *
 * Where independent models were asked the SAME interpretive question about a
 * load-bearing clause and DISAGREED. A split is a first-class finding: the tab
 * shows each model's position, its confidence, and the exact clause text it
 * relied on — so a reader sees two models staring at the same words and
 * reaching opposite conclusions. No single-model tool can produce this.
 */

import { useState } from 'react';
import type { DeliveryData, DissentView, DissentVerdictView, DissentResolutionView } from '../hooks/useDeliveryData.js';

export type DissentRuling = { label: string; ruledAt: string };

interface Props {
  data: DeliveryData;
  /** Lifted to DeliveryView so a ruling survives tab switches (this tab
   *  unmounts on navigation; see conversation state for the same pattern). */
  rulings: Record<number, DissentRuling>;
  onRuled: (index: number, ruling: DissentRuling) => void;
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#C2603C',
  mistral: '#3C6FC2',
  local: '#3C9C6E',
};

function Verdict({ v }: { v: DissentVerdictView }) {
  const color = PROVIDER_COLOR[v.provider] ?? '#888';
  if (v.error) {
    return (
      <div style={{ ...styles.verdict, opacity: 0.55 }}>
        <div style={styles.vHead}><span style={styles.vModel}>{v.member}</span><span style={styles.vUnavailable}>unavailable</span></div>
      </div>
    );
  }
  return (
    <div style={styles.verdict}>
      <div style={styles.vHead}>
        <span style={styles.vModel}>{v.member}</span>
        <span style={{ ...styles.vLabel, background: color }}>{v.label}</span>
        <span style={styles.vConf}>{v.confidence} confidence</span>
      </div>
      {v.quote && <blockquote style={styles.vQuote}>“{v.quote}”</blockquote>}
      {v.rationale && <p style={styles.vRationale}>{v.rationale}</p>}
    </div>
  );
}

function Resolution({ r }: { r: DissentResolutionView }) {
  const revote = r.revote.filter(v => !v.error);
  return (
    <div style={styles.resolution}>
      <div style={{
        ...styles.resolutionBanner,
        background: r.resolved ? '#EEF4EE' : '#FBE9E0',
        color: r.resolved ? '#3C6B47' : '#8A3A17',
      }}>
        {r.resolved ? '✓ Resolved with evidence' : '⚠️ Escalated to human review'} — {r.note}
      </div>
      {r.evidence.length > 0 && (
        <div style={styles.evidence}>
          <div style={styles.evidenceTitle}>Retrieved authority</div>
          {r.evidence.map((e, i) => (
            <div key={i} style={styles.evidenceItem}>
              <span style={styles.evidenceSource}>{e.source}</span> — {e.snippet}
            </div>
          ))}
        </div>
      )}
      {revote.length > 0 && (
        <div style={styles.revote}>
          <span style={styles.revoteTitle}>Re-vote with evidence:</span>
          {revote.map((v, i) => (
            <span key={i} style={styles.revoteChip}>{v.member} → {v.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One-click ruling on an escalated split. The click is a gold label: it is
 * recorded as hive precedent and grades every panelist against a truth that
 * came from outside the panel.
 */
function RulingBlock({ d, sessionId, index, onRuled }: {
  d: DissentView; sessionId: string; index: number; onRuled: (r: DissentRuling) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rule = async (label: string) => {
    setPending(label);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/dissents/${index}/ruling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Someone (or a lost local state) already ruled — adopt that ruling
        // instead of stranding the user on an error.
        const m = /Already ruled: "(.+)"/.exec(body.error ?? '');
        onRuled({ label: m?.[1] ?? label, ruledAt: new Date().toISOString() });
        return;
      }
      if (!res.ok) throw new Error(body.error || `Ruling failed (${res.status})`);
      onRuled(body.humanRuling ?? { label, ruledAt: new Date().toISOString() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div style={styles.ruling}>
      <div style={styles.rulingPrompt}>
        Rule on this split — your decision is recorded as hive precedent and future panels will cite it:
      </div>
      <div style={styles.rulingButtons}>
        {d.options.map(o => (
          <button
            key={o}
            onClick={() => rule(o)}
            disabled={pending !== null}
            style={{ ...styles.rulingBtn, opacity: pending && pending !== o ? 0.5 : 1 }}
          >
            {pending === o ? 'Recording…' : o}
          </button>
        ))}
      </div>
      {error && <div role="alert" style={styles.rulingError}>{error}</div>}
    </div>
  );
}

function DissentCard({ d, sessionId, index, canRule, ruledLocally, onRuled }: {
  d: DissentView; sessionId: string; index: number; canRule: boolean;
  ruledLocally?: DissentRuling; onRuled: (r: DissentRuling) => void;
}) {
  const labels = Object.keys(d.positions);
  const ruling = d.humanRuling ?? ruledLocally;
  // A human is asked to rule when the split reached them: it escalated, or it
  // predates the resolution loop entirely (old sessions).
  const needsRuling = canRule && d.dissent && !ruling && Array.isArray(d.options) && d.options.length > 0
    && (d.resolution ? d.resolution.escalated : true);

  return (
    <div style={{ ...styles.card, borderColor: d.dissent ? '#D9A24C' : '#E7E0D4' }}>
      <div style={{ ...styles.banner, background: d.dissent ? '#FBF0DC' : '#EEF4EE', color: d.dissent ? '#8A5A17' : '#3C6B47' }}>
        {d.dissent ? '⚖️ Split decision' : '✓ Unanimous'} — {d.summary}
      </div>
      <p style={styles.question}>{d.question}</p>

      {d.dissent && (
        <div style={styles.positions}>
          {labels.map(l => (
            <div key={l} style={styles.positionCol}>
              <div style={styles.positionLabel}>{l}</div>
              <div style={styles.positionMembers}>{d.positions[l].join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.verdicts}>
        {d.verdicts.map((v, i) => <Verdict key={`${v.member}-${i}`} v={v} />)}
      </div>

      {d.resolution && <Resolution r={d.resolution} />}

      {ruling && (
        <div role="status" style={styles.ruledBanner}>
          ⚖️ Ruled by human review: <strong>{ruling.label}</strong> — recorded as hive precedent; the panelists were graded against this ruling.
        </div>
      )}
      {needsRuling && <RulingBlock d={d} sessionId={sessionId} index={index} onRuled={onRuled} />}
    </div>
  );
}

export function DissentTab({ data, rulings, onRuled }: Props) {
  const dissents = data.dissents ?? [];
  const splits = dissents.filter(d => d.dissent).length;
  // Demo sessions have no backend record to rule on.
  const canRule = !data.sessionId.startsWith('demo-session');

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h2 style={styles.title}>The Dissent</h2>
        <p style={styles.subtitle}>
          On the hardest, load-bearing clauses, an independent panel of different models answered the same
          question. Where they <strong>disagree</strong>, the hivemind retrieves authority and puts the
          question again with the evidence attached. A split that resolves is recorded with its evidence;
          a split that survives is escalated to human judgment — never hidden behind a single answer.
        </p>
        {dissents.length > 0 && (
          <div style={styles.summary}>
            <strong>{dissents.length}</strong> clause{dissents.length === 1 ? '' : 's'} put to a panel
            {splits > 0 && <> · <strong>{splits}</strong> produced a split</>}
          </div>
        )}
      </header>

      {dissents.length === 0 ? (
        <div style={styles.empty}>
          No clauses were escalated to a dissent panel in this engagement. Panels run on genuinely ambiguous,
          load-bearing provisions (liability caps, indemnity, termination, governing law).
        </div>
      ) : (
        <div style={styles.list}>
          {dissents.map((d, i) => (
            <DissentCard
              key={i}
              d={d}
              sessionId={data.sessionId}
              index={i}
              canRule={canRule}
              ruledLocally={rulings[i]}
              onRuled={r => onRuled(i, r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 880, margin: '0 auto', padding: '8px 4px 40px' },
  header: { marginBottom: 24 },
  title: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 30, fontWeight: 600, margin: '0 0 6px', color: '#1A1714' },
  subtitle: { fontSize: 15, lineHeight: 1.55, color: '#5C554C', margin: 0, maxWidth: 700 },
  summary: { marginTop: 14, fontSize: 13.5, color: '#6B6358', background: '#F4EFE6', borderRadius: 8, padding: '8px 12px', display: 'inline-block' },
  empty: { fontSize: 14.5, color: '#7A7268', background: '#F6F2EA', borderRadius: 10, padding: '20px 22px', lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { border: '1px solid #E7E0D4', borderRadius: 12, padding: '0 0 16px', background: '#FCFAF5', overflow: 'hidden' },
  banner: { fontSize: 13, fontWeight: 600, padding: '9px 16px' },
  question: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 19, fontWeight: 600, color: '#1A1714', margin: '12px 16px 6px' },
  positions: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '4px 16px 10px' },
  positionCol: { flex: '1 1 140px', minWidth: 140, background: '#F4EFE6', borderRadius: 8, padding: '8px 10px' },
  positionLabel: { fontSize: 13, fontWeight: 700, color: '#3D372F' },
  positionMembers: { fontSize: 12, color: '#7A7268', marginTop: 2 },
  verdicts: { display: 'flex', flexDirection: 'column', gap: 10, margin: '0 16px' },
  verdict: { borderTop: '1px solid #EDE7DC', paddingTop: 10 },
  vHead: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  vModel: { fontSize: 14, fontWeight: 600, color: '#1A1714' },
  vLabel: { color: '#fff', fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 999 },
  vConf: { fontSize: 11.5, color: '#8A8276' },
  vUnavailable: { fontSize: 11.5, color: '#A89F92' },
  vQuote: { margin: '7px 0 0', padding: '6px 12px', borderLeft: '3px solid #D9CBB2', background: '#F7F2E9', fontSize: 13, lineHeight: 1.5, color: '#463F35', fontStyle: 'italic' },
  vRationale: { fontSize: 13, lineHeight: 1.5, color: '#534C42', margin: '6px 0 0' },
  resolution: { margin: '14px 16px 0', borderTop: '1px dashed #D9CBB2', paddingTop: 12 },
  resolutionBanner: { fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 8 },
  evidence: { marginTop: 10 },
  evidenceTitle: { fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: '#8A8276', marginBottom: 6 },
  evidenceItem: { fontSize: 12.5, lineHeight: 1.5, color: '#534C42', background: '#F7F2E9', borderRadius: 8, padding: '7px 10px', marginBottom: 6 },
  evidenceSource: { fontWeight: 600, color: '#3D372F' },
  revote: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginTop: 8 },
  revoteTitle: { fontSize: 12, fontWeight: 600, color: '#6B6358' },
  revoteChip: { fontSize: 12, color: '#3D372F', background: '#F0EBE1', borderRadius: 999, padding: '3px 10px' },
  ruling: { margin: '14px 16px 0', borderTop: '1px dashed #D9CBB2', paddingTop: 12 },
  rulingPrompt: { fontSize: 13, fontWeight: 600, color: '#3D372F', marginBottom: 10 },
  rulingButtons: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  rulingBtn: {
    fontSize: 13, fontWeight: 600, color: '#1A1714', background: '#F4EFE6',
    border: '1.5px solid #C9B98F', borderRadius: 999, padding: '7px 16px', cursor: 'pointer',
  },
  rulingError: { fontSize: 12.5, color: '#A33B1F', marginTop: 8 },
  ruledBanner: {
    margin: '14px 16px 0', fontSize: 13, fontWeight: 500, color: '#3C6B47',
    background: '#EEF4EE', borderRadius: 8, padding: '9px 12px',
  },
};
