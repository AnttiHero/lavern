/**
 * FoyerView — The Whiteshoe Foyer.
 *
 * Premium landing with depth, shadow, and floating glass effects.
 * Dark/gold palette — no red.
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

interface Props {
  onPartner: () => void;
  onQuickStart: () => void;
  onMyPage: () => void;
  onLogin?: () => void;
  onAgentDocs?: () => void;
  onDemo?: () => void;
}

// ── Gold accent ──────────────────────────────────────────────────────────
const GOLD = '#B8960B';
const GOLD_LIGHT = 'rgba(184, 150, 11, 0.12)';

// ── Floating button with depth shadow ────────────────────────────────────

function DepthButton({
  onClick,
  variant = 'secondary',
  children,
  animStyle,
}: {
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  animStyle?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const isPrimary = variant === 'primary';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...animStyle,
        position: 'relative',
        fontFamily: "'Inter', sans-serif",
        fontSize: isPrimary ? 13 : 11,
        fontWeight: 600,
        letterSpacing: isPrimary ? 3 : 1.5,
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: 'none',
        borderRadius: isPrimary ? 8 : 6,
        padding: isPrimary ? '16px 44px' : '13px 28px',
        transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
        transform: hovered
          ? 'translateY(-2px)'
          : 'translateY(0)',
        backgroundColor: isPrimary
          ? (hovered ? '#1a1a1a' : '#2a2a2a')
          : (hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)'),
        color: isPrimary ? '#fff' : colors.text,
        backdropFilter: isPrimary ? 'none' : 'blur(20px)',
        boxShadow: isPrimary
          ? (hovered
            ? '0 20px 60px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 8px 32px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.04)')
          : (hovered
            ? '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)'
            : '0 4px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)'),
      }}
    >
      {children}
    </button>
  );
}

// ── Nav button (frosted glass pill) ──────────────────────────────────────

function NavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: '1px solid rgba(26,26,26,0.12)',
        borderRadius: 6,
        padding: '10px 18px',
        minHeight: 36,
        backgroundColor: hovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)',
        backdropFilter: 'blur(16px)',
        color: colors.text,
        transition: 'all 0.3s ease',
        boxShadow: hovered
          ? '0 4px 16px rgba(0,0,0,0.08)'
          : '0 2px 8px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {children}
    </button>
  );
}

// ── The Foyer ────────────────────────────────────────────────────────────

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
      imgRef.current.style.transform = `scale(1.04) translate(${cx}px, ${cy}px)`;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.04)';
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
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#f0ede8' }} />;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        zIndex: 9999,
        backgroundColor: '#f0ede8',
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Full-bleed texture with depth ──────────────────── */}
      <img
        ref={imgRef}
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        role="presentation"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          willChange: 'transform',
          transition: 'transform 0.3s ease-out',
          filter: 'contrast(0.8) brightness(1.08) saturate(0.25)',
          opacity: 0.55,
          transform: 'scale(1.04)',
          animation: 'lobbyPhotoReveal 2s ease 0s both',
        }}
      />

      {/* ── Depth vignette — dark edges for depth ───────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 70% at 50% 40%, transparent 0%, rgba(26,26,26,0.06) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* ── Frost veil ───────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(245,243,239,0.3)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Top nav ──────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 36px',
          zIndex: 10,
          animation: 'lobbyFadeIn 0.8s ease 2.4s both',
        }}
      >
        {isLoggedIn ? (
          <>
            {onAgentDocs && (
              <NavButton onClick={onAgentDocs}>
                Agent API {'\u2192'}
              </NavButton>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <NavButton onClick={onMyPage}>My Page</NavButton>
              <NavButton onClick={() => { userCtx!.logout(); }}>Logout</NavButton>
            </div>
          </>
        ) : (
          <>
            <div />
            <NavButton onClick={onLogin ?? (() => {})}>Sign In</NavButton>
          </>
        )}
      </div>

      {/* ── Center content ───────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'safe center',
          zIndex: 5,
          padding: '60px 24px 24px',
          overflowY: 'auto',
        }}
      >
        {/* Wordmark — large, original sizing */}
        <h1
          className="text-4xl sm:text-6xl md:text-7xl lg:text-[130px] font-light font-serif text-text m-0 tracking-[6px] sm:tracking-[12px] md:tracking-[16px] lg:tracking-[22px] uppercase"
          style={{
            animation: 'lobbyNameReveal 1.8s ease 0.6s both',
            textShadow: '0 4px 60px rgba(26,26,26,0.06)',
          }}
        >
          <WhiteshoeIlluminated />
        </h1>

        {/* Gold accent line */}
        <div
          style={{
            width: 60,
            height: 1.5,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            marginTop: 24,
            marginBottom: 20,
            opacity: 0.5,
            animation: 'lobbyLineGrow 0.8s ease 1.6s both',
          }}
        />

        {/* Subtitle */}
        <p
          style={{
            margin: 0,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: colors.text,
            letterSpacing: 8,
            textTransform: 'uppercase',
            opacity: 0.5,
            animation: 'lobbyFadeIn 0.8s ease 1.8s both',
          }}
        >
          The Agentic Law Firm
        </p>

        {/* Statement */}
        <p
          className="text-lg sm:text-xl lg:text-[28px] font-serif font-normal text-text mt-8 sm:mt-10 lg:mt-12 mb-2 tracking-[0.5px] leading-relaxed text-center"
          style={{ animation: 'lobbyFadeUp 0.8s ease 2s both', opacity: 0.45 }}
        >
          Excellence doesn{'\u2019'}t scale.{' '}
          <span className="italic">Until now.</span>
        </p>

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

        {/* CTAs with depth shadows */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            animation: 'lobbyFadeUp 0.5s ease 2.4s both',
          }}
        >
          <DepthButton onClick={onPartner} variant="primary">
            Speak to a Partner
          </DepthButton>

          <DepthButton onClick={onQuickStart} variant="secondary">
            Configure Engagement
          </DepthButton>
        </div>

        {/* Watch Demo + Waitlist */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 24,
            gap: 12,
            animation: 'lobbyFadeIn 0.6s ease 2.8s both',
          }}
        >
          {onDemo && (
            <WatchDemoLink onClick={onDemo} />
          )}

          {/* Waitlist */}
          {!isLoggedIn && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 380 }}>
              <div
                style={{
                  width: 32,
                  height: 1,
                  background: `linear-gradient(90deg, transparent, rgba(26,26,26,0.1), transparent)`,
                  marginBottom: 16,
                }}
              />

              {waitlistDone ? (
                <p
                  style={{
                    margin: 0,
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 15,
                    fontStyle: 'italic',
                    color: GOLD,
                    letterSpacing: 0.5,
                  }}
                >
                  You{'\u2019'}re on the list.
                </p>
              ) : (
                <>
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: 2.5,
                      textTransform: 'uppercase',
                      background: `linear-gradient(90deg, ${colors.text} 0%, ${colors.text} 44%, ${GOLD} 50%, ${colors.text} 56%, ${colors.text} 100%)`,
                      backgroundSize: '400% 100%',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      animation: 'whiteshoeIlluminate 8s ease-in-out infinite',
                      opacity: 0.5,
                    }}
                  >
                    Sign up free. Two engagements on us.
                  </p>

                  <WaitlistForm
                    email={waitlistEmail}
                    onEmailChange={setWaitlistEmail}
                    onSubmit={handleWaitlistSubmit}
                    submitting={waitlistSubmitting}
                  />

                  {waitlistError && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: '#9a6b00',
                        opacity: 0.7,
                      }}
                    >
                      {waitlistError}
                    </p>
                  )}
                </>
              )}

              <InviteLink />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function WatchDemoLink({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 2,
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: 'none',
        backgroundColor: 'transparent',
        color: colors.text,
        opacity: hovered ? 0.7 : 0.3,
        transition: 'all 0.3s ease',
        padding: '4px 8px',
        textDecoration: hovered ? 'underline' : 'none',
        textUnderlineOffset: 4,
      }}
    >
      Watch Demo
    </button>
  );
}

function WaitlistForm({
  email,
  onEmailChange,
  onSubmit,
  submitting,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [formHovered, setFormHovered] = useState(false);
  const [joinHovered, setJoinHovered] = useState(false);
  const active = focused || formHovered;

  return (
    <form
      onSubmit={onSubmit}
      onMouseEnter={() => setFormHovered(true)}
      onMouseLeave={() => setFormHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        maxWidth: 300,
        backgroundColor: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(20px)',
        border: active
          ? `1px solid ${GOLD_LIGHT}`
          : '1px solid rgba(26,26,26,0.08)',
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        boxShadow: active
          ? `0 8px 32px rgba(0,0,0,0.08), 0 0 0 3px ${GOLD_LIGHT}`
          : '0 2px 12px rgba(0,0,0,0.04)',
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <label htmlFor="foyer-waitlist-email" className="sr-only">Email address</label>
      <input
        id="foyer-waitlist-email"
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={e => onEmailChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="email"
        style={{
          flex: 1,
          minWidth: 0,
          padding: '12px 16px',
          backgroundColor: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: colors.text,
          letterSpacing: 0.3,
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        onMouseEnter={() => setJoinHovered(true)}
        onMouseLeave={() => setJoinHovered(false)}
        style={{
          flexShrink: 0,
          padding: '12px 20px',
          backgroundColor: joinHovered ? 'rgba(26,26,26,0.08)' : 'rgba(26,26,26,0.03)',
          border: 'none',
          borderLeft: '1px solid rgba(26,26,26,0.06)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: colors.text,
          opacity: submitting ? 0.3 : (joinHovered ? 0.8 : 0.45),
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          transform: joinHovered ? 'translateY(-1px)' : 'translateY(0)',
        }}
      >
        {submitting ? '\u2026' : 'Join'}
      </button>
    </form>
  );
}

function InviteLink() {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => { window.location.hash = '#/login'; }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        marginTop: 12,
        padding: 0,
        backgroundColor: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: 'italic',
        fontSize: 12,
        letterSpacing: 0.5,
        color: colors.text,
        opacity: hovered ? 0.45 : 0.18,
        textDecoration: hovered ? 'underline' : 'none',
        textUnderlineOffset: 3,
        transition: 'opacity 0.3s ease, text-decoration 0.3s ease',
      }}
    >
      Already have an invite?
    </button>
  );
}
