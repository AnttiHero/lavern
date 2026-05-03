/**
 * PublicTeamShareView — what the world sees at /t/:token.
 *
 * Lavern editorial-cinematic aesthetic. The OG card is the hero (rendered
 * as an <img> so the browser shows the same thing LinkedIn unfurls).
 * Below: a roster grid of the members with names and rates, plus a
 * "Try Lavern" CTA. Loaded outside the dashboard chrome.
 */

import { useEffect, useState } from 'react';

interface SharedTeamAgent {
  displayName: string;
  tagline: string;
  category?: string;
  seniority?: string;
  costTier?: string;
  billingRateUsd?: number;
  practiceAreas?: string[];
  avatarSeed?: string;
  skills?: Record<string, number>;
}

interface SharedTeamResponse {
  token: string;
  agents: SharedTeamAgent[];
  title: string;
  ownerName: string;
  viewCount: number;
  createdAt: string;
}

interface Props {
  token: string;
}

export default function PublicTeamShareView({ token }: Props) {
  const [data, setData] = useState<SharedTeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('No share token in URL.'); return; }
    fetch(`/api/teams/share/${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'This team share has been revoked or never existed.' : `HTTP ${r.status}`);
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

  const ogImageSrc = `/api/teams/share/${encodeURIComponent(token)}/og.png`;
  const ownerLine = data.ownerName
    ? `${data.ownerName}'s team`
    : 'A Lavern team';
  const title = data.title || 'My Team';
  const description = data.agents.length === 1
    ? `${data.agents[0].displayName} on Lavern.`
    : `${data.agents.length} agents · ${data.agents.slice(0, 3).map(a => a.displayName).join(', ')}${data.agents.length > 3 ? '…' : ''}`;

  return (
    <div style={styles.page}>
      <Head
        title={`${title} — Lavern`}
        description={description}
        ogImage={ogImageSrc}
      />

      <div style={styles.container}>
        <div style={styles.overline}>{ownerLine}</div>
        <h1 style={styles.title}>{title}</h1>
        <div style={styles.subtitle}>
          {data.agents.length} member{data.agents.length === 1 ? '' : 's'} · assembled on Lavern
        </div>

        {/* The hero — exactly the image LinkedIn would unfurl. */}
        <div style={styles.heroWrap}>
          <img
            src={ogImageSrc}
            alt={`Team card: ${title}`}
            style={styles.heroImg}
          />
        </div>

        {/* Roster grid */}
        <div style={styles.roster}>
          {data.agents.map((a, i) => (
            <RosterCard key={i} agent={a} />
          ))}
        </div>

        <div style={styles.cta}>
          <a href="/" style={styles.ctaBtn}>
            Build your own team on Lavern →
          </a>
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

// ── Roster card ────────────────────────────────────────────────────────

function RosterCard({ agent }: { agent: SharedTeamAgent }) {
  const isGoblin = agent.avatarSeed === 'goblin';
  const avatarUrl = isGoblin
    ? '/goblin.png'
    : `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(agent.avatarSeed || agent.displayName)}&backgroundColor=transparent`;
  return (
    <div style={styles.rosterCard}>
      <img src={avatarUrl} alt="" style={styles.rosterAvatar} />
      <div style={styles.rosterName}>{agent.displayName}</div>
      <div style={styles.rosterMeta}>
        {(agent.seniority ? agent.seniority.replace(/-/g, ' ') : 'partner')}
        {' · '}
        {agent.category || 'lawyer'}
      </div>
      {agent.billingRateUsd !== undefined && (
        <div style={styles.rosterRate}>
          ${agent.billingRateUsd.toLocaleString()}/hr
        </div>
      )}
    </div>
  );
}

// ── <head> setter ──────────────────────────────────────────────────────

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
  container: {
    width: '100%',
    maxWidth: 980,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  overline: {
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: 'rgba(245,239,223,0.5)',
    fontWeight: 600,
  },
  title: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 52,
    fontWeight: 500,
    margin: 0,
    color: '#FAF7F0',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(245,239,223,0.6)',
    fontFamily: `'Inter', sans-serif`,
  },
  heroWrap: {
    width: '100%',
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid rgba(232,132,92,0.18)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
  },
  heroImg: {
    width: '100%',
    display: 'block',
  },
  roster: {
    width: '100%',
    marginTop: 32,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 14,
  },
  rosterCard: {
    background: 'rgba(245,239,223,0.04)',
    border: '1px solid rgba(245,239,223,0.08)',
    borderRadius: 8,
    padding: '18px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  rosterAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    background: '#1A140A',
  },
  rosterName: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 17,
    fontWeight: 500,
    color: '#FAF7F0',
    textAlign: 'center',
    lineHeight: 1.2,
  },
  rosterMeta: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(245,239,223,0.5)',
    fontWeight: 600,
    textAlign: 'center',
  },
  rosterRate: {
    fontSize: 12,
    color: '#E8845C',
    fontFamily: `'SF Mono', Menlo, monospace`,
  },
  cta: {
    marginTop: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  ctaBtn: {
    background: '#E8845C',
    color: '#1A140A',
    padding: '14px 32px',
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: 700,
    borderRadius: 4,
    textDecoration: 'none',
  },
  footer: {
    marginTop: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 14,
    letterSpacing: 8,
    color: 'rgba(245,239,223,0.4)',
  },
  footerMeta: {
    fontSize: 11,
    color: 'rgba(245,239,223,0.35)',
    fontFamily: `'Inter', sans-serif`,
  },
  loading: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 22,
    color: 'rgba(245,239,223,0.55)',
    fontStyle: 'italic',
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 40,
  },
  errorTitle: {
    fontFamily: `'Cormorant Garamond', Georgia, serif`,
    fontSize: 32,
    color: '#FAF7F0',
  },
  errorMsg: {
    fontSize: 14,
    color: 'rgba(245,239,223,0.6)',
    textAlign: 'center',
    maxWidth: 420,
  },
  errorLink: {
    color: '#E8845C',
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: 700,
    textDecoration: 'none',
  },
};
