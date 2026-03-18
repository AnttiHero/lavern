/**
 * LobbyView — The Lavern Lobby.
 *
 * Full-bleed white stone. The firm name in massive serif type.
 * A thin rule, a tagline, and an entrance.
 *
 * The effect: stepping through the dark door into a sunlit
 * lobby. Monumental. Still. The veins in the stone
 * are the only decoration needed.
 */

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { colors } from '../staffing/styles/tokens.js';
import { UserContext } from '../auth/UserContext.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';
import { cn } from '../utils/cn.js';

interface Props {
  onEnter: () => void;
  onMyPage: () => void;
  onLogin?: () => void;
  onAgentDocs?: () => void;
  onDemo?: () => void;
}

// ── Shimmer button ─────────────────────────────────────────────────────────

function ShimmerButton({
  onClick,
  className,
  animStyle,
  children,
}: {
  onClick: () => void;
  className?: string;
  animStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative overflow-hidden border-[1.5px] border-text rounded-sm',
        'font-sans text-[11px] font-semibold tracking-[1.5px] uppercase',
        'px-3 py-1.5 sm:px-5 sm:py-2',
        'cursor-pointer',
        'transition-[background-color,color,border-color] duration-250 ease-in-out',
        className,
      )}
      style={{
        ...animStyle,
        backgroundColor: hovered ? colors.text : 'transparent',
        color: hovered ? '#fff' : colors.text,
        borderColor: hovered ? colors.text : colors.text,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <span
          className="absolute top-0 -left-full w-3/5 h-full pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
            animation: 'lavernShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}

// ── Hover glow ─────────────────────────────────────────────────────────────

function HoverText({
  className,
  style,
  children,
  as: Tag = 'span',
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  as?: 'h1' | 'p' | 'span';
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tag
      className={className}
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

export default function LobbyView({ onEnter, onMyPage, onLogin, onAgentDocs, onDemo }: Props) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const [ready, setReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Subtle parallax on mouse move
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (imgRef.current) {
      const cx = (e.clientX / window.innerWidth - 0.5) * 8;
      const cy = (e.clientY / window.innerHeight - 0.5) * 8;
      imgRef.current.style.transform = `scale(1.03) translate(${cx}px, ${cy}px)`;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.03)';
  }, []);

  if (!ready) {
    return <div className="fixed inset-0 bg-[#f0ede8]" />;
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden z-[9999] bg-[#f0ede8] w-screen h-screen"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Full-bleed texture ──────────────────────────── */}
      <img
        ref={imgRef}
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center will-change-transform transition-transform duration-300 ease-out"
        style={{
          filter: 'contrast(0.75) brightness(1.12) saturate(0.3)',
          opacity: 0.6,
          transform: 'scale(1.03)',
          animation: 'lobbyPhotoReveal 2s ease 0s both',
        }}
      />

      {/* ── Frost veil ─────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[rgba(245,243,239,0.35)] pointer-events-none" />

      {/* ── Top nav ────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-between p-4 sm:p-5 lg:px-9 lg:py-7 z-10"
        style={{ animation: 'lobbyFadeIn 0.8s ease 2.4s both' }}
      >
        {isLoggedIn ? (
          <>
            {onAgentDocs && (
              <ShimmerButton onClick={onAgentDocs}>
                Agent API {'\u2192'}
              </ShimmerButton>
            )}
            <div className="flex gap-2 sm:gap-2.5 items-center">
              <ShimmerButton onClick={onMyPage}>
                My Page
              </ShimmerButton>
              <ShimmerButton onClick={() => { userCtx!.logout(); }}>
                Logout
              </ShimmerButton>
            </div>
          </>
        ) : (
          <>
            <div />
            <ShimmerButton onClick={onLogin ?? (() => {})}>
              Sign In
            </ShimmerButton>
          </>
        )}
      </div>

      {/* ── Center — firm name ──────────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-5 pb-12 sm:pb-16 lg:pb-20 px-4">
        <HoverText
          as="h1"
          className="text-4xl sm:text-6xl md:text-7xl lg:text-[130px] font-light font-serif text-text m-0 tracking-[6px] sm:tracking-[12px] md:tracking-[16px] lg:tracking-[22px] uppercase"
          style={{ animation: 'lobbyNameReveal 1.8s ease 0.6s both' }}
        >
          <LavernIlluminated />
        </HoverText>

        <div
          className="w-16 sm:w-20 lg:w-[100px] h-0.5 bg-text mt-6 sm:mt-8 lg:mt-10 mb-5 sm:mb-6 lg:mb-8 origin-center"
          style={{ animation: 'lobbyLineGrow 0.8s ease 1.6s both' }}
        />

        <HoverText
          as="p"
          className="text-[10px] sm:text-xs lg:text-xl font-sans font-semibold text-text tracking-[3px] sm:tracking-[5px] lg:tracking-[8px] uppercase m-0"
          style={{ animation: 'lobbyFadeIn 0.8s ease 1.8s both' }}
        >
          The Agentic Law Firm
        </HoverText>
      </div>

      {/* ── Bottom — statement + enter ─────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center px-4 pb-8 sm:px-8 sm:pb-10 lg:px-10 lg:pb-[60px] z-10">
        <HoverText
          as="p"
          className="text-xl sm:text-2xl lg:text-[32px] font-serif font-normal text-text mb-8 sm:mb-10 lg:mb-12 tracking-[0.5px] leading-relaxed text-center"
          style={{ animation: 'lobbyFadeUp 0.8s ease 2s both' }}
        >
          Excellence doesn{'\u2019'}t scale.{' '}
          <span className="italic">Until now.</span>
        </HoverText>

        <ShimmerButton
          onClick={onEnter}
          className={cn(
            'px-10 py-4 sm:px-16 sm:py-5 lg:px-[88px] lg:py-5',
            'border-2 border-text',
            'text-sm sm:text-base lg:text-lg font-semibold',
            'tracking-[3px] lg:tracking-[5px]',
          )}
          animStyle={{
            animation: 'lobbyFadeUp 0.5s ease 2.4s both',
            backgroundColor: 'rgba(255, 255, 255, 0.35)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          Enter {'\u2192'}
        </ShimmerButton>

        {onDemo && (
          <button
            onClick={onDemo}
            className="font-sans text-[10px] sm:text-[11px] font-medium tracking-[2px] uppercase cursor-pointer border-0 bg-transparent mt-5 sm:mt-6"
            style={{
              animation: 'lobbyFadeIn 0.6s ease 2.8s both',
              color: colors.text,
              opacity: 0,
              transition: 'opacity 0.3s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.45'; }}
          >
            Watch Demo
          </button>
        )}
      </div>
    </div>
  );
}
