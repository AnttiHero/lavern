/**
 * HivemindTab — "The Hivemind".
 *
 * Shows, per engagement, which model each agent was routed to and WHY: the
 * rationale, every candidate model it was weighed against (with scores), and
 * whether the engine kept the hand-tuned default or deviated on measured data.
 * This is the auditable, glass-box face of Lavern's adaptive orchestration.
 */

import type { DeliveryData, RoutingDecisionView, CandidateView, QuorumView } from '../hooks/useDeliveryData.js';

interface Props {
  data: DeliveryData;
}

function formatRole(role: string): string {
  return role.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#C2603C',
  mistral: '#3C6FC2',
  local: '#3C9C6E',
};

function Bar({ c, chosen }: { c: CandidateView; chosen: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, c.score)) * 100);
  const color = PROVIDER_COLOR[c.provider] ?? '#888';
  return (
    <div style={styles.barRow} title={c.eligible ? undefined : c.reason}>
      <div style={{ ...styles.barLabel, opacity: c.eligible ? 1 : 0.45 }}>
        {c.label}
        {!c.eligible && <span style={styles.barExcluded}> · excluded</span>}
      </div>
      <div style={styles.barTrack}>
        <div style={{
          ...styles.barFill,
          width: `${pct}%`,
          background: c.eligible ? color : '#C9C2B8',
          opacity: chosen ? 1 : 0.55,
          outline: chosen ? `1.5px solid ${color}` : 'none',
        }} />
      </div>
      <div style={styles.barScore}>
        {c.score.toFixed(2)}
        <span style={styles.barSource}>{c.source === 'measured' ? `· ${c.observations} obs` : '· prior'}</span>
      </div>
    </div>
  );
}

function DecisionCard({ d }: { d: RoutingDecisionView }) {
  const color = PROVIDER_COLOR[d.provider] ?? '#888';
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span style={styles.agentName}>{formatRole(d.agentRole)}</span>
        <span style={{ ...styles.modelBadge, background: color }}>{d.chosenLabel}</span>
        {d.overrodeBaseline
          ? <span style={styles.overrodeTag}>↑ deviated from default</span>
          : <span style={styles.keptTag}>default</span>}
        {d.explored && d.effectiveTier && (
          <span style={styles.exploreTag}>exploring {d.effectiveTier}</span>
        )}
      </div>
      <p style={styles.rationale}>{d.rationale}</p>
      <div style={styles.bars}>
        {d.candidates
          .slice()
          .sort((a, b) => b.score - a.score)
          .map(c => <Bar key={c.modelId} c={c} chosen={c.modelId === d.chosenModelId} />)}
      </div>
    </div>
  );
}

const QUORUM_STYLE: Record<QuorumView['outcome'], { label: string; bg: string; fg: string }> = {
  confirmed: { label: '✓ Confirmed', bg: '#EEF4EE', fg: '#3C6B47' },
  unconfirmed: { label: '⚠️ Unconfirmed', bg: '#FBF0DC', fg: '#8A5A17' },
  inconclusive: { label: 'Inconclusive', bg: '#F0EBE1', fg: '#8A8276' },
};

function QuorumCard({ q }: { q: QuorumView }) {
  const s = QUORUM_STYLE[q.outcome] ?? QUORUM_STYLE.inconclusive;
  const answered = q.verdicts.filter(v => !v.error);
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span style={{ ...styles.quorumChip, background: s.bg, color: s.fg }}>{s.label}</span>
        <span style={styles.quorumVotes}>{q.votes}</span>
        <span style={styles.quorumPass}>pass: {q.pass}</span>
      </div>
      <p style={styles.rationale}>{q.finding}</p>
      {answered.length > 0 && (
        <div style={styles.quorumPanelists}>
          {answered.map((v, i) => (
            <span key={i} style={styles.quorumPanelist}>{v.member} → {v.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function HivemindTab({ data }: Props) {
  const decisions = data.hivemind ?? [];
  const deviated = decisions.filter(d => d.overrodeBaseline).length;
  const quorum = data.quorumChecks ?? [];
  const confirmed = quorum.filter(q => q.outcome === 'confirmed').length;

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h2 style={styles.title}>The Hivemind</h2>
        <p style={styles.subtitle}>
          Each agent is routed to the best model for its job — maximizing quality, and showing its work.
          The engine keeps each agent&rsquo;s hand-tuned default until measured performance on this kind of
          matter justifies a change.
        </p>
        {decisions.length > 0 && (
          <div style={styles.summary}>
            <strong>{decisions.length}</strong> agents routed
            {deviated > 0 && <> · <strong>{deviated}</strong> deviated from their default on measured data</>}
          </div>
        )}
      </header>

      {decisions.length === 0 ? (
        <div style={styles.empty}>
          Routing detail isn&rsquo;t available for this engagement yet. It appears for engagements run with
          the Hivemind enabled.
        </div>
      ) : (
        <div style={styles.list}>
          {decisions.map(d => <DecisionCard key={d.agentRole} d={d} />)}
        </div>
      )}

      {quorum.length > 0 && (
        <section style={styles.quorumSection}>
          <h3 style={styles.sectionTitle}>The Quorum</h3>
          <p style={styles.subtitle}>
            Every CRITICAL finding was put to an independent panel: does the cited evidence support it as
            stated? Severity is never lowered by the panel — unconfirmed findings stay CRITICAL and are
            flagged, so nothing ships on one model&rsquo;s say-so.
          </p>
          <div style={styles.summary}>
            <strong>{quorum.length}</strong> CRITICAL finding{quorum.length === 1 ? '' : 's'} checked
            {' '}· <strong>{confirmed}</strong> confirmed by the panel
          </div>
          <div style={{ ...styles.list, marginTop: 14 }}>
            {quorum.map((q, i) => <QuorumCard key={i} q={q} />)}
          </div>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 880, margin: '0 auto', padding: '8px 4px 40px' },
  header: { marginBottom: 24 },
  title: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 30, fontWeight: 600, margin: '0 0 6px', color: '#1A1714' },
  subtitle: { fontSize: 15, lineHeight: 1.55, color: '#5C554C', margin: 0, maxWidth: 680 },
  summary: { marginTop: 14, fontSize: 13.5, color: '#6B6358', background: '#F4EFE6', borderRadius: 8, padding: '8px 12px', display: 'inline-block' },
  empty: { fontSize: 14.5, color: '#7A7268', background: '#F6F2EA', borderRadius: 10, padding: '20px 22px', lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: { border: '1px solid #E7E0D4', borderRadius: 12, padding: '16px 18px', background: '#FCFAF5' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  agentName: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 19, fontWeight: 600, color: '#1A1714' },
  modelBadge: { color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, letterSpacing: 0.2 },
  overrodeTag: { fontSize: 11.5, fontWeight: 600, color: '#9A5B2C', background: '#F6E7D6', padding: '2px 8px', borderRadius: 999 },
  keptTag: { fontSize: 11.5, color: '#8A8276', background: '#F0EBE1', padding: '2px 8px', borderRadius: 999 },
  exploreTag: { fontSize: 11.5, fontWeight: 600, color: '#2D6E8F', background: '#DEEDF4', padding: '2px 8px', borderRadius: 999 },
  rationale: { fontSize: 13.5, lineHeight: 1.5, color: '#534C42', margin: '0 0 12px' },
  bars: { display: 'flex', flexDirection: 'column', gap: 6 },
  barRow: { display: 'grid', gridTemplateColumns: '150px 1fr 84px', alignItems: 'center', gap: 10 },
  barLabel: { fontSize: 12.5, color: '#3D372F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  barExcluded: { fontSize: 11, color: '#A89F92' },
  barTrack: { height: 8, background: '#EDE7DC', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, transition: 'width .3s ease' },
  barScore: { fontSize: 12, color: '#6B6358', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  barSource: { display: 'block', fontSize: 10, color: '#A89F92' },
  quorumSection: { marginTop: 36 },
  sectionTitle: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 600, margin: '0 0 6px', color: '#1A1714' },
  quorumChip: { fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999 },
  quorumVotes: { fontSize: 12, color: '#6B6358', fontVariantNumeric: 'tabular-nums' },
  quorumPass: { fontSize: 11.5, color: '#A89F92' },
  quorumPanelists: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  quorumPanelist: { fontSize: 12, color: '#3D372F', background: '#F0EBE1', borderRadius: 999, padding: '3px 10px' },
};
