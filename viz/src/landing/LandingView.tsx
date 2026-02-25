/**
 * LandingView — The Dark Door.
 *
 * Near-black marble hall. One question hangs in the air:
 * "Are you a human or an agent?"
 *
 * Two paths. One for people, one for machines.
 * Both enter the same firm. The marble doesn't care.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import { MarbleIlluminated } from '../components/MarbleIlluminated.js';

interface Props {
  onEnter: () => void;
  onMyPage: () => void;
  onAgentDocs?: () => void;
}

// ── Marble Logo — Typography wordmark (kept for LoginView import) ──────────

export function MarbleLogo({
  height = 64,
  color = colors.text,
  veinColor = 'rgba(26, 26, 26, 0.12)',
}: {
  height?: number;
  color?: string;
  veinColor?: string;
}) {
  const w = height * 5.8;
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 464 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
      role="img"
      aria-label="Marble"
    >
      <path d="M0 72V8h3.2l28 48.5h0.6L60.2 8H64v64h-5V22.5h-0.4L33.2 64h-3l-25-41.5H4.8V72H0Z" fill={color} />
      <line x1="12" y1="16" x2="52" y2="68" stroke={veinColor} strokeWidth="0.8" strokeLinecap="round" />
      <line x1="30" y1="38" x2="42" y2="32" stroke={veinColor} strokeWidth="0.5" strokeLinecap="round" />
      <path d="M100 72L79.5 8h5.6L104 63h0.4L123 8h5.6L108.5 72H100Z" fill={color} />
      <path d="M148 72V8h26c11 0 18 6 18 16.5 0 8.5-5 14.5-13 16l15 31.5h-5.8l-14.5-30.5H153V72H148ZM153 37h20.5c8.5 0 13.5-4.5 13.5-12.5S182 12 173.5 12H153V37Z" fill={color} />
      <path d="M213 72V8h25c10.5 0 17 5.5 17 14.5 0 7-4 12-10 13.5v0.4c8 1.2 13 7 13 15 0 10.5-7.5 20.6-20 20.6H213ZM218 36h18.5c8 0 13-4 13-13s-5-11-13-11H218V36ZM218 68h20c10 0 15-6.5 15-16 0-10-6-12.5-15.5-12.5H218V68Z" fill={color} />
      <path d="M281 72V8h5v60h32v4H281Z" fill={color} />
      <path d="M335 72V8h38v4h-33v25h30v4h-30v27h34v4H335Z" fill={color} />
    </svg>
  );
}

export function MarbleLogoSmall({
  height = 18,
  color = colors.text,
}: {
  height?: number;
  color?: string;
}) {
  return <MarbleLogo height={height} color={color} veinColor="transparent" />;
}

// ── Keyframes ──────────────────────────────────────────────────────────────

const KEYFRAMES_ID = 'marble-landing-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes doorReveal {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes doorFade {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes marbleBreath {
      0%, 100% { filter: brightness(0.12) contrast(1.2) saturate(0.15); }
      50% { filter: brightness(0.16) contrast(1.15) saturate(0.2); }
    }
    @keyframes crackGlow {
      0%, 100% { opacity: 0.04; }
      50% { opacity: 0.09; }
    }
    .marble-spotlight {
      -webkit-background-clip: text !important;
      background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      color: transparent !important;
    }
  `;
  document.head.appendChild(style);
}

// ── The Dark Door ──────────────────────────────────────────────────────────

export default function LandingView({ onEnter, onMyPage, onAgentDocs }: Props) {
  const [ready, setReady] = useState(false);
  const [hoveredChoice, setHoveredChoice] = useState<'human' | 'agent' | null>(null);
  const [exiting, setExiting] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const welcomeRef = useRef<HTMLParagraphElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ── Custom cursor — light dot + trailing ring on dark ──────────────────

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
    if (dotRef.current) {
      dotRef.current.style.opacity = '1';
      dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
    if (ringRef.current) ringRef.current.style.opacity = '1';
    // Subtle marble parallax
    if (imgRef.current) {
      const cx = (e.clientX / window.innerWidth - 0.5) * 6;
      const cy = (e.clientY / window.innerHeight - 0.5) * 6;
      imgRef.current.style.transform = `scale(1.05) translate(${cx}px, ${cy}px)`;
    }
    // ── Welcome text spotlight — flashlight on carved stone ────────────
    if (welcomeRef.current) {
      const rect = welcomeRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      const dist = Math.hypot(
        e.clientX - (rect.left + rect.width / 2),
        e.clientY - (rect.top + rect.height / 2),
      );
      const maxDist = 280;
      const t = Math.max(0, 1 - dist / maxDist);
      const eased = t * t;
      if (eased > 0.005) {
        const peak = 0.25 + eased * 0.6;
        const r = 60 + eased * 60;
        welcomeRef.current.style.background =
          `radial-gradient(circle ${r}px at ${relX}px ${relY}px, rgba(250,249,246,${peak}) 0%, rgba(250,249,246,0.25) 100%)`;
      } else {
        welcomeRef.current.style.background = 'rgba(250, 249, 246, 0.25)';
      }
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (dotRef.current) dotRef.current.style.opacity = '0';
    if (ringRef.current) ringRef.current.style.opacity = '0';
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.05)';
    if (welcomeRef.current) welcomeRef.current.style.background = 'rgba(250, 249, 246, 0.25)';
  }, []);

  // Ring follows with spring-like lag
  useEffect(() => {
    if (!ready) return;
    const animate = () => {
      const dx = mousePos.current.x - ringPos.current.x;
      const dy = mousePos.current.y - ringPos.current.y;
      ringPos.current.x += dx * 0.09;
      ringPos.current.y += dy * 0.09;
      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${ringPos.current.x}px, ${ringPos.current.y}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready]);

  // ── Choice handler — fade then navigate ────────────────────────────────

  const handleChoice = useCallback((choice: 'human' | 'agent') => {
    setExiting(true);
    setTimeout(() => {
      if (choice === 'human') {
        onEnter();
      } else if (onAgentDocs) {
        onAgentDocs();
      } else {
        onEnter();
      }
    }, 700);
  }, [onEnter, onAgentDocs]);

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#080808' }} />;
  }

  return (
    <div
      style={{
        ...styles.page,
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.7s ease',
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Custom cursor ──────────────────────────────────────────── */}
      <div ref={dotRef} style={styles.cursorDot} />
      <div ref={ringRef} style={styles.cursorRing} />

      {/* ── Marble texture — barely visible in the dark ────────────── */}
      <img
        ref={imgRef}
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={styles.marbleImg}
      />

      {/* ── Dark veil — vignette toward edges ──────────────────────── */}
      <div style={styles.veil} />

      {/* ── Vertical light crack — the door seam ───────────────────── */}
      <div style={styles.doorCrack} />

      {/* ── Center — The Question ──────────────────────────────────── */}
      <div style={styles.center}>
        <p
          ref={welcomeRef}
          className="marble-spotlight"
          style={{
            ...styles.welcome,
            animation: 'doorFade 1.8s ease 0.3s both',
            background: 'rgba(250, 249, 246, 0.25)',
          }}
        >
          Welcome to Marble
        </p>

        <h1
          style={{
            ...styles.questionTop,
            animation: 'doorReveal 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.9s both',
          }}
        >
          Are you a human
        </h1>
        <h1
          style={{
            ...styles.questionBottom,
            animation: 'doorReveal 1.4s cubic-bezier(0.22, 1, 0.36, 1) 1.3s both',
          }}
        >
          or an agent?
        </h1>

        {/* ── Two paths ────────────────────────────────────────────── */}
        <div
          style={{
            ...styles.choiceRow,
            animation: 'doorFade 1s ease 2.3s both',
          }}
        >
          <button
            onClick={() => handleChoice('human')}
            style={{
              ...styles.choiceBtn,
              color: hoveredChoice === 'human'
                ? 'rgba(250, 249, 246, 0.95)'
                : 'rgba(250, 249, 246, 0.35)',
              borderColor: hoveredChoice === 'human'
                ? 'rgba(250, 249, 246, 0.45)'
                : 'rgba(250, 249, 246, 0.12)',
              backgroundColor: hoveredChoice === 'human'
                ? 'rgba(250, 249, 246, 0.06)'
                : 'transparent',
            }}
            onMouseEnter={() => setHoveredChoice('human')}
            onMouseLeave={() => setHoveredChoice(null)}
          >
            Human
          </button>

          <span style={styles.choiceDivider} />

          <button
            onClick={() => handleChoice('agent')}
            style={{
              ...styles.choiceBtn,
              color: hoveredChoice === 'agent'
                ? colors.accent
                : 'rgba(250, 249, 246, 0.35)',
              borderColor: hoveredChoice === 'agent'
                ? 'rgba(196, 93, 62, 0.5)'
                : 'rgba(250, 249, 246, 0.12)',
              backgroundColor: hoveredChoice === 'agent'
                ? 'rgba(196, 93, 62, 0.06)'
                : 'transparent',
            }}
            onMouseEnter={() => setHoveredChoice('agent')}
            onMouseLeave={() => setHoveredChoice(null)}
          >
            Agent
          </button>
        </div>
      </div>

      {/* ── Bottom — barely-there firm name ─────────────────────────── */}
      <div
        style={{
          ...styles.bottom,
          animation: 'doorFade 0.6s ease 3.1s both',
        }}
      >
        <span style={styles.firmCredit}>
          <MarbleIlluminated color="rgba(250,249,246,0.12)" glow="rgba(250,249,246,0.35)" />
        </span>
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
    backgroundColor: '#080808',
    cursor: 'none',
  },

  // ── Custom cursor — inverted for dark background ─────────────────────
  cursorDot: {
    position: 'fixed',
    top: -4,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: 'rgba(250, 249, 246, 0.85)',
    pointerEvents: 'none' as const,
    zIndex: 9999,
    willChange: 'transform',
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },
  cursorRing: {
    position: 'fixed',
    top: -18,
    left: -18,
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: 'rgba(250, 249, 246, 0.03)',
    filter: 'blur(10px)',
    pointerEvents: 'none' as const,
    zIndex: 9998,
    willChange: 'transform',
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },

  // ── Marble texture — darkened to near-invisibility ────────────────────
  marbleImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'center center',
    filter: 'brightness(0.14) contrast(1.2) saturate(0.15)',
    opacity: 0.7,
    transform: 'scale(1.05)',
    willChange: 'transform',
    transition: 'transform 0.5s ease-out',
    animation: 'marbleBreath 10s ease infinite',
  },

  // ── Dark veil — radial vignette, darker at edges ──────────────────────
  veil: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(8, 8, 8, 0.6) 100%)',
    pointerEvents: 'none' as const,
    zIndex: 1,
  },

  // ── Door crack — a thin vertical line of faint light ──────────────────
  doorCrack: {
    position: 'absolute',
    top: '10%',
    bottom: '10%',
    left: '50%',
    width: 1,
    marginLeft: -0.5,
    background: 'linear-gradient(to bottom, transparent 0%, rgba(250, 249, 246, 0.04) 20%, rgba(250, 249, 246, 0.06) 50%, rgba(250, 249, 246, 0.04) 80%, transparent 100%)',
    pointerEvents: 'none' as const,
    zIndex: 2,
    animation: 'crackGlow 6s ease infinite',
  },

  // ── Center content ────────────────────────────────────────────────────
  center: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    paddingBottom: 32,
  },

  welcome: {
    fontSize: 13,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.25)',
    letterSpacing: 6,
    textTransform: 'uppercase' as const,
    margin: '0 0 48px',
  },

  questionTop: {
    fontSize: 56,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: 'rgba(250, 249, 246, 0.85)',
    margin: 0,
    letterSpacing: 0.5,
    lineHeight: 1.15,
    textAlign: 'center' as const,
  },
  questionBottom: {
    fontSize: 56,
    fontWeight: 300,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: 'rgba(250, 249, 246, 0.55)',
    margin: 0,
    marginTop: 2,
    letterSpacing: 0.5,
    lineHeight: 1.15,
    textAlign: 'center' as const,
  },

  // ── Choice buttons ────────────────────────────────────────────────────
  choiceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 36,
    marginTop: 72,
  },
  choiceBtn: {
    padding: '14px 52px',
    borderRadius: radii.sm,
    border: '1.5px solid rgba(250, 249, 246, 0.12)',
    backgroundColor: 'transparent',
    color: 'rgba(250, 249, 246, 0.35)',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
    cursor: 'none',
    transition: 'all 0.35s ease',
  },
  choiceDivider: {
    display: 'block',
    width: 1,
    height: 28,
    backgroundColor: 'rgba(250, 249, 246, 0.08)',
  },

  // ── Bottom credit ─────────────────────────────────────────────────────
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    padding: '0 0 40px',
    zIndex: 10,
  },
  firmCredit: {
    fontSize: 9,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: 'rgba(250, 249, 246, 0.12)',
    letterSpacing: 6,
    textTransform: 'uppercase' as const,
  },
};
