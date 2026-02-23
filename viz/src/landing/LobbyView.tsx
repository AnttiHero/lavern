/**
 * LobbyView — The Marble Lobby.
 *
 * Full-bleed white marble. The firm name in massive serif type.
 * A thin rule, a tagline, and an entrance.
 *
 * The effect: stepping through the dark door into a sunlit
 * marble lobby. Monumental. Still. The veins in the stone
 * are the only decoration needed.
 */

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import { UserContext } from '../auth/UserContext.js';

interface Props {
  onEnter: () => void;
  onMyPage: () => void;
  onLogin?: () => void;
  onAgentDocs?: () => void;
}

// ── Keyframes ──────────────────────────────────────────────────────────────

const KEYFRAMES_ID = 'marble-lobby-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes lobbyFadeUp {
      0% { opacity: 0; transform: translateY(24px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes lobbyFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes lobbyLineGrow {
      0% { transform: scaleX(0); }
      100% { transform: scaleX(1); }
    }
    @keyframes lobbyPhotoReveal {
      0% { opacity: 0; transform: scale(1.04); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes lobbyNameReveal {
      0% { opacity: 0; letter-spacing: 40px; }
      100% { opacity: 1; letter-spacing: 22px; }
    }
    @keyframes marbleShimmer {
      0% { left: -100%; }
      100% { left: 200%; }
    }
  `;
  document.head.appendChild(style);
}

// ── Shimmer button ─────────────────────────────────────────────────────────

function ShimmerButton({
  onClick,
  style,
  animStyle,
  children,
}: {
  onClick: () => void;
  style: React.CSSProperties;
  animStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        ...style,
        ...animStyle,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: hovered ? colors.text : style.backgroundColor,
        color: hovered ? '#fff' : (style.color ?? colors.text),
        borderColor: hovered ? colors.text : (style.borderColor ?? colors.text),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '60%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
            animation: 'marbleShimmer 0.6s ease forwards',
            pointerEvents: 'none',
          }}
        />
      )}
    </button>
  );
}

// ── Hover glow ─────────────────────────────────────────────────────────────

function HoverText({
  style,
  children,
  as: Tag = 'span',
}: {
  style: React.CSSProperties;
  children: React.ReactNode;
  as?: 'h1' | 'p' | 'span';
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tag
      style={{
        ...style,
        transition: 'text-shadow 0.4s ease, opacity 0.4s ease',
        textShadow: hovered ? '0 0 50px rgba(26, 26, 26, 0.3), 0 0 100px rgba(26, 26, 26, 0.12)' : 'none',
        opacity: hovered ? 1 : 0.45,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </Tag>
  );
}

// ── The Lobby ──────────────────────────────────────────────────────────────

export default function LobbyView({ onEnter, onMyPage, onLogin, onAgentDocs }: Props) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const [ready, setReady] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Ring follows with spring-like lag
  useEffect(() => {
    if (!ready) return;
    const animate = () => {
      const dx = mousePos.current.x - ringPos.current.x;
      const dy = mousePos.current.y - ringPos.current.y;
      ringPos.current.x += dx * 0.12;
      ringPos.current.y += dy * 0.12;
      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${ringPos.current.x}px, ${ringPos.current.y}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready]);

  // Custom cursor + subtle marble parallax
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
    if (dotRef.current) {
      dotRef.current.style.opacity = '1';
      dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
    if (ringRef.current) ringRef.current.style.opacity = '1';
    if (imgRef.current) {
      const cx = (e.clientX / window.innerWidth - 0.5) * 8;
      const cy = (e.clientY / window.innerHeight - 0.5) * 8;
      imgRef.current.style.transform = `scale(1.03) translate(${cx}px, ${cy}px)`;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (dotRef.current) dotRef.current.style.opacity = '0';
    if (ringRef.current) ringRef.current.style.opacity = '0';
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.03)';
  }, []);

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#f0ede8' }} />;
  }

  return (
    <div style={styles.page} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      {/* ── Custom cursor ──────────────────────────────────────────── */}
      <div ref={dotRef} style={styles.cursorDot} />
      <div ref={ringRef} style={styles.cursorRing} />

      {/* ── Full-bleed marble texture ────────────────────────────── */}
      <img
        ref={imgRef}
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={{
          ...styles.marbleImg,
          animation: 'lobbyPhotoReveal 2s ease 0s both',
        }}
      />

      {/* ── Frost veil ───────────────────────────────────────────── */}
      <div style={styles.veil} />

      {/* ── Top nav ──────────────────────────────────────────────── */}
      <div
        style={{
          ...styles.topNav,
          animation: 'lobbyFadeIn 0.8s ease 2.4s both',
        }}
      >
        {isLoggedIn && (
          <>
            {onAgentDocs && (
              <ShimmerButton onClick={onAgentDocs} style={styles.navBtn}>
                Agent API {'\u2192'}
              </ShimmerButton>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <ShimmerButton onClick={onMyPage} style={styles.navBtn}>
                My Page
              </ShimmerButton>
              <ShimmerButton onClick={() => { userCtx!.logout(); }} style={styles.navBtn}>
                Logout
              </ShimmerButton>
            </div>
          </>
        )}
      </div>

      {/* ── Center — firm name ────────────────────────────────────── */}
      <div style={styles.centerContent}>
        <HoverText
          as="h1"
          style={{
            ...styles.firmName,
            animation: 'lobbyNameReveal 1.8s ease 0.6s both',
          }}
        >
          MARBLE
        </HoverText>

        <div
          style={{
            ...styles.rule,
            animation: 'lobbyLineGrow 0.8s ease 1.6s both',
          }}
        />

        <HoverText
          as="p"
          style={{
            ...styles.tagline,
            animation: 'lobbyFadeIn 0.8s ease 1.8s both',
          }}
        >
          The Agentic Law Firm
        </HoverText>
      </div>

      {/* ── Bottom — statement + enter ───────────────────────────── */}
      <div style={styles.bottomContent}>
        <HoverText
          as="p"
          style={{
            ...styles.statement,
            animation: 'lobbyFadeUp 0.8s ease 2s both',
          }}
        >
          Excellence doesn{'\u2019'}t scale.{' '}
          <span style={{ fontStyle: 'italic' }}>Until now.</span>
        </HoverText>

        <ShimmerButton
          onClick={onEnter}
          style={styles.enterBtn}
          animStyle={{ animation: 'lobbyFadeUp 0.5s ease 2.4s both' }}
        >
          Enter {'\u2192'}
        </ShimmerButton>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    zIndex: 9999,
    backgroundColor: '#f0ede8',
    cursor: 'none',
  },

  cursorDot: {
    position: 'fixed',
    top: -4,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors.text,
    pointerEvents: 'none' as const,
    zIndex: 9999,
    willChange: 'transform',
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },
  cursorRing: {
    position: 'fixed',
    top: -16,
    left: -16,
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: 'rgba(26, 26, 26, 0.06)',
    filter: 'blur(8px)',
    pointerEvents: 'none' as const,
    zIndex: 9998,
    willChange: 'transform',
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },

  marbleImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'center center',
    filter: 'contrast(0.75) brightness(1.12) saturate(0.3)',
    opacity: 0.6,
    transform: 'scale(1.03)',
    willChange: 'transform',
    transition: 'transform 0.3s ease-out',
  },

  veil: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(245, 243, 239, 0.35)',
    pointerEvents: 'none' as const,
  },

  topNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-between',
    padding: '28px 36px',
    zIndex: 10,
  },
  navBtn: {
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    padding: '8px 20px',
    cursor: 'none',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  centerContent: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    paddingBottom: 80,
  },
  firmName: {
    fontSize: 130,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: 22,
    textTransform: 'uppercase' as const,
  },
  rule: {
    width: 100,
    height: 2,
    backgroundColor: colors.text,
    marginTop: 40,
    marginBottom: 32,
    transformOrigin: 'center',
  },
  tagline: {
    fontSize: 20,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    letterSpacing: 8,
    textTransform: 'uppercase' as const,
    margin: 0,
  },

  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '0 40px 60px',
    zIndex: 10,
  },
  statement: {
    fontSize: 32,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    margin: '0 0 48px',
    letterSpacing: 0.5,
    lineHeight: 1.4,
    textAlign: 'center' as const,
  },
  enterBtn: {
    padding: '20px 88px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: 5,
    textTransform: 'uppercase' as const,
    cursor: 'none',
    transition: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease',
  },
};
