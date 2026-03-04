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
import { colors } from '../staffing/styles/tokens.js';
import { cn } from '../utils/cn.js';
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

// ── The Dark Door ──────────────────────────────────────────────────────────

export default function LandingView({ onEnter, onMyPage, onAgentDocs }: Props) {
  const [ready, setReady] = useState(false);
  const [hoveredChoice, setHoveredChoice] = useState<'human' | 'agent' | null>(null);
  const [exiting, setExiting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const welcomeRef = useRef<HTMLParagraphElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ── Parallax + welcome spotlight ───────────────────────────────────────

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
    // Subtle marble parallax
    if (imgRef.current) {
      const cx = (e.clientX / window.innerWidth - 0.5) * 6;
      const cy = (e.clientY / window.innerHeight - 0.5) * 6;
      imgRef.current.style.transform = `scale(1.05) translate(${cx}px, ${cy}px)`;
    }
    // Welcome text spotlight — flashlight on carved stone
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
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.05)';
    if (welcomeRef.current) welcomeRef.current.style.background = 'rgba(250, 249, 246, 0.25)';
  }, []);

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
    return <div className="fixed inset-0 bg-[#080808]" />;
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden z-[9999] bg-[#080808]"
      style={{
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.7s ease',
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Marble texture — barely visible in the dark ────────────── */}
      <img
        ref={imgRef}
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center will-change-transform transition-transform duration-500 ease-out animate-[marbleBreath_10s_ease_infinite]"
        style={{
          filter: 'brightness(0.14) contrast(1.2) saturate(0.15)',
          opacity: 0.7,
          transform: 'scale(1.05)',
        }}
      />

      {/* ── Dark veil — vignette toward edges ──────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(8, 8, 8, 0.6) 100%)',
        }}
      />

      {/* ── Vertical light crack — the door seam ───────────────────── */}
      <div
        className="absolute top-[10%] bottom-[10%] left-1/2 w-px -ml-px pointer-events-none z-[2] animate-[crackGlow_6s_ease_infinite]"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(250, 249, 246, 0.04) 20%, rgba(250, 249, 246, 0.06) 50%, rgba(250, 249, 246, 0.04) 80%, transparent 100%)',
        }}
      />

      {/* ── Center — The Question ──────────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-[5] pb-8">
        <p
          ref={welcomeRef}
          className={cn(
            'marble-spotlight',
            'text-[10px] sm:text-[13px] font-medium font-sans',
            'text-[rgba(250,249,246,0.25)] tracking-[3px] sm:tracking-[6px] uppercase',
            'm-0 mb-8 sm:mb-12',
          )}
          style={{
            animation: 'doorFade 1.8s ease 0.3s both',
            background: 'rgba(250, 249, 246, 0.25)',
          }}
        >
          Welcome to Marble
        </p>

        <h1
          className={cn(
            'text-3xl sm:text-4xl lg:text-[56px] font-light font-serif',
            'text-[rgba(250,249,246,0.85)] m-0 tracking-[0.5px] leading-[1.15] text-center',
          )}
          style={{
            animation: 'doorReveal 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.9s both',
          }}
        >
          Are you a human
        </h1>
        <h1
          className={cn(
            'text-3xl sm:text-4xl lg:text-[56px] font-light font-serif italic',
            'text-[rgba(250,249,246,0.55)] m-0 mt-0.5 tracking-[0.5px] leading-[1.15] text-center',
          )}
          style={{
            animation: 'doorReveal 1.4s cubic-bezier(0.22, 1, 0.36, 1) 1.3s both',
          }}
        >
          or an agent?
        </h1>

        {/* ── Two paths ────────────────────────────────────────────── */}
        <div
          className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 lg:gap-9 mt-10 sm:mt-14 lg:mt-[72px]"
          style={{
            animation: 'doorFade 1s ease 2.3s both',
          }}
        >
          <button
            onClick={() => handleChoice('human')}
            className={cn(
              'px-6 py-3 sm:px-10 sm:py-3.5 lg:px-[52px] lg:py-3.5',
              'rounded border-[1.5px] border-solid',
              'font-sans text-[10px] sm:text-xs font-medium tracking-[4px] uppercase',
              'cursor-auto lg:cursor-none transition-all duration-[350ms] ease-in-out',
            )}
            style={{
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

          <span className="block h-px w-7 sm:w-px sm:h-7 bg-[rgba(250,249,246,0.08)]" />

          <button
            onClick={() => handleChoice('agent')}
            className={cn(
              'px-6 py-3 sm:px-10 sm:py-3.5 lg:px-[52px] lg:py-3.5',
              'rounded border-[1.5px] border-solid',
              'font-sans text-[10px] sm:text-xs font-medium tracking-[4px] uppercase',
              'cursor-auto lg:cursor-none transition-all duration-[350ms] ease-in-out',
            )}
            style={{
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
        className="absolute bottom-0 left-0 right-0 flex justify-center pb-10 z-10"
        style={{
          animation: 'doorFade 0.6s ease 3.1s both',
        }}
      >
        <span className="text-[9px] font-medium font-sans text-[rgba(250,249,246,0.12)] tracking-[6px] uppercase">
          <MarbleIlluminated color="rgba(250,249,246,0.12)" glow="rgba(250,249,246,0.35)" />
        </span>
      </div>
    </div>
  );
}
