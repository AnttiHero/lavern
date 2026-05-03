/**
 * PublicAgentShareView — what the world sees at /a/:token.
 *
 * Lavern editorial-cinematic aesthetic. Dark, dignified, the card is the show.
 * Above the fold:
 *   - Provenance overline ("Antti cloned themselves." / "Antti cloned MinterEllison.")
 *   - Avatar (large, with goblin photo support)
 *   - Name + archetype
 *   - Tagline + receipt quote
 *   - Skills constellation
 *   - "Save to my Lavern" CTA → deep-links the receiving user to the
 *     dashboard with ?import=<token>
 *
 * Below the fold:
 *   - Lavern wordmark + "Make yours →" link
 *   - View count + creation date (small, factual)
 *
 * Loaded lazily; outside the dashboard chrome.
 */

import { useEffect, useState } from 'react';
import type { AgentProfile } from '../types/agent-profile.js';

interface SharedAgentResponse {
  token: string;
  profile: AgentProfile;
  ownerName: string;
  viewCount: number;
  createdAt: string;
}

interface Props {
  token: string;
}

const SKILL_LABEL: Record<string, string> = {
  precision: 'Precision', creativity: 'Creativity', speed: 'Speed', depth: 'Depth',
  negotiation: 'Negotiation', communication: 'Communication', research: 'Research', risk: 'Risk',
};

function provenanceLine(p: AgentProfile['provenance'], owner: string): string {
  const who = owner || 'Someone';
  if (!p) return `${who} made this on Lavern`;
  switch (p.kind) {
    case 'self':    return `${who} cloned themselves`;
    case 'firm':    return p.firmName ? `${who} cloned ${p.firmName}` : `${who} cloned a firm`;
    case 'scratch': return `${who} built this agent`;
    case 'goblin':  return `${who} summoned a goblin`;
  }
}

export default function PublicAgentShareView({ token }: Props) {
  const [data, setData] = useState<SharedAgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('No share token in URL.'); return; }
    fetch(`/api/agents/share/${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'This agent share has been revoked or never existed.' : `HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBox}>
          <div style={styles.errorTitle}>Not found</div>
          <div style={styles.errorMsg}>{error}</div>
          <a href="/" style={styles.errorLink}>Lavern.ai →</a>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div style={styles.page}><div style={styles.loading}>Loading…</div></div>;
  }

  const a = data.profile;
  const overline = provenanceLine(a.provenance, data.ownerName);
  const isGoblin = a.avatarSeed === 'goblin';
  const avatarUrl = isGoblin
    ? '/goblin.png'
    : `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(a.avatarSeed || a.displayName)}&backgroundColor=transparent`;
  const topSkills = Object.entries(a.skills)
    .map(([k, v]) => ({ label: SKILL_LABEL[k] ?? k, value: v }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 4);

  return (
    <div style={styles.page}>
      {/* Set OG meta dynamically — most platforms use server-rendered HTML for
          unfurls, but for client-side preview we still set them so a refresh
          via curl-as-bot still gets the right meta. */}
      <Head
        title={`${a.displayName} — Lavern`}
        description={a.tagline}
        ogImage={`/api/agents/share/${encodeURIComponent(token)}/og.png`}
      />

      <div style={styles.container}>
        <div style={styles.overline}>{overline}</div>

        <div style={styles.cardRow}>
          <div style={styles.avatarWrap}>
            <img src={avatarUrl} alt="" style={styles.avatar} />
          </div>
          <div style={styles.nameCol}>
            <div style={styles.name}>{a.displayName}</div>
            <div style={styles.archetype}>{a.personality.archetype}</div>
          </div>
        </div>

        <div style={styles.tagline}>"{a.tagline}"</div>

        <div style={styles.skills}>
          {topSkills.map(s => (
            <div key={s.label} style={styles.skill}>
              <div style={styles.skillValue}>{s.value}<span style={styles.skillMax}>/10</span></div>
              <div style={styles.skillLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={styles.workStyle}>{a.personality.workStyle}</div>

        <div style={styles.cta}>
          <a
            href={`/?import=${encodeURIComponent(token)}#/agent-builder`}
            style={styles.ctaBtn}
          >
            Save this agent to my Lavern →
          </a>
          <div style={styles.ctaSub}>
            Don't have Lavern yet? <a href="/" style={styles.ctaLink}>Try it free →</a>
          </div>
        </div>
      </div>

      <footer style={styles.footer}>
        <div style={styles.wordmark}>LAVERN</div>
        <div style={styles.footerMeta}>
          {data.viewCount.toLocaleString()} view{data.viewCount === 1 ? '' : 's'} ·
          shared {new Date(data.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </footer>
    </div>
  );
}

// ── Inline <head> setter ────────────────────────────────────────────────

function Head({ title, description, ogImage }: { title: string; description: string; ogImage: string }) {
  useEffect(() => {
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:image', new URL(ogImage, window.location.origin).toString(), true);
    setMeta('og:type', 'website', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', new URL(ogImage, window.location.origin).toString());
  }, [title, description, ogImage]);
  return null;
}

function setMeta(name: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0A0806 0%, #14100A 100%)',
    color: '#F5EFDF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '60px 24px 36px',
  },
  loading: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 22,
    color: 'rgba(245,239,223,0.55)',
    fontStyle: 'italic',
  },
  errorBox: {
    maxWidth: 480, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16,
  },
  errorTitle: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 36, fontWeight: 500,
  },
  errorMsg: { color: 'rgba(245,239,223,0.7)', fontSize: 14, lineHeight: 1.6 },
  errorLink: { color: '#E8845C', textDecoration: 'none', fontSize: 13, letterSpacing: 1 },
  container: {
    maxWidth: 760, width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 24,
  },
  overline: {
    fontSize: 12, letterSpacing: 4, textTransform: 'uppercase',
    color: '#E8845C', fontWeight: 600,
  },
  cardRow: {
    display: 'flex', alignItems: 'center', gap: 28,
    padding: '12px 0',
  },
  avatarWrap: {
    width: 140, height: 140, borderRadius: '50%',
    background: '#1A140A',
    border: '2px solid rgba(232,132,92,0.35)',
    overflow: 'hidden', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: '100%', height: '100%', objectFit: 'cover' },
  nameCol: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  name: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 64, fontWeight: 500, lineHeight: 1.0, letterSpacing: -1.2,
    color: '#FAF7F0',
  },
  archetype: {
    fontSize: 13, letterSpacing: 2.4, textTransform: 'uppercase',
    color: '#E8845C', fontWeight: 600, marginTop: 6,
  },
  tagline: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontStyle: 'italic',
    fontSize: 24, color: 'rgba(245,239,223,0.8)',
    lineHeight: 1.45,
    maxWidth: 600,
  },
  skills: {
    display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center',
    paddingTop: 8,
  },
  skill: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  skillValue: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 36, color: '#FAF7F0', lineHeight: 1, fontWeight: 500,
  },
  skillMax: { fontSize: 16, color: 'rgba(245,239,223,0.4)' },
  skillLabel: {
    fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
    color: 'rgba(245,239,223,0.5)',
  },
  workStyle: {
    maxWidth: 520, fontSize: 14, lineHeight: 1.65,
    color: 'rgba(245,239,223,0.65)', fontStyle: 'italic',
    paddingTop: 8,
  },
  cta: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    paddingTop: 28,
  },
  ctaBtn: {
    background: '#E8845C', color: '#1A140A',
    padding: '14px 28px',
    fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase',
    fontWeight: 700,
    textDecoration: 'none', borderRadius: 4,
    boxShadow: '0 8px 24px rgba(232,132,92,0.25)',
  },
  ctaSub: { fontSize: 12, color: 'rgba(245,239,223,0.55)', marginTop: 4 },
  ctaLink: { color: '#E8845C', textDecoration: 'none' },
  footer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    paddingTop: 48,
  },
  wordmark: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 22, letterSpacing: 4, color: '#FAF7F0', fontWeight: 500,
  },
  footerMeta: { fontSize: 10, letterSpacing: 1.2, color: 'rgba(245,239,223,0.4)' },
};
