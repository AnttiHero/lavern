/**
 * FoyerView — The Whiteshoe Foyer.
 *
 * Single landing screen replacing both the dark door (LandingView)
 * and the lobby (LobbyView). Light aesthetic with
 * immediate communication of what Whiteshoe does.
 *
 * Two primary paths:
 * 1. "Speak to a Partner" → Partner Mode (conversational intake)
 * 2. "Configure Engagement" → QuickStart (manual configuration)
 *
 * Also preserves: Watch Demo, Sign In, My Page, waitlist capture.
 */

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { colors } from '../staffing/styles/tokens.js';
import { UserContext } from '../auth/UserContext.js';
import { WhiteshoeIlluminated } from '../components/WhiteshoeIlluminated.js';
import { cn } from '../utils/cn.js';

interface Props {
  onPartner: () => void;
  onQuickStart: () => void;
  onMyPage: () => void;
  onLogin?: () => void;
  onAgentDocs?: () => void;
  onDemo?: () => void;
}

// ── Shimmer button (reused from LobbyView) ──────────────────────────────

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
            animation: 'whiteshoeShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}

// ── Accent button (warm terracotta for primary CTA) ─────────────────────

function AccentButton({
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
        'relative overflow-hidden rounded-sm',
        'font-sans text-[11px] sm:text-xs font-semibold tracking-[2px] sm:tracking-[3px] uppercase',
        'px-6 py-3 sm:px-10 sm:py-3.5',
        'cursor-pointer border-[1.5px] border-solid',
        'transition-all duration-300 ease-in-out',
        className,
      )}
      style={{
        ...animStyle,
        backgroundColor: hovered ? colors.accent : 'transparent',
        color: hovered ? '#fff' : colors.accent,
        borderColor: colors.accent,
        boxShadow: hovered
          ? '0 4px 20px rgba(196, 93, 62, 0.25)'
          : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <span
          className="absolute top-0 -left-full w-3/5 h-full pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
            animation: 'whiteshoeShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}

// ── Hover glow ──────────────────────────────────────────────────────────

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

// ── The Foyer ───────────────────────────────────────────────────────────

export default function FoyerView({ onPartner, onQuickStart, onMyPage, onLogin, onAgentDocs, onDemo }: Props) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const [ready, setReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Waitlist state
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');

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

  const handleWaitlistSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail || waitlistSubmitting) return;
    setWaitlistSubmitting(true);
    setWaitlistError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: waitlistEmail }),
      });
      if (res.ok) {
        setWaitlistDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setWaitlistError((data as { error?: string }).error || 'Something went wrong.');
      }
    } catch {
      setWaitlistError('Unable to reach the server.');
    } finally {
      setWaitlistSubmitting(false);
    }
  }, [waitlistEmail, waitlistSubmitting]);

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

      {/* ── Center — everything in one flex column ────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-5 px-4 overflow-y-auto" style={{ padding: '60px 20px 40px' }}>
        <HoverText
          as="h1"
          className="text-4xl sm:text-6xl md:text-7xl lg:text-[130px] font-light font-serif text-text m-0 tracking-[6px] sm:tracking-[12px] md:tracking-[16px] lg:tracking-[22px] uppercase"
          style={{ animation: 'lobbyNameReveal 1.8s ease 0.6s both' }}
        >
          <WhiteshoeIlluminated />
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

        {/* Statement */}
        <HoverText
          as="p"
          className="text-lg sm:text-xl lg:text-[28px] font-serif font-normal text-text mt-8 sm:mt-10 lg:mt-12 mb-2 tracking-[0.5px] leading-relaxed text-center"
          style={{ animation: 'lobbyFadeUp 0.8s ease 2s both' }}
        >
          Excellence doesn{'\u2019'}t scale.{' '}
          <span className="italic">Until now.</span>
        </HoverText>

        {/* Capability line */}
        <p
          className="text-[10px] sm:text-xs font-sans font-normal text-text m-0 mb-8 sm:mb-10 tracking-[1px] sm:tracking-[2px]"
          style={{
            animation: 'lobbyFadeIn 0.8s ease 2.2s both',
            opacity: 0,
          }}
        >
          62 specialists. Every discipline. Standing by.
        </p>

        {/* Primary + secondary CTAs */}
        <div
          className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5"
          style={{ animation: 'lobbyFadeUp 0.5s ease 2.4s both' }}
        >
          <AccentButton
            onClick={onPartner}
            className="px-8 py-3 sm:px-12 sm:py-3.5"
          >
            Speak to a Partner
          </AccentButton>

          <ShimmerButton
            onClick={onQuickStart}
            className="px-6 py-2.5 sm:px-8 sm:py-3"
          >
            Configure Engagement
          </ShimmerButton>
        </div>

        {/* Watch Demo + Waitlist row */}
        <div
          className="flex flex-col items-center mt-5 sm:mt-6 gap-4"
          style={{ animation: 'lobbyFadeIn 0.6s ease 2.8s both' }}
        >
          {onDemo && (
            <button
              onClick={onDemo}
              className="font-sans text-[10px] sm:text-[11px] font-medium tracking-[2px] uppercase cursor-pointer border-0 bg-transparent"
              style={{
                color: colors.text,
                opacity: 0.35,
                transition: 'opacity 0.3s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
            >
              Watch Demo
            </button>
          )}

          {/* Waitlist for unauthenticated users */}
          {!isLoggedIn && (
            <div className="flex flex-col items-center">
              <div className="w-8 h-px bg-text mb-3" style={{ opacity: 0.1 }} />

              {waitlistDone ? (
                <p
                  className="text-xs font-serif italic m-0 tracking-wide"
                  style={{ color: '#B8960B' }}
                >
                  You{'\u2019'}re on the list.
                </p>
              ) : (
                <>
                  <p
                    className="text-[10px] font-serif italic m-0 mb-2 tracking-wide"
                    style={{ color: colors.text, opacity: 0.35 }}
                  >
                    Join the waitlist
                  </p>

                  <form
                    onSubmit={handleWaitlistSubmit}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="email"
                      required
                      placeholder="your@email.com"
                      value={waitlistEmail}
                      onChange={e => setWaitlistEmail(e.target.value)}
                      className="font-sans text-[11px] outline-none"
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'rgba(26, 26, 26, 0.03)',
                        border: '1px solid rgba(26, 26, 26, 0.12)',
                        borderRadius: 3,
                        color: colors.text,
                        width: 170,
                        letterSpacing: 0.3,
                      }}
                    />
                    <button
                      type="submit"
                      disabled={waitlistSubmitting}
                      className="font-sans text-[9px] font-medium tracking-[2px] uppercase cursor-pointer"
                      style={{
                        padding: '6px 14px',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(26, 26, 26, 0.15)',
                        borderRadius: 3,
                        color: colors.text,
                        opacity: waitlistSubmitting ? 0.4 : 0.5,
                        transition: 'all 0.3s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
                    >
                      {waitlistSubmitting ? '\u2026' : 'Join'}
                    </button>
                  </form>

                  {waitlistError && (
                    <p
                      className="text-[10px] font-sans m-0 mt-1.5"
                      style={{ color: colors.accent, opacity: 0.7 }}
                    >
                      {waitlistError}
                    </p>
                  )}
                </>
              )}

              {/* Already have an invite? */}
              <button
                onClick={() => { window.location.hash = '#/login'; }}
                className="bg-transparent border-none cursor-pointer font-serif italic text-[10px] tracking-wide mt-2 p-0"
                style={{
                  color: colors.text,
                  opacity: 0.2,
                  transition: 'opacity 0.3s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.5'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.2'; }}
              >
                Already have an invite?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
