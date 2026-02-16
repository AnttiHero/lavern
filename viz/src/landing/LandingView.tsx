/**
 * LandingView — Full-screen cinematic landing for Marble.
 *
 * Full-bleed white marble texture fills the entire viewport.
 * The firm name "MARBLE" in massive serif type, centered.
 * A dark gradient veil rises from the bottom — mystery, depth.
 * The tagline appears below the name. Enter gate at the bottom.
 *
 * The effect: walking into a marble lobby. Monumental. Still.
 * The veins in the stone are the only decoration needed.
 *
 * Two entry points:
 *   "Enter"     → Dashboard (sessions, express lane, begin engagement)
 *   "My Page"   → User profile & settings
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';

interface Props {
  onEnter: () => void;
  onMyPage: () => void;
}

// ── Marble Logo — Typography wordmark ────────────────────────────────────
// "MARBLE" in elegant serif letterforms, hand-drawn as SVG paths.
// The M has a thin diagonal vein — a hairline crack through the stone.
// Exported so other views can use the small version.

export function MarbleLogo({
  height = 64,
  color = colors.text,
  veinColor = 'rgba(26, 26, 26, 0.12)',
}: {
  height?: number;
  color?: string;
  veinColor?: string;
}) {
  // The wordmark aspect ratio (width:height ≈ 5.8:1)
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
      {/* M — with marble vein */}
      <path
        d="M0 72V8h3.2l28 48.5h0.6L60.2 8H64v64h-5V22.5h-0.4L33.2 64h-3l-25-41.5H4.8V72H0Z"
        fill={color}
      />
      {/* Vein through the M — a thin diagonal hairline crack */}
      <line
        x1="12" y1="16" x2="52" y2="68"
        stroke={veinColor}
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      {/* Small branch off the vein */}
      <line
        x1="30" y1="38" x2="42" y2="32"
        stroke={veinColor}
        strokeWidth="0.5"
        strokeLinecap="round"
      />

      {/* A */}
      <path
        d="M100 72L79.5 8h5.6L104 63h0.4L123 8h5.6L108.5 72H100Z"
        fill={color}
      />

      {/* R */}
      <path
        d="M148 72V8h26c11 0 18 6 18 16.5 0 8.5-5 14.5-13 16l15 31.5h-5.8l-14.5-30.5H153V72H148ZM153 37h20.5c8.5 0 13.5-4.5 13.5-12.5S182 12 173.5 12H153V37Z"
        fill={color}
      />

      {/* B */}
      <path
        d="M213 72V8h25c10.5 0 17 5.5 17 14.5 0 7-4 12-10 13.5v0.4c8 1.2 13 7 13 15 0 10.5-7.5 20.6-20 20.6H213ZM218 36h18.5c8 0 13-4 13-13s-5-11-13-11H218V36ZM218 68h20c10 0 15-6.5 15-16 0-10-6-12.5-15.5-12.5H218V68Z"
        fill={color}
      />

      {/* L */}
      <path
        d="M281 72V8h5v60h32v4H281Z"
        fill={color}
      />

      {/* E */}
      <path
        d="M335 72V8h38v4h-33v25h30v4h-30v27h34v4H335Z"
        fill={color}
      />
    </svg>
  );
}

// Small logo variant for headers/nav
export function MarbleLogoSmall({
  height = 18,
  color = colors.text,
}: {
  height?: number;
  color?: string;
}) {
  return <MarbleLogo height={height} color={color} veinColor="transparent" />;
}

// ── Animated entrance ────────────────────────────────────────────────────

const KEYFRAMES_ID = 'marble-landing-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes marbleFadeUp {
      0% { opacity: 0; transform: translateY(24px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes marbleFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes marbleLineGrow {
      0% { transform: scaleX(0); }
      100% { transform: scaleX(1); }
    }
    @keyframes marblePhotoReveal {
      0% { opacity: 0; transform: scale(1.04); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes marbleNameReveal {
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

// ── Shimmer overlay for buttons ──────────────────────────────────────
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
      {/* Shimmer sweep — light streak across button on hover */}
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

// ── Hover glow — text responds to cursor presence ───────────────────
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
        textShadow: hovered ? `0 0 50px rgba(26, 26, 26, 0.3), 0 0 100px rgba(26, 26, 26, 0.12)` : 'none',
        opacity: hovered ? 1 : 0.45,
        cursor: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </Tag>
  );
}

export default function LandingView({ onEnter, onMyPage }: Props) {
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

  // ── Custom cursor: dot + trailing ring ──────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
    // Dot follows instantly
    if (dotRef.current) {
      dotRef.current.style.opacity = '1';
      dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
    if (ringRef.current) {
      ringRef.current.style.opacity = '1';
    }
    // Subtle marble parallax
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

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#f0ede8' }} />;
  }

  return (
    <div style={styles.page} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      {/* ── Custom cursor ─────────────────────────────────────────── */}
      <div ref={dotRef} style={styles.cursorDot} />
      <div ref={ringRef} style={styles.cursorRing} />

      {/* ── Full-bleed marble texture ────────────────────────────── */}
      <img
        ref={imgRef}
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={{
          ...styles.marbleImg,
          animation: 'marblePhotoReveal 2s ease 0s both',
        }}
      />

      {/* ── Frost veil ───────────────────────────────────────────── */}
      <div style={styles.veil} />

      {/* ── Top nav ──────────────────────────────────────────────── */}
      <div
        style={{
          ...styles.topNav,
          animation: 'marbleFadeIn 0.8s ease 2.4s both',
        }}
      >
        <ShimmerButton
          onClick={onMyPage}
          style={styles.myPageBtn}
        >
          My Page
        </ShimmerButton>
      </div>

      {/* ── Center content — firm name ────────────────────────────── */}
      <div style={styles.centerContent}>
        <HoverText
          as="h1"
          style={{
            ...styles.firmName,
            animation: 'marbleNameReveal 1.8s ease 0.6s both',
          }}
        >
          MARBLE
        </HoverText>

        {/* Thin rule */}
        <div
          style={{
            ...styles.rule,
            animation: 'marbleLineGrow 0.8s ease 1.6s both',
          }}
        />

        {/* Tagline */}
        <HoverText
          as="p"
          style={{
            ...styles.tagline,
            animation: 'marbleFadeIn 0.8s ease 1.8s both',
          }}
        >
          The Agentic Law Firm
        </HoverText>
      </div>

      {/* ── Bottom content — statement + enter ─────────────────────── */}
      <div style={styles.bottomContent}>
        <HoverText
          as="p"
          style={{
            ...styles.statement,
            animation: 'marbleFadeUp 0.8s ease 2s both',
          }}
        >
          Excellence doesn{'\u2019'}t scale.{' '}
          <span style={styles.statementAccent}>Until now.</span>
        </HoverText>

        <ShimmerButton
          onClick={onEnter}
          style={styles.enterBtn}
          animStyle={{ animation: 'marbleFadeUp 0.5s ease 2.4s both' }}
        >
          Enter {'\u2192'}
        </ShimmerButton>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    zIndex: 9999,
    backgroundColor: '#f0ede8',
    cursor: 'none',
  },

  // ── Custom cursor ──────────────────────────────────────────────────
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

  // ── Marble texture — full bleed, washed out so text dominates ──────
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

  // ── Frost veil — softens marble further, text reads clean ────────
  veil: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(245, 243, 239, 0.35)',
    pointerEvents: 'none' as const,
  },

  // ── Top nav ────────────────────────────────────────────────────────
  topNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '28px 36px',
    zIndex: 10,
  },
  myPageBtn: {
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

  // ── Center content — firm name ─────────────────────────────────────
  firmName: {
    fontSize: 130,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: 22,
    textTransform: 'uppercase' as const,
  },
  centerContent: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    paddingBottom: 80, // offset slightly above true center
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

  // ── Bottom content — statement + enter ─────────────────────────────
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
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
  statementAccent: {
    fontStyle: 'italic',
    color: colors.text,
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
