/**
 * FoyerView — The Lavern door.
 *
 * Matches lavern.ai exactly: dark marble, grain, serif headline,
 * one "Talk is cheap" button → sequential demo.
 * Logged-in users get entry buttons instead.
 */

import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { UserContext } from '../auth/UserContext.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

const DARK = '#080808';
const TEXT = '#FAF9F6';
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

export default function FoyerView({ onPartner, onQuickStart, onMyPage, onLogin, onDemo }: Props) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const isMobile = useMediaQuery('mobile');
  const [ready, setReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (imgRef.current) {
      const cx = (e.clientX / window.innerWidth - 0.5) * 8;
      const cy = (e.clientY / window.innerHeight - 0.5) * 8;
      imgRef.current.style.transform = `scale(1.08) translate(${cx}px, ${cy}px)`;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (imgRef.current) imgRef.current.style.transform = 'scale(1.08)';
  }, []);

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: DARK }} />;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        zIndex: 9999,
        backgroundColor: DARK,
      }}
      onMouseMove={isMobile ? undefined : onMouseMove}
      onMouseLeave={isMobile ? undefined : onMouseLeave}
    >
      {/* Background — dark marble, subtle parallax */}
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
          transition: 'transform 0.4s ease-out',
          filter: 'brightness(0.28) saturate(0.3)',
          transform: 'scale(1.08)',
          animation: 'foyerReveal 2.5s ease 0s both',
        }}
      />

      {/* Top vignette */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '35%',
        background: `linear-gradient(to top, transparent, ${DARK})`,
        pointerEvents: 'none',
      }} />

      {/* Bottom vignette */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
        background: `linear-gradient(to bottom, transparent 0%, ${DARK} 85%)`,
        pointerEvents: 'none',
      }} />

      {/* Side fog */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: '20%',
        background: `linear-gradient(to right, rgba(8,8,8,0.6), transparent)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '20%',
        background: `linear-gradient(to left, rgba(8,8,8,0.6), transparent)`,
        pointerEvents: 'none',
      }} />

      {/* LAVERN — top left */}
      <div style={{
        position: 'absolute', top: isMobile ? 28 : 36, left: isMobile ? 28 : 44,
        zIndex: 10,
        fontFamily: SERIF, fontSize: isMobile ? 14 : 18, fontWeight: 300,
        letterSpacing: 8, color: TEXT, mixBlendMode: 'difference' as const,
        animation: 'foyerFade 0.8s ease 0.4s both',
      }}>
        LAVERN
      </div>

      {/* Log In — top right */}
      <div style={{
        position: 'absolute', top: isMobile ? 28 : 36, right: isMobile ? 28 : 44,
        zIndex: 10,
        animation: 'foyerFade 0.8s ease 0.6s both',
      }}>
        {isLoggedIn ? (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <NavLink onClick={onMyPage}>My Page</NavLink>
            <NavLink onClick={() => userCtx!.logout()}>Logout</NavLink>
          </div>
        ) : (
          <NavLink onClick={onLogin ?? (() => {})}>Log In</NavLink>
        )}
      </div>

      {/* Center — headline + CTA */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 5, padding: '80px 24px 24px', textAlign: 'center',
      }}>
        {/* Headline */}
        <h1 style={{
          fontFamily: SERIF,
          fontSize: isMobile ? 'clamp(52px, 14vw, 80px)' : 'clamp(72px, 11vw, 140px)',
          fontWeight: 300,
          lineHeight: 0.95,
          letterSpacing: -2,
          color: TEXT,
          margin: 0,
          marginBottom: 56,
          textShadow: '0 4px 80px rgba(0,0,0,0.6)',
          animation: 'foyerReveal 1.4s cubic-bezier(0.22,1,0.36,1) 0.7s both',
        }}>
          Excellence<br />
          doesn&rsquo;t scale.<br />
          <em style={{ fontStyle: 'italic' }}>Until now.</em>
        </h1>

        {/* CTA */}
        {isLoggedIn ? (
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center',
            animation: 'foyerFade 0.8s ease 1.6s both',
          }}>
            <PrimaryButton onClick={onPartner}>Speak to a Partner</PrimaryButton>
            <GhostButton onClick={onQuickStart}>Step In</GhostButton>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            animation: 'foyerFade 0.8s ease 1.4s both',
          }}>
            <PrimaryButton onClick={onDemo ?? (() => {})}>Talk is cheap.</PrimaryButton>
          </div>
        )}
      </div>

      {/* Helsinki · Paris */}
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 10,
        zIndex: 10,
        animation: 'foyerFade 0.8s ease 2.2s both',
      }}>
        <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 3, textTransform: 'uppercase' as const, color: TEXT, opacity: 0.18 }}>Helsinki</span>
        <span style={{ fontFamily: SANS, fontSize: 9, color: TEXT, opacity: 0.12 }}>&middot;</span>
        <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 3, textTransform: 'uppercase' as const, color: TEXT, opacity: 0.18 }}>Paris</span>
      </div>

      <style>{`
        @keyframes foyerReveal {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes foyerFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .foyer-primary-btn:hover {
          box-shadow: 0 8px 40px rgba(0,0,0,0.5) !important;
        }
      `}</style>
    </div>
  );
}

function NavLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: SERIF, fontSize: 14, fontWeight: 300, fontStyle: 'italic',
        cursor: 'pointer', border: 'none', backgroundColor: 'transparent',
        color: TEXT, opacity: hovered ? 0.8 : 0.45,
        transition: 'opacity 0.4s ease', padding: '4px 0',
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="foyer-primary-btn"
      style={{
        fontFamily: SANS, fontSize: 11, fontWeight: 600,
        letterSpacing: 3, textTransform: 'uppercase' as const,
        cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 100, padding: '20px 56px',
        backgroundColor: '#000', color: TEXT,
        boxShadow: '0 4px 30px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.5s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: SANS, fontSize: 11, fontWeight: 600,
        letterSpacing: 3, textTransform: 'uppercase' as const,
        cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 100, padding: '20px 40px',
        backgroundColor: 'transparent', color: TEXT,
        opacity: hovered ? 0.8 : 0.5,
        transition: 'all 0.4s ease',
      }}
    >
      {children}
    </button>
  );
}
