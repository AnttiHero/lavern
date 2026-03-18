/**
 * FoyerView — The Lavern Lobby.
 *
 * Dark, foggy, minimal. Same energy as the marketing site.
 * LAVERN logo top-left, Sign In top-right.
 * Center: "Watch the demo." + waitlist.
 * Logged-in users get entry buttons.
 */

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { UserContext } from '../auth/UserContext.js';

const DARK = '#080808';
const TEXT = '#FAF9F6';
const MUTED = 'rgba(250,249,246,0.4)';
const ACCENT = '#D49060';
const SERIF = "'Cormorant Garamond', Georgia, serif";
const SANS = "'Inter', -apple-system, sans-serif";

interface Props {
  onPartner: () => void;
  onQuickStart: () => void;
  onMyPage: () => void;
  onLogin?: () => void;
  onAgentDocs?: () => void;
  onDemo?: () => void;
}

export default function FoyerView({ onPartner, onQuickStart, onMyPage, onLogin, onAgentDocs, onDemo }: Props) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const [ready, setReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (imgRef.current) {
      const cx = (e.clientX / window.innerWidth - 0.5) * 6;
      const cy = (e.clientY / window.innerHeight - 0.5) * 6;
      imgRef.current.style.transform = `scale(1.06) translate(${cx}px, ${cy}px)`;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.06)';
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || 'Something went wrong.');
      }
    } catch {
      setError('Unable to reach the server.');
    } finally {
      setSubmitting(false);
    }
  }, [email, submitting]);

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: DARK }} />;
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
        backgroundColor: DARK,
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* Background image — dark, desaturated, with fog */}
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
          filter: 'brightness(0.35) saturate(0.4)',
          opacity: 0.7,
          transform: 'scale(1.06)',
          animation: 'lobbyPhotoReveal 2s ease 0s both',
        }}
      />

      {/* Fog — radial vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, rgba(8,8,8,0.7) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Top edge fade */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '30%',
          background: `linear-gradient(to top, transparent, ${DARK})`,
          pointerEvents: 'none',
        }}
      />
      {/* Bottom edge fade */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: `linear-gradient(to bottom, transparent, ${DARK})`,
          pointerEvents: 'none',
        }}
      />

      {/* Top bar — LAVERN left, Sign In right */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '32px 40px',
          zIndex: 10,
          animation: 'lobbyFadeIn 0.8s ease 0.6s both',
        }}
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 18,
            fontWeight: 300,
            letterSpacing: 8,
            color: TEXT,
            textTransform: 'uppercase',
          }}
        >
          LAVERN
        </span>

        {isLoggedIn ? (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <TopLink onClick={onMyPage}>My Page</TopLink>
            <TopLink onClick={() => { userCtx!.logout(); }}>Logout</TopLink>
          </div>
        ) : (
          <TopLink onClick={onLogin ?? (() => {})}>Log In</TopLink>
        )}
      </div>

      {/* Center content */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
          padding: '80px 24px 24px',
        }}
      >
        {/* Tagline */}
        <p
          style={{
            fontFamily: SERIF,
            fontSize: 14,
            fontWeight: 300,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: TEXT,
            opacity: 0.3,
            marginBottom: 32,
            animation: 'lobbyFadeIn 0.8s ease 0.8s both',
          }}
        >
          The driverless law firm
        </p>

        {/* Watch Demo */}
        {onDemo && (
          <WatchDemoButton onClick={onDemo} />
        )}

        {/* Waitlist — for non-logged-in users */}
        {!isLoggedIn && (
          <div
            style={{
              marginTop: 56,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              maxWidth: 340,
              animation: 'lobbyFadeIn 0.8s ease 1.6s both',
            }}
          >
            {done ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: SERIF,
                  fontSize: 16,
                  fontStyle: 'italic',
                  color: ACCENT,
                  letterSpacing: 0.5,
                }}
              >
                You{'\u2019'}re on the list.
              </p>
            ) : (
              <>
                <p
                  style={{
                    margin: '0 0 16px',
                    fontFamily: SERIF,
                    fontSize: 14,
                    fontStyle: 'italic',
                    color: TEXT,
                    opacity: 0.35,
                    letterSpacing: 0.5,
                  }}
                >
                  Get notified when we open.
                </p>

                <form
                  onSubmit={handleSubmit}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    width: '100%',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 100,
                    overflow: 'hidden',
                  }}
                >
                  <label htmlFor="foyer-waitlist-email" className="sr-only">Email address</label>
                  <input
                    id="foyer-waitlist-email"
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '14px 24px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontFamily: SANS,
                      fontSize: 13,
                      color: TEXT,
                      letterSpacing: 0.3,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      flexShrink: 0,
                      padding: '14px 24px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderLeft: '1px solid rgba(255,255,255,0.06)',
                      fontFamily: SANS,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 3,
                      textTransform: 'uppercase',
                      color: TEXT,
                      opacity: submitting ? 0.2 : 0.4,
                      cursor: 'pointer',
                      transition: 'opacity 0.3s ease',
                    }}
                  >
                    {submitting ? '\u2026' : 'Join'}
                  </button>
                </form>

                {error && (
                  <p
                    style={{
                      margin: '10px 0 0',
                      fontFamily: SANS,
                      fontSize: 11,
                      color: ACCENT,
                      opacity: 0.7,
                    }}
                  >
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Logged-in users — entry buttons */}
        {isLoggedIn && (
          <div
            style={{
              marginTop: 56,
              display: 'flex',
              gap: 16,
              animation: 'lobbyFadeIn 0.8s ease 1.4s both',
            }}
          >
            <EntryButton onClick={onPartner} primary>Speak to a Partner</EntryButton>
            <EntryButton onClick={onQuickStart}>Step In</EntryButton>
          </div>
        )}
      </div>

      {/* Bottom — cities */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 10,
          animation: 'lobbyFadeIn 0.8s ease 2s both',
        }}
      >
        <CityLink>Helsinki</CityLink>
        <span style={{ fontFamily: SANS, fontSize: 9, color: MUTED, opacity: 0.3, margin: '0 8px' }}>&middot;</span>
        <CityLink>Paris</CityLink>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function CityLink({ children }: { children: string }) {
  const [hovered, setHovered] = useState(false);
  const city = children.toLowerCase();
  return (
    <a
      href={`mailto:${city}@lavern.ai`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: SANS,
        fontSize: 9,
        fontWeight: 400,
        letterSpacing: 3,
        textTransform: 'uppercase',
        textDecoration: 'none',
        color: hovered ? TEXT : MUTED,
        opacity: hovered ? 0.9 : 0.5,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      }}
    >
      {children}
    </a>
  );
}

function TopLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: SERIF,
        fontSize: 14,
        fontWeight: 300,
        fontStyle: 'italic',
        cursor: 'pointer',
        border: 'none',
        backgroundColor: 'transparent',
        color: TEXT,
        opacity: hovered ? 0.8 : 0.45,
        transition: 'opacity 0.4s ease',
        padding: '4px 0',
        letterSpacing: 0,
      }}
    >
      {children}
    </button>
  );
}

function WatchDemoButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: SERIF,
        fontSize: 22,
        fontWeight: 300,
        fontStyle: 'italic',
        cursor: 'pointer',
        border: 'none',
        backgroundColor: 'transparent',
        color: TEXT,
        opacity: hovered ? 0.9 : 0.6,
        transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
        padding: '16px 0',
        letterSpacing: 1,
        textDecoration: hovered ? 'underline' : 'none',
        textUnderlineOffset: 8,
        animation: 'lobbyFadeUp 1s ease 1s both',
      }}
    >
      Watch the demo.
    </button>
  );
}

function EntryButton({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: SANS,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 100,
        padding: '16px 40px',
        transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        backgroundColor: primary ? '#000' : 'transparent',
        color: TEXT,
        boxShadow: primary
          ? (hovered ? '0 16px 48px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.3)')
          : 'none',
        opacity: primary ? 1 : (hovered ? 0.8 : 0.5),
      }}
    >
      {children}
    </button>
  );
}
