import React from 'react';

const GOLD = '#96875f';
const GOLD_RGB = '150, 135, 95';

/**
 * ShowcaseView — a single-screen iPhone-optimized hero for VC demos.
 * "Lavern" + tagline + pulsing TALK orb. Tap orb to enter demo.
 * Route: #/showcase
 */
export default function ShowcaseView({ onTap }: { onTap?: () => void }) {
  return (
    <div style={S.container}>
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
        <h1 style={S.title}>LAVERN</h1>
        <div style={S.subtitle}>THE AGENTIC LAW FIRM</div>
        <div style={S.divider} />
        <p style={S.tagline}>Talk to our legal agent</p>

        <div style={{ flex: 0.8 }} />

        {/* Orb — the TALK button */}
        <button style={S.orbBtn} onClick={onTap} aria-label="Talk to our legal agent">
          <div style={S.orbPulseRing} />
          <div style={S.orb}>
            <span style={S.orbLabel}>TALK</span>
          </div>
        </button>

        <div style={{ flex: 1.2 }} />
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100dvh',
    overflow: 'hidden',
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
    paddingLeft: 12,
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
  orbBtn: {
    position: 'relative',
    width: 140,
    height: 140,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'showcaseOrbEntrance 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1.4s both',
  },
  orbPulseRing: {
    position: 'absolute',
    inset: -12,
    borderRadius: '50%',
    border: `2px solid rgba(${GOLD_RGB}, 0.3)`,
    animation: 'showcaseCtaPulse 2.5s ease-in-out 2.5s infinite',
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: '50%',
    backgroundColor: '#2a2a2a',
    border: `1.5px solid rgba(${GOLD_RGB}, 0.3)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 40px rgba(${GOLD_RGB}, 0.12), 0 0 80px rgba(${GOLD_RGB}, 0.06)`,
    animation: 'showcaseOrbBump 2.5s ease-in-out 2.5s infinite',
  },
  orbLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 4,
    color: `rgba(${GOLD_RGB}, 0.7)`,
    paddingLeft: 4,
  },
};
