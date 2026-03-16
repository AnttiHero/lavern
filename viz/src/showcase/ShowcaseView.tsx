import React from 'react';

const GOLD = '#96875f';
const GOLD_RGB = '150, 135, 95';

/**
 * ShowcaseView — a single-screen iPhone-optimized hero for VC demos.
 * "Whiteshoe" + tagline + breathing orb. Tap to enter demo.
 * Route: #/showcase
 */
export default function ShowcaseView({ onTap }: { onTap?: () => void }) {
  return (
    <div style={S.container} onClick={onTap}>
      {/* Marble background */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={S.bgImage}
      />
      <div style={S.bgOverlay} />

      {/* Content — single screen, no scroll */}
      <div style={S.content}>
        <div style={{ flex: 1.2 }} />

        {/* Firm name */}
        <h1 style={S.title}>WHITESHOE</h1>
        <div style={S.subtitle}>THE AGENTIC LAW FIRM</div>
        <div style={S.divider} />
        <p style={S.tagline}>Talk to our legal agent</p>

        <div style={{ flex: 0.8 }} />

        {/* Orb */}
        <div style={S.orbWrap}>
          <div style={S.orb}>
            <div style={S.orbInner} />
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Bottom hint */}
        <p style={S.hint}>Tap to begin</p>
        <div style={{ flex: 0.3 }} />
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    height: '100dvh' as string,
    overflow: 'hidden',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  bgImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 0,
  },
  bgOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(250,249,246,0.35) 0%, rgba(250,249,246,0.1) 50%, rgba(250,249,246,0.4) 100%)',
    zIndex: 1,
  },
  content: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    padding: '0 24px',
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 38,
    fontWeight: 300,
    letterSpacing: 12,
    color: '#1a1a1a',
    textAlign: 'center',
    margin: 0,
    paddingLeft: 12, // optically center the letter-spacing
    animation: 'showcaseTitle 1.2s cubic-bezier(0.4, 0, 0.2, 1) both',
  },
  subtitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 5,
    color: '#1a1a1a',
    opacity: 0.35,
    textAlign: 'center',
    marginTop: 10,
    paddingLeft: 5,
    animation: 'showcaseFadeIn 0.6s ease 0.5s both',
  },
  divider: {
    width: 40,
    height: 1.5,
    background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
    margin: '24px 0 20px',
    animation: 'showcaseDivider 0.8s ease 0.7s both',
  },
  tagline: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 20,
    fontWeight: 400,
    fontStyle: 'italic',
    color: '#3a3a3a',
    letterSpacing: 0.5,
    textAlign: 'center',
    margin: 0,
    animation: 'showcaseFadeIn 0.8s ease 1s both',
  },
  orbWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'showcaseOrbEntrance 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1.4s both',
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    backgroundColor: '#2a2a2a',
    border: `1.5px solid rgba(${GOLD_RGB}, 0.25)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 40px rgba(${GOLD_RGB}, 0.12), 0 0 80px rgba(${GOLD_RGB}, 0.06)`,
    animation: 'showcaseOrbBreath 4s ease-in-out 2.2s infinite',
  },
  orbInner: {
    width: '55%',
    height: '55%',
    borderRadius: '50%',
    border: `1px solid rgba(${GOLD_RGB}, 0.2)`,
  },
  hint: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: '#aaa',
    textAlign: 'center',
    margin: 0,
    animation: 'showcaseFadeIn 0.6s ease 2.2s both',
  },
};
