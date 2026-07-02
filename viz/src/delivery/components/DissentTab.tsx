/**
 * DissentTab — "The Dissent".
 *
 * Where independent models were asked the SAME interpretive question about a
 * load-bearing clause and DISAGREED. A split is a first-class finding: the tab
 * shows each model's position, its confidence, and the exact clause text it
 * relied on — so a reader sees two models staring at the same words and
 * reaching opposite conclusions. No single-model tool can produce this.
 */

import type { DeliveryData, DissentView, DissentVerdictView } from '../hooks/useDeliveryData.js';

interface Props {
  data: DeliveryData;
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

function DissentCard({ d }: { d: DissentView }) {
  const labels = Object.keys(d.positions);
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
    </div>
  );
}

export function DissentTab({ data }: Props) {
  const dissents = data.dissents ?? [];
  const splits = dissents.filter(d => d.dissent).length;

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h2 style={styles.title}>The Dissent</h2>
        <p style={styles.subtitle}>
          On the hardest, load-bearing clauses, an independent panel of different models answered the same
          question. Where they <strong>disagree</strong>, that split is surfaced here — not hidden behind a
          single answer. Two models reading the same words to opposite conclusions is a signal to escalate
          to human judgment.
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
          {dissents.map((d, i) => <DissentCard key={i} d={d} />)}
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
};
