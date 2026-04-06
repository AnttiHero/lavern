/**
 * DemoTourView — Cinematic tech demo. ~60-90 seconds.
 *
 * Slides:
 *   0. Intro / explainer       (NEW — what, how, cost)
 *   1. Choose the case         (interactive — click to pick)
 *   2. Talk to a partner       (auto-playing conversation)
 *   3. Voice mode              (spacebar → talk to agents)
 *   4. Assemble your team      (high-fidelity team grid)
 *   5. Craft your own agents   (agent builder recreation)
 *   6. Clawern reveal          (cinematic — wild)
 *   7. Pricing                 (NEW — what does it cost)
 *
 * Between slides 5 and 6:
 *   → real WorkingView (demo session set via onLaunchDemo)
 *   → real DeliveryView (auto-advances and sets shem-demo-resume=clawern)
 *   → DemoTourView resumes at slide 6 (Clawern)
 *
 * Total auto-advance: ~41s. Total with clicks: ~60-90s.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { CardRevealOverlay } from '../agent-builder/components/CardRevealOverlay.js';
import type { AgentProfile } from '../types/agent-profile.js';

// ── DiceBear avatar URL ────────────────────────────────────────────────────
function av(seed: string, size = 80): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&size=${size}`;
}

// ── Design tokens ──────────────────────────────────────────────────────────
const BG     = '#080808';
const CREAM  = '#FAF9F6';
const WHITE  = '#FFFFFF';
const BORDER = '#E5E3DD';
const TEXT   = '#1A1A1A';
const MUTED  = '#6B6B67';
const ACCENT = '#C45D3E';
const SERIF  = "'Cormorant Garamond', Georgia, serif";
const SANS   = "'Inter', -apple-system, sans-serif";
const MONO   = "'SF Mono', 'Fira Code', Menlo, monospace";

// Category colours (matches real app tokens)
const CAT: Record<string, string> = {
  orchestrator: '#C45D3E',
  lawyer:       '#2E7D9C',
  specialist:   '#7B5EA7',
};

// ── Pill button shared styles ─────────────────────────────────────────────
const PILL_STYLE = {
  fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 3,
  textTransform: 'uppercase' as const, borderRadius: 100, border: 'none', cursor: 'pointer',
  background: `linear-gradient(170deg, #FFFEF9 0%, #EDE9DF 100%)`,
  color: BG,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.4), 0 8px 32px rgba(250,249,246,.2)',
  transition: 'transform .22s ease, box-shadow .22s ease',
};
const PILL_GHOST_STYLE = {
  fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 3,
  textTransform: 'uppercase' as const, borderRadius: 100, cursor: 'pointer',
  background: 'transparent', color: CREAM,
  border: '1.5px solid rgba(250,249,246,.28)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
  transition: 'transform .22s ease, background .22s ease, border-color .22s ease',
};
function pillEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
  e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.4), 0 16px 48px rgba(250,249,246,.28)';
}
function pillLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = '';
  e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.4), 0 8px 32px rgba(250,249,246,.2)';
}
function ghostEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = 'translateY(-1px)';
  e.currentTarget.style.backgroundColor = 'rgba(250,249,246,.08)';
  e.currentTarget.style.borderColor = 'rgba(250,249,246,.5)';
}
function ghostLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = '';
  e.currentTarget.style.backgroundColor = 'transparent';
  e.currentTarget.style.borderColor = 'rgba(250,249,246,.28)';
}

// ── Slide durations (ms). 0 = wait for user interaction. ──────────────────
// 0=intro(CTA), 1=case(click), 2=partner(CTA), 3=voice(CTA), 4=team(CTA), 5=builder(CTA), 6=clawern(post-delivery), 7=pricing(CTA)
const DURATIONS = [0, 0, 0, 0, 0, 0, 0, 0];
const TOTAL = 8;

// ── Types ──────────────────────────────────────────────────────────────────
export type CaseId = 'heartconnect' | 'medivault' | 'cloudmsa';

interface Props {
  onExit:       () => void;
  onLaunchDemo: (caseId: CaseId) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function useMount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DemoTourView({ onExit, onLaunchDemo }: Props) {
  const isMobile = useMediaQuery('mobile');

  // Detect resume from delivery view (shem-demo-resume → skip to slide 6 = Clawern)
  const initialSlide = (() => {
    const resume = sessionStorage.getItem('shem-demo-resume');
    if (resume === 'clawern') {
      sessionStorage.removeItem('shem-demo-resume');
      return 6;
    }
    return 0;
  })();

  const [slide, setSlide]           = useState(initialSlide);
  const [visible, setVisible]       = useState(true);
  const [progKey, setProgKey]        = useState(0);
  const [selectedCase, setSelectedCase] = useState<CaseId>('heartconnect');
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancingRef = useRef(false);

  const advance = useCallback((fromInteraction = false) => {
    if (advancingRef.current) return;
    if (!fromInteraction && DURATIONS[slide] === 0) return; // wait for click
    advancingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    setVisible(false);
    setTimeout(() => {
      setSlide(prev => {
        const next = prev + 1;
        if (next >= TOTAL) {
          advancingRef.current = false;
          setVisible(true);
          return prev; // stay on last slide (Clawern)
        }
        // After slide 5 (builder) → launch real demo; slide 6 = Clawern shown post-delivery
        if (next === 6) {
          onLaunchDemo(selectedCase);
          advancingRef.current = false;
          setVisible(true);
          return prev; // stay; we're navigating away
        }
        return next;
      });
      setProgKey(k => k + 1);
      setVisible(true);
      advancingRef.current = false;
    }, 300);
  }, [slide, selectedCase, onLaunchDemo]);

  // Auto-advance timer
  useEffect(() => {
    const d = DURATIONS[slide];
    if (d === 0) return;
    timerRef.current = setTimeout(() => advance(), d);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [slide, advance]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowRight' || e.key === ' ') && slide !== 1 && slide < 7) {
        e.preventDefault();
        advance(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slide, advance]);

  const pickCase = (id: CaseId) => {
    setSelectedCase(id);
    setTimeout(() => advance(true), 200);
  };

  const goTo = (i: number) => {
    if (advancingRef.current || i === slide) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => { setSlide(i); setProgKey(k => k + 1); setVisible(true); }, 220);
  };

  return (
    <div id="demo-tour" style={{
      position: 'fixed', inset: 0, backgroundColor: BG,
      fontFamily: SANS, color: CREAM,
      overflow: 'hidden', zIndex: 9999,
    }}>
      {/* Top bar */}
      <TopBar isMobile={isMobile} slide={slide} onExit={onExit} />

      {/* Slide */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}>
        {slide === 0 && <SIntro isMobile={isMobile} onContinue={() => advance(true)} />}
        {slide === 1 && <S0Case isMobile={isMobile} selected={selectedCase} onPick={pickCase} onContinue={() => advance(true)} />}
        {slide === 2 && <S1Partner isMobile={isMobile} caseId={selectedCase} onContinue={() => advance(true)} />}
        {slide === 3 && <S2Voice isMobile={isMobile} caseId={selectedCase} onContinue={() => advance(true)} />}
        {slide === 4 && <S3Team isMobile={isMobile} caseId={selectedCase} onContinue={() => advance(true)} />}
        {slide === 5 && <S4Builder isMobile={isMobile} caseId={selectedCase} onLaunch={() => advance(true)} />}
        {slide === 6 && <S5Clawern isMobile={isMobile} caseId={selectedCase} onExit={onExit} onNext={() => advance(true)} />}
        {slide === 7 && <SPricing isMobile={isMobile} onExit={onExit} />}
      </div>

      {/* Dots + progress — only on slides 0-5 */}
      {slide < 6 && (
        <BottomBar slide={slide} total={6} goTo={goTo} progKey={progKey} duration={DURATIONS[slide]} isMobile={isMobile} />
      )}

      <style>{`
        @keyframes dUp  { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes dCard{ from { opacity:0; transform:scale(.93) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes dBar { from { width:0; } to { width:var(--w); } }
        @keyframes dProg{ from { width:0%; } to { width:100%; } }
        @keyframes dBubble{ from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dPulse{ 0%,100%{opacity:1;} 50%{opacity:.35;} }
        @keyframes dDot  { 0%,80%,100%{transform:scale(0);} 40%{transform:scale(1);} }

        @keyframes dFlip{ from{opacity:0;transform:rotateY(80deg) scale(.9);} to{opacity:1;transform:rotateY(0) scale(1);} }
        @keyframes dCrab{ 0%{transform:scale(1) rotate(-2deg);} 50%{transform:scale(1.06) rotate(2deg);} 100%{transform:scale(1) rotate(-2deg);} }
        @keyframes dTermLine{ from{opacity:0;transform:translateX(-8px);} to{opacity:1;transform:translateX(0);} }
        @keyframes dReveal{ from{opacity:0;transform:translateY(30px);letter-spacing:12px;} to{opacity:1;transform:translateY(0);letter-spacing:inherit;} }
      `}</style>
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────
function TopBar({ isMobile, slide, onExit }: { isMobile: boolean; slide: number; onExit: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: isMobile ? '20px 24px' : '26px 48px',
      background: (isMobile && slide === 0) ? 'none' : 'linear-gradient(to bottom, rgba(8,8,8,0.85) 0%, transparent 100%)',
    }}>
      <span style={{ fontFamily: SERIF, fontSize: isMobile ? 13 : 15, fontWeight: 300, letterSpacing: 7, color: isMobile && slide === 0 ? '#1A1A1A' : CREAM, opacity: 0.55 }}>
        LAVERN
      </span>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <button onClick={onExit} style={{
          fontFamily: SANS, fontSize: 10, fontWeight: 500, letterSpacing: 2.5, textTransform: 'uppercase',
          color: (isMobile && slide === 0) ? '#1A1A1A' : CREAM, opacity: 0.25, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          transition: 'opacity .2s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.25')}
        >Exit</button>
      </div>
    </div>
  );
}

// ── BottomBar ─────────────────────────────────────────────────────────────
function BottomBar({ slide, total, goTo, progKey, duration, isMobile }: {
  slide: number; total: number; goTo: (i: number) => void;
  progKey: number; duration: number; isMobile: boolean;
}) {
  const isLight = isMobile && slide === 0;
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: isLight ? 'none' : 'linear-gradient(to top, rgba(8,8,8,0.8) 0%, transparent 100%)',
      paddingBottom: isMobile ? 16 : 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingBottom: 14 }}>
        {Array.from({ length: total }).map((_, i) => (
          <button key={i} onClick={() => goTo(i)} style={{
            width: i === slide ? 24 : 6, height: 6, borderRadius: 3, border: 'none', padding: 0,
            cursor: 'pointer',
            background: i === slide
              ? (isLight ? 'rgba(26,26,26,0.5)' : CREAM)
              : (isLight ? 'rgba(26,26,26,0.15)' : 'rgba(250,249,246,0.2)'),
            transition: 'all .3s ease',
          }} />
        ))}
      </div>
      {duration > 0 && (
        <div key={progKey} style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%', background: 'rgba(250,249,246,0.28)',
            animation: `dProg ${duration}ms linear forwards`,
          }} />
        </div>
      )}
    </div>
  );
}

// ── Shell — left narration + right mockup ─────────────────────────────────
function Shell({
  isMobile, headline, sub, children, footer, light,
}: {
  isMobile: boolean;
  headline: React.ReactNode;
  sub: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  light?: boolean;
}) {
  const headlineColor   = light ? TEXT : CREAM;
  const headlineShadow  = light ? 'none' : '0 2px 24px rgba(0,0,0,.9), 0 0 60px rgba(0,0,0,.5)';
  const subColor        = light ? 'rgba(26,26,26,.60)' : CREAM;
  const subOpacity      = light ? 1 : 0.88;
  const dividerColor    = light ? 'rgba(26,26,26,0.07)' : 'rgba(255,255,255,0.04)';
  const bgOverlay       = light ? CREAM : 'transparent';

  if (isMobile) {
    return (
      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        padding: '68px 22px 80px', gap: 0,
        background: bgOverlay,
      }}>
        <div style={{ marginBottom: 22, animation: 'dUp .5s ease .05s both' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(40px,10vw,56px)', fontWeight: 300, lineHeight: 1.02, letterSpacing: -1, color: headlineColor, margin: '0 0 14px', textShadow: headlineShadow }}>{headline}</h2>
          <p style={{ fontFamily: SANS, fontSize: 16, fontWeight: 500, color: subColor, opacity: subOpacity, margin: 0, lineHeight: 1.6, animation: 'dIn .5s ease .25s both' }}>{sub}</p>
          {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
        </div>
        <div style={{ animation: 'dUp .5s ease .4s both', flex: 1 }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: bgOverlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 64, padding: '0 60px', width: '100%', maxWidth: 1160 }}>
        {/* Left */}
        <div style={{
          flex: '0 0 340px',
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${dividerColor}`,
          paddingRight: 48,
          animation: 'dUp .5s ease .05s both',
        }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(44px,4.4vw,72px)', fontWeight: 300, lineHeight: 1.02, letterSpacing: -2, color: headlineColor, margin: '0 0 20px', textShadow: headlineShadow }}>{headline}</h2>
          <p style={{ fontFamily: SANS, fontSize: 16, fontWeight: 500, color: subColor, opacity: subOpacity, margin: 0, lineHeight: 1.6, animation: 'dIn .5s ease .2s both' }}>{sub}</p>
          {footer && <div style={{ marginTop: 24, animation: 'dIn .4s ease .35s both' }}>{footer}</div>}
        </div>
        {/* Right */}
        <div style={{ flex: '1 1 0', minWidth: 0, animation: 'dUp .5s ease .18s both' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Case-specific content ─────────────────────────────────────────────────
const CASE_CONTENT: Record<CaseId, {
  userMsg: string;
  partnerReply: string;
  memo: { sev: 'RED' | 'YELLOW'; text: string }[];
  voiceUser: string;
  voiceReply: string;
  teamTags: string[];
  deliverable: string;
}> = {
  heartconnect: {
    userMsg:      'HeartConnect — dating platform. Need Terms of Service reviewed before EU launch next month.',
    partnerReply: "I'm flagging two pressure points immediately: GDPR consent bundling in your sign-up flow, and age verification gaps under the Digital Services Act. Give me a moment.",
    memo: [
      { sev: 'RED',    text: 'GDPR Art. 7 — consent bundled with acceptance' },
      { sev: 'RED',    text: 'DSA Art. 28 — age verification gap' },
      { sev: 'YELLOW', text: 'Algorithmic transparency — Section 7' },
    ],
    voiceUser:  '"HeartConnect. Terms of Service review. EU launch in 30 days."',
    voiceReply: '"Terms of Service. Tight schedule. We are on it."',
    teamTags:   ['GDPR', 'DSA', 'Consumer ToS'],
    deliverable: 'Redesigned Terms of Service + compliance report',
  },
  medivault: {
    userMsg:      'MediVault — health data app. Privacy policy needs review before Series B investor due diligence next week.',
    partnerReply: "Two critical issues right away: HIPAA data handling gaps in your third-party sharing clause, and cross-border transfer restrictions under GDPR Article 46.",
    memo: [
      { sev: 'RED',    text: 'HIPAA §164.308 — third-party data handling' },
      { sev: 'RED',    text: 'GDPR Art. 46 — cross-border transfer gap' },
      { sev: 'YELLOW', text: 'Data retention — no deletion schedule defined' },
    ],
    voiceUser:  '"MediVault. Privacy policy. Series B due diligence next week."',
    voiceReply: '"Privacy policy. Investor deadline. We are on it."',
    teamTags:   ['HIPAA', 'GDPR', 'Privacy Policy'],
    deliverable: 'Revised Privacy Policy + investor-ready compliance summary',
  },
  cloudmsa: {
    userMsg:      'Cloud MSA — software services agreement. Unlimited liability clause needs attention before we sign on Friday.',
    partnerReply: "The unlimited liability clause is the immediate show-stopper. There's also an ambiguous indemnity provision in Section 12 that could expose you significantly.",
    memo: [
      { sev: 'RED',    text: 'Section 8 — unlimited liability, no cap defined' },
      { sev: 'RED',    text: 'Section 12 — indemnity scope ambiguous' },
      { sev: 'YELLOW', text: 'SLA termination rights — cure period unclear' },
    ],
    voiceUser:  '"Cloud MSA. Unlimited liability clause. Need to sign Friday."',
    voiceReply: '"Liability clause. Friday deadline. We are on it."',
    teamTags:   ['Liability', 'SLA', 'Indemnity'],
    deliverable: 'Redlined MSA + negotiation briefing',
  },
};

// ── Slide 0 — Choose the case ─────────────────────────────────────────────
const CASES = [
  { id: 'heartconnect' as CaseId, name: 'HeartConnect', desc: 'Dating platform Terms of Service — EU launch in 30 days', badge: 'Consumer ToS', tags: ['GDPR','Age verification','EU/US'], risk: 'HIGH' },
  { id: 'medivault'    as CaseId, name: 'MediVault',    desc: 'Health data privacy policy — Series B investor due diligence', badge: 'Privacy Policy', tags: ['HIPAA','GDPR','Cross-border'], risk: 'CRITICAL' },
  { id: 'cloudmsa'    as CaseId, name: 'Cloud MSA',    desc: 'Software services master agreement — unlimited liability clause', badge: 'Commercial Contract', tags: ['Liability','SLA','Indemnity'], risk: 'HIGH' },
];

// ── Slide 0 — Choose the case ─────────────────────────────────────────────
function S0Case({ isMobile, selected, onPick, onContinue: _onContinue }: {
  isMobile: boolean; selected: CaseId;
  onPick: (id: CaseId) => void; onContinue: () => void;
}) {
  const [hov, setHov] = useState<CaseId | null>(null);
  return (
    <Shell isMobile={isMobile} light
      headline={<>It actually<br />does <em style={{fontStyle:'italic'}}>stuff.</em></>}
      sub={<>A law firm on autopilot. 66 specialist agents, one billable hour at a time. Except our billable hours cost 1000x less than in a human law firm.<br /><br />Pick a case.</>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CASES.map((c, i) => {
          const sel = selected === c.id;
          const h = hov === c.id;
          return (
            <div key={c.id} role="button" tabIndex={0}
              onClick={() => onPick(c.id)}
              onKeyDown={e => e.key === 'Enter' && onPick(c.id)}
              onMouseEnter={() => setHov(c.id)} onMouseLeave={() => setHov(null)}
              style={{
                background: WHITE,
                border: `1.5px solid ${sel ? TEXT : h ? '#C5C3BD' : BORDER}`,
                borderRadius: 10, padding: '15px 18px', cursor: 'pointer',
                transition: 'all .2s ease',
                boxShadow: sel
                  ? '0 24px 64px rgba(0,0,0,.28), 0 8px 24px rgba(0,0,0,.14)'
                  : h
                  ? '0 12px 32px rgba(0,0,0,.14), 0 3px 10px rgba(0,0,0,.08)'
                  : '0 1px 3px rgba(0,0,0,.06)',
                transform: sel ? 'translateY(-3px)' : h ? 'translateY(-1px)' : 'none',
                animation: `dCard .4s ease ${.35 + i * .09}s both`,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: TEXT }}>{c.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                  {sel && <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: TEXT, fontWeight: 700 }}>SELECTED ✓</span>}
                  <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, background: '#F5F4F0', border: `1px solid ${BORDER}`, color: MUTED }}>{c.badge}</span>
                </div>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 12, color: MUTED, margin: '0 0 10px', lineHeight: 1.5 }}>{c.desc}</p>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {c.tags.map(t => (
                  <span key={t} style={{ fontFamily: SANS, fontSize: 9, letterSpacing: .5, padding: '2px 7px', background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 3, color: MUTED }}>{t}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

// ── Slide 1 — Talk to a partner ───────────────────────────────────────────
function S1Partner({ isMobile, caseId, onContinue }: { isMobile: boolean; caseId: CaseId; onContinue: () => void }) {
  const c = CASE_CONTENT[caseId];
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3200),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <Shell isMobile={isMobile}
      headline={<>Talk to<br />a <em style={{fontStyle:'italic'}}>partner.</em></>}
      sub={<>Lavern listens, asks the right questions, and assembles the team.<br /><br />Agents grounding the answers and tirelessly checking the quality.</>}
      footer={phase >= 4 ? (
        <button
          onClick={(e) => { e.stopPropagation(); onContinue(); }}
          style={{ ...PILL_STYLE, padding: '17px 48px', animation: 'dUp .4s ease both' }}
          onMouseEnter={pillEnter}
          onMouseLeave={pillLeave}
        >
          Voice mode →
        </button>
      ) : undefined}
    >
      <div style={{ background: WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden', boxShadow: '0 4px 28px rgba(0,0,0,.07)' }}>
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, background: '#FAF9F6', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(196,93,62,.07)', border: '1.5px solid rgba(196,93,62,.2)' }}>
            <img src={av('Catherine Blackwell', 60)} alt="Catherine Blackwell" width={36} height={36} style={{ display: 'block' }} />
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: TEXT }}>Catherine Blackwell</div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: MUTED }}>Managing Partner</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center', fontFamily: SANS, fontSize: 10, color: '#4A7C50' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A7C50', display: 'inline-block', animation: 'dPulse 2s ease infinite' }} />
            Available
          </div>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 220 }}>
          {phase >= 1 && (
            <ChatBubble align="right" text={c.userMsg} />
          )}
          {phase === 2 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(196,93,62,.07)', border: '1px solid rgba(196,93,62,.18)' }}>
                <img src={av('Catherine Blackwell', 40)} alt="CB" width={28} height={28} style={{ display: 'block' }} />
              </div>
              <div style={{ display: 'flex', gap: 4, padding: '10px 12px', background: CREAM, borderRadius: '12px 12px 12px 4px', border: `1px solid ${BORDER}` }}>
                {[0, 1, 2].map(j => <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: MUTED, animation: `dDot 1.2s ease ${j * .2}s infinite` }} />)}
              </div>
            </div>
          )}
          {phase >= 3 && (
            <ChatBubble align="left" avatar="Catherine Blackwell" text={c.partnerReply} />
          )}
          {phase >= 4 && (
            <div style={{ animation: 'dBubble .3s ease both' }}>
              <div style={{ background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 10, fontWeight: 600 }}>Briefing memo · {c.memo.length} issues flagged</div>
                {c.memo.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, padding: '6px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none', animation: `dIn .3s ease ${i * .12}s both` }}>
                    <span style={{ fontFamily: SANS, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, color: item.sev === 'RED' ? ACCENT : '#B8860B', flexShrink: 0, marginTop: 2 }}>{item.sev}</span>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function ChatBubble({ align, avatar, text }: { align: 'left' | 'right'; avatar?: string; text: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: align === 'left' ? 'row' : 'row-reverse',
      gap: 8, alignItems: 'flex-end',
      animation: 'dBubble .3s ease both',
    }}>
      {avatar && (
        <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(196,93,62,.07)', border: '1px solid rgba(196,93,62,.18)' }}>
          <img src={av(avatar, 40)} alt={avatar} width={28} height={28} style={{ display: 'block' }} />
        </div>
      )}
      <div style={{
        maxWidth: '82%',
        background: align === 'right' ? TEXT : CREAM,
        color: align === 'right' ? CREAM : TEXT,
        borderRadius: align === 'right' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '10px 13px',
        fontFamily: SANS, fontSize: 12, lineHeight: 1.55,
        border: align === 'left' ? `1px solid ${BORDER}` : 'none',
      }}>{text}</div>
    </div>
  );
}

// ── Slide 2 — Voice mode ──────────────────────────────────────────────────
function S2Voice({ isMobile, caseId, onContinue }: { isMobile: boolean; caseId: CaseId; onContinue: () => void }) {
  const c = CASE_CONTENT[caseId];
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 800),   // user starts speaking
      setTimeout(() => setPhase(2), 2200),  // words appear
      setTimeout(() => setPhase(3), 4200),  // Lavern responds
      setTimeout(() => setPhase(4), 6200),  // response words appear
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  const BARS = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.9, 0.65, 0.75, 0.45, 0.8, 0.55];

  return (
    <Shell isMobile={isMobile}
      headline={<>Lavern<br /><em style={{fontStyle:'italic'}}>listens.</em></>}
      sub="Just talk to the agents. Plain language. No forms. Just say what you need."
      footer={phase >= 4 ? (
        <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
          style={{ ...PILL_STYLE, padding: '17px 48px', animation: 'dUp .4s ease both' }}
          onMouseEnter={pillEnter}
          onMouseLeave={pillLeave}
        >Meet the team</button>
      ) : undefined}
    >
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Mic + Avatar row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 28 : 40,
        marginBottom: 20,
        animation: 'dUp .5s ease .05s both',
      }}>
        {/* Big microphone */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Pulse rings on mic when active */}
          {phase >= 1 && phase < 4 && [1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute',
              width: 96 + i * 32, height: 96 + i * 32,
              borderRadius: '50%',
              border: `1px solid rgba(250,249,246,${0.1 - i * 0.03})`,
              animation: `dPulse ${1.4 + i * 0.3}s ease ${i * 0.2}s infinite`,
              pointerEvents: 'none',
            }} />
          ))}
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: phase >= 1 && phase < 4 ? 'rgba(250,249,246,.1)' : 'rgba(250,249,246,.04)',
            border: `1.5px solid rgba(250,249,246,${phase >= 1 ? '.22' : '.1'})`,
            boxShadow: phase >= 1 && phase < 4 ? '0 0 60px rgba(250,249,246,.14)' : 'none',
            transition: 'all .6s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="34" height="48" viewBox="0 0 34 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="9" y="2" width="16" height="26" rx="8"
                stroke={`rgba(250,249,246,${phase >= 1 ? '0.9' : '0.45'})`}
                strokeWidth="2"
                fill={phase >= 1 && phase < 4 ? 'rgba(250,249,246,0.08)' : 'none'}
                style={{ transition: 'all .5s ease' }}
              />
              <path d="M3 22 Q3 36 17 36 Q31 36 31 22"
                stroke={`rgba(250,249,246,${phase >= 1 ? '0.7' : '0.3'})`}
                strokeWidth="2" fill="none" strokeLinecap="round"
                style={{ transition: 'all .5s ease' }}
              />
              <line x1="17" y1="36" x2="17" y2="44"
                stroke={`rgba(250,249,246,${phase >= 1 ? '0.7' : '0.3'})`}
                strokeWidth="2" strokeLinecap="round"
                style={{ transition: 'all .5s ease' }}
              />
              <line x1="10" y1="44" x2="24" y2="44"
                stroke={`rgba(250,249,246,${phase >= 1 ? '0.7' : '0.3'})`}
                strokeWidth="2" strokeLinecap="round"
                style={{ transition: 'all .5s ease' }}
              />
            </svg>
          </div>
        </div>

        {/* Avatar */}
        <div style={{ position: 'relative' }}>
          {phase >= 1 && phase < 4 && [1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: -i * 14,
              borderRadius: '50%',
              border: '1px solid rgba(250,249,246,.1)',
              animation: `dPulse ${1.5 + i * 0.3}s ease ${i * 0.25}s infinite`,
            }} />
          ))}
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            overflow: 'hidden', background: 'rgba(250,249,246,.06)',
            border: '1.5px solid rgba(250,249,246,.14)',
            boxShadow: phase >= 1 ? '0 0 40px rgba(250,249,246,.08)' : 'none',
            transition: 'box-shadow .5s ease',
          }}>
            <img src={av('Catherine Blackwell', 120)} alt="Catherine Blackwell" width={96} height={96} style={{ display: 'block' }} />
          </div>
        </div>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: CREAM, letterSpacing: 1, marginBottom: 4, animation: 'dUp .5s ease .15s both' }}>
        Catherine Blackwell
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: 'rgba(250,249,246,.35)', letterSpacing: .5, marginBottom: 32, animation: 'dUp .5s ease .2s both' }}>
        Managing Partner
      </div>

      {/* Waveform */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3, height: 36, marginBottom: 28,
        animation: 'dIn .4s ease .3s both',
      }}>
        {BARS.map((h, i) => (
          <div key={i} style={{
            width: 3, borderRadius: 2,
            background: phase >= 1 && phase < 4 ? 'rgba(250,249,246,.7)' : 'rgba(250,249,246,.18)',
            height: phase >= 1 && phase < 4 ? `${h * 32}px` : '4px',
            transition: 'height .3s ease, background .3s ease',
            animation: phase >= 1 && phase < 4 ? `dPulse ${0.8 + (i % 4) * 0.15}s ease ${i * 0.06}s infinite` : 'none',
          }} />
        ))}
      </div>

      {/* Transcript lines */}
      <div style={{
        textAlign: 'center', maxWidth: 460,
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 80,
      }}>
        {phase >= 2 && (
          <div style={{ animation: 'dBubble .4s ease both' }}>
            <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(250,249,246,.65)', marginBottom: 8 }}>You</div>
            <p style={{ fontFamily: SERIF, fontSize: isMobile ? 17 : 20, fontWeight: 300, color: CREAM, lineHeight: 1.4, margin: 0 }}>
              {c.voiceUser}
            </p>
          </div>
        )}
        {phase >= 4 && (
          <div style={{ animation: 'dBubble .4s ease both', marginTop: 16 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(250,249,246,.65)', marginBottom: 8 }}>Lavern</div>
            <p style={{ fontFamily: SERIF, fontSize: isMobile ? 17 : 20, fontWeight: 300, color: 'rgba(250,249,246,.75)', fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>
              {c.voiceReply}
            </p>
          </div>
        )}
        {phase < 2 && (
          <div style={{ animation: 'dPulse 2s ease infinite' }}>
            <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(250,249,246,.25)' }}>Listening</div>
          </div>
        )}
      </div>
    </div>
    </Shell>
  );
}

// ── Slide 3 — Assemble your team ──────────────────────────────────────────
const TEAM = [
  { ini: 'CB', name: 'Catherine Blackwell',  role: 'Managing Partner',     ovr: 96, cat: 'orchestrator', rec: true,
    skills: [{ l: 'Leadership', v: 96 }, { l: 'Strategy', v: 93 }] },
  { ini: 'SR', name: 'Sofia Reyes',           role: 'Privacy Counsel',      ovr: 91, cat: 'lawyer',       rec: false,
    skills: [{ l: 'Precision', v: 91 }, { l: 'Research', v: 89 }] },
  { ini: 'MW', name: 'Marcus Webb',            role: 'Red Teamer',           ovr: 88, cat: 'specialist',   rec: false,
    skills: [{ l: 'Risk', v: 92 }, { l: 'Adversarial', v: 88 }] },
  { ini: 'JO', name: 'James Okafor',           role: 'Risk Pricer',          ovr: 87, cat: 'specialist',   rec: false,
    skills: [{ l: 'Risk', v: 94 }, { l: 'Precision', v: 84 }] },
  { ini: 'IH', name: 'Ingrid Hansen',          role: 'Regulatory Counsel',   ovr: 89, cat: 'lawyer',       rec: false,
    skills: [{ l: 'Research', v: 93 }, { l: 'Depth', v: 88 }] },
  { ini: 'DM', name: 'David Marsh',            role: 'Plain Language Spec.', ovr: 84, cat: 'specialist',   rec: false,
    skills: [{ l: 'Clarity', v: 95 }, { l: 'Creativity', v: 86 }] },
  { ini: 'KL', name: 'Kim Li',                 role: 'Junior Associate',     ovr: 78, cat: 'lawyer',       rec: false,
    skills: [{ l: 'Precision', v: 78 }, { l: 'Research', v: 80 }] },
  { ini: 'PT', name: 'Patrick Torres',         role: 'IP Specialist',        ovr: 82, cat: 'specialist',   rec: false,
    skills: [{ l: 'Research', v: 85 }, { l: 'Precision', v: 81 }] },
  { ini: 'EV', name: 'Elara Voss',             role: 'Contract Reviewer',    ovr: 85, cat: 'lawyer',       rec: false,
    skills: [{ l: 'Precision', v: 88 }, { l: 'Depth', v: 84 }] },
];

const INFRA = [
  { ini: 'QG', name: 'Quality Gate',    role: 'Evaluator',         ovr: 95, cat: 'orchestrator', rec: false, skills: [] as {l:string;v:number}[] },
  { ini: 'SC', name: 'Score Keeper',    role: 'Scoring Engine',    ovr: 90, cat: 'orchestrator', rec: false, skills: [] as {l:string;v:number}[] },
  { ini: 'VF', name: 'Vera Fontaine',   role: 'Verifier',          ovr: 88, cat: 'orchestrator', rec: false, skills: [] as {l:string;v:number}[] },
  { ini: 'AR', name: 'Assembly Robot',  role: 'Doc Assembler',     ovr: 86, cat: 'orchestrator', rec: false, skills: [] as {l:string;v:number}[] },
  { ini: 'RK', name: 'Risk Kernel',     role: 'Risk Pricing',      ovr: 89, cat: 'orchestrator', rec: false, skills: [] as {l:string;v:number}[] },
  { ini: 'MM', name: 'Memory Manager',  role: 'Precedent Board',   ovr: 84, cat: 'orchestrator', rec: false, skills: [] as {l:string;v:number}[] },
];

const ALL_AGENTS = [...TEAM, ...INFRA];

// Precompute avatar URLs for team members
const TEAM_AVATAR: Record<string, string> = Object.fromEntries(
  ALL_AGENTS.map(a => [a.ini, av(a.name, 80)])
);

const TAB_AGENTS: Record<string, typeof TEAM> = {
  'Lawyers':         TEAM.filter(a => a.cat === 'lawyer'),
  'Specialists':     TEAM.filter(a => a.cat === 'specialist'),
  'Infrastructure':  INFRA,
};

function S3Team({ isMobile, caseId, onContinue }: { isMobile: boolean; caseId: CaseId; onContinue: () => void }) {
  const c = CASE_CONTENT[caseId];
  const mounted = useMount();
  const [showCTA, setShowCTA] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowCTA(true), 2800); // after last card enters
    return () => clearTimeout(t);
  }, []);

  return (
    <Shell isMobile={isMobile}
      headline={<>Assemble<br />your <em style={{fontStyle:'italic'}}>team.</em></>}
      sub={<>Partners, red teamers, privacy counsel, risk pricers, designers. Not only lawyers.<br /><br />66 specialists on the bench.</>}
      footer={showCTA ? (
        <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
          style={{ ...PILL_STYLE, padding: '17px 48px', animation: 'dUp .4s ease both' }}
          onMouseEnter={pillEnter}
          onMouseLeave={pillLeave}
        >Customise your agents →</button>
      ) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Agent grid — 6 core agents, 3×2. Cards clickable; 2 auto-flip to stats. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {TEAM.slice(0, 6).map((a, i) => (
            <AgentCard key={a.ini} agent={a} delay={.1 + i * .38} />
          ))}
        </div>

        {/* Team bench */}
        {mounted && (
          <div style={{
            padding: '10px 14px',
            background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'dIn .4s ease .95s both',
          }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {TEAM.slice(0, 6).map(a => (
                <div key={a.ini} style={{
                  width: 26, height: 26, borderRadius: '50%', overflow: 'hidden',
                  background: `${CAT[a.cat]}12`,
                  border: `1.5px solid ${CAT[a.cat]}28`,
                  flexShrink: 0,
                }}>
                  <img src={TEAM_AVATAR[a.ini]} alt={a.name} width={26} height={26} style={{ display: 'block' }} />
                </div>
              ))}
            </div>
            <span style={{ fontFamily: SANS, fontSize: 11, color: MUTED }}>
              6 selected · <span style={{ color: TEXT, fontWeight: 500 }}>$12.00</span> est.
            </span>
            <div style={{
              marginLeft: 'auto',
              fontFamily: SANS, fontSize: 10, fontWeight: 600,
              color: ACCENT,
            }}>Confirm →</div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function AgentCard({ agent, delay }: { agent: typeof TEAM[0]; delay: number }) {
  const col = CAT[agent.cat] ?? MUTED;
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setFlipped(f => !f); }}
      style={{
        perspective: 700,
        cursor: 'pointer',
        userSelect: 'none',
        animation: `dCard .4s ease ${delay}s both`,
      }}
    >
      <div style={{
        position: 'relative',
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        height: 148,
      }}>
        {/* Face A — agent info (default visible) */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          borderRadius: 9,
          background: WHITE,
          border: `1px solid ${agent.rec ? ACCENT : BORDER}`,
          padding: '11px 11px 9px',
          boxShadow: agent.rec ? `0 0 0 2px rgba(196,93,62,.09)` : '0 1px 3px rgba(0,0,0,.04)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {agent.rec && (
            <div style={{ position: 'absolute', top: 7, right: 8, fontFamily: SANS, fontSize: 7, letterSpacing: 1, textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>★ REC</div>
          )}
          <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', background: `${col}10`, border: `1.5px solid ${col}25` }}>
            <img src={TEAM_AVATAR[agent.ini]} alt={agent.name} width={38} height={38} style={{ display: 'block' }} />
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: TEXT, lineHeight: 1.25, marginBottom: 2 }}>{agent.name}</div>
            <div style={{ fontFamily: SANS, fontSize: 9, color: MUTED }}>{agent.role}</div>
          </div>
          <div style={{ paddingTop: 7, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 'auto' }}>
            <span style={{ fontFamily: SANS, fontSize: 7.5, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>OVR</span>
            <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 300, color: TEXT, lineHeight: 1 }}>{agent.ovr}</span>
          </div>
        </div>

        {/* Face B — skill stats (revealed on click) */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 9,
          background: WHITE,
          border: `1px solid ${agent.rec ? ACCENT : BORDER}`,
          padding: '11px 11px 9px',
          boxShadow: agent.rec ? `0 0 0 2px rgba(196,93,62,.09)` : '0 1px 3px rgba(0,0,0,.04)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{agent.name.split(' ')[0]}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {agent.skills.map(s => (
              <div key={s.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: SANS, fontSize: 8.5, color: MUTED }}>{s.l}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, lineHeight: 1 }}>{s.v}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: '#F0EFEB', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: `linear-gradient(90deg, ${col}, ${col}80)`,
                    width: flipped ? `${s.v}%` : '0%',
                    transition: 'width .6s ease .15s',
                  }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 7, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: SANS, fontSize: 7.5, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>OVR</span>
            <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 300, color: TEXT, lineHeight: 1 }}>{agent.ovr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 3 — Craft your own agents ──────────────────────────────────────
const BUILDER_STEPS = ['Identity', 'Face', 'Stats'] as const;
type BuilderStep = typeof BUILDER_STEPS[number];

// ── Case-specific agent builder data ─────────────────────────────────────
const CASE_S4: Record<CaseId, {
  name: string;
  specialisation: string;
  archetype: string;
  workStyle: string;
  ovr: number;
  skills: { label: string; val: number; col: string }[];
  profile: AgentProfile;
}> = {
  heartconnect: {
    name: 'The Gatekeeper',
    specialisation: 'Consumer Privacy',
    archetype: 'The Gatekeeper',
    workStyle: 'Relentless on consent flows. Finds the gap regulators find first.',
    ovr: 92,
    skills: [
      { label: 'Precision',  val: 96, col: '#2E7D9C' },
      { label: 'Risk',       val: 94, col: ACCENT },
      { label: 'Depth',      val: 91, col: '#7B5EA7' },
      { label: 'Creativity', val: 65, col: '#B8860B' },
    ],
    profile: {
      role: 'privacy-counsel',
      displayName: 'The Gatekeeper',
      tagline: 'Relentless on consent flows. Finds the gap regulators find first.',
      category: 'lawyer',
      seniority: 'partner',
      costTier: 'sonnet',
      billingRateUsd: 360,
      skills: { precision: 96, creativity: 65, speed: 82, depth: 91, negotiation: 79, communication: 84, research: 93, risk: 94 },
      personality: {
        archetype: 'The Gatekeeper',
        traits: { 'conservative-vs-creative': 2, 'thorough-vs-fast': 2, 'risk-averse-vs-tolerant': 1, 'formal-vs-approachable': 3, 'adversarial-vs-collaborative': 4 },
        workStyle: 'Relentless on consent flows. Finds the gap regulators find first.',
      },
      practiceAreas: ['Consumer Privacy', 'GDPR Compliance'],
      strengths: ['Consent architecture', 'Regulatory gap analysis', 'DSA/GDPR overlap'],
      limitations: ['Less suited for commercial contract disputes'],
      optional: true,
      defaultSelected: false,
      avatarSeed: 'The Gatekeeper',
    },
  },
  medivault: {
    name: 'The Hawk',
    specialisation: 'Regulatory Compliance',
    archetype: 'The Hawk',
    workStyle: 'Calibrated to regulatory standards. No gap escapes the checklist.',
    ovr: 93,
    skills: [
      { label: 'Precision',  val: 98, col: '#2E7D9C' },
      { label: 'Depth',      val: 95, col: '#7B5EA7' },
      { label: 'Risk',       val: 91, col: ACCENT },
      { label: 'Creativity', val: 58, col: '#B8860B' },
    ],
    profile: {
      role: 'compliance-officer',
      displayName: 'The Hawk',
      tagline: 'Calibrated to regulatory standards. No gap escapes the checklist.',
      category: 'lawyer',
      seniority: 'partner',
      costTier: 'sonnet',
      billingRateUsd: 395,
      skills: { precision: 98, creativity: 58, speed: 78, depth: 95, negotiation: 72, communication: 80, research: 96, risk: 91 },
      personality: {
        archetype: 'The Hawk',
        traits: { 'conservative-vs-creative': 1, 'thorough-vs-fast': 1, 'risk-averse-vs-tolerant': 1, 'formal-vs-approachable': 2, 'adversarial-vs-collaborative': 4 },
        workStyle: 'Calibrated to regulatory standards. No gap escapes the checklist.',
      },
      practiceAreas: ['HIPAA Compliance', 'Cross-border Data Transfers'],
      strengths: ['HIPAA gap analysis', 'GDPR Art. 46 structuring', 'Investor due diligence readiness'],
      limitations: ['Less suited for creative drafting'],
      optional: true,
      defaultSelected: false,
      avatarSeed: 'The Hawk',
    },
  },
  cloudmsa: {
    name: 'The Surgeon',
    specialisation: 'Contract Review',
    archetype: 'The Surgeon',
    workStyle: 'Methodical. Cuts through ambiguity. Never skips a clause.',
    ovr: 94,
    skills: [
      { label: 'Precision',  val: 97, col: '#2E7D9C' },
      { label: 'Depth',      val: 93, col: '#7B5EA7' },
      { label: 'Creativity', val: 71, col: '#B8860B' },
      { label: 'Risk',       val: 88, col: ACCENT },
    ],
    profile: {
      role: 'contract-reviewer',
      displayName: 'The Surgeon',
      tagline: 'Methodical. Cuts through ambiguity. Never skips a clause.',
      category: 'lawyer',
      seniority: 'partner',
      costTier: 'sonnet',
      billingRateUsd: 380,
      skills: { precision: 94, creativity: 72, speed: 85, depth: 97, negotiation: 88, communication: 76, research: 91, risk: 93 },
      personality: {
        archetype: 'The Surgeon',
        traits: { 'conservative-vs-creative': 2, 'thorough-vs-fast': 2, 'risk-averse-vs-tolerant': 2, 'formal-vs-approachable': 3, 'adversarial-vs-collaborative': 4 },
        workStyle: 'Methodical. Cuts through ambiguity. Never skips a clause.',
      },
      practiceAreas: ['Contract Review', 'Risk Assessment'],
      strengths: ['Precision analysis', 'Risk identification', 'Clause-by-clause review'],
      limitations: ['Less suited for high-level strategy'],
      optional: true,
      defaultSelected: false,
      avatarSeed: 'The Surgeon',
    },
  },
};

function S4Builder({ isMobile, caseId, onLaunch }: { isMobile: boolean; caseId: CaseId; onLaunch: () => void }) {
  const agent = CASE_S4[caseId];
  const [animStep, setAnimStep] = useState(0);
  const [builderStep, setBuilderStep] = useState<BuilderStep>('Stats');
  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    setAnimStep(0);
    setBuilderStep('Stats');
    setShowReveal(false);
    const t = setTimeout(() => setAnimStep(1), 800);
    return () => clearTimeout(t);
  }, [caseId]);

  const forgeAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowReveal(true);
  };

  return (
    <>
    {showReveal && (
      <CardRevealOverlay
        profile={agent.profile}
        ovr={agent.ovr}
        costTier="sonnet"
        billingRate={agent.profile.billingRateUsd}
        onSave={onLaunch}
        onBuildAnother={() => setShowReveal(false)}
        onClose={() => setShowReveal(false)}
      />
    )}
    <Shell isMobile={isMobile}
      headline={<>Make it<br /><em style={{fontStyle:'italic'}}>yours.</em></>}
      sub="66 agents in the roster. Not enough? Forge your own. Set the rules. Make your own team of experts."
      footer={
        <button
          onClick={forgeAgent}
          style={{ ...PILL_STYLE, padding: '17px 48px' }}
          onMouseEnter={pillEnter}
          onMouseLeave={pillLeave}
        >
          Create your own agents
        </button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 180px', gap: 12 }}>
        {/* Stats editor */}
        <div style={{
          background: WHITE, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: '18px',
          boxShadow: '0 1px 4px rgba(0,0,0,.04)',
        }}>
          {/* Step tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#F5F4F0', borderRadius: 6, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {BUILDER_STEPS.map((s, i) => (
              <button key={s} onClick={(e) => { e.stopPropagation(); setBuilderStep(s); if (s === 'Stats') setAnimStep(1); }} style={{
                flex: 1, textAlign: 'center', padding: '6px 0',
                fontFamily: SANS, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
                fontWeight: builderStep === s ? 700 : 400,
                background: builderStep === s ? TEXT : 'transparent',
                color: builderStep === s ? CREAM : MUTED,
                borderRight: i < 2 ? `1px solid ${BORDER}` : 'none',
                border: 'none', cursor: 'pointer', transition: 'all .2s',
              }}>{s}</button>
            ))}
          </div>

          {/* Identity step */}
          {builderStep === 'Identity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'dUp .3s ease both' }}>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Agent Name</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT, background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px' }}>{agent.name}</div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Specialisation</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT, background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px' }}>{agent.specialisation}</div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Archetype</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['The Gatekeeper', 'The Surgeon', 'The Diplomat', 'The Hawk'].map(a => (
                    <div key={a} style={{
                      fontFamily: SANS, fontSize: 10, padding: '5px 10px',
                      borderRadius: 20, border: `1px solid ${a === agent.archetype ? ACCENT : BORDER}`,
                      background: a === agent.archetype ? 'rgba(196,93,62,.06)' : '#F5F4F0',
                      color: a === agent.archetype ? ACCENT : MUTED, cursor: 'pointer',
                    }}>{a}</div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Work Style</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: MUTED, background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px', lineHeight: 1.6 }}>
                  {agent.workStyle}
                </div>
              </div>
            </div>
          )}

          {/* Face step */}
          {builderStep === 'Face' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'dUp .3s ease both' }}>
              <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 2, fontWeight: 600 }}>Avatar</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'rgba(196,93,62,.07)', border: '2px solid rgba(196,93,62,.25)', flexShrink: 0 }}>
                  <img src={av(agent.name, 100)} alt={agent.name} width={72} height={72} style={{ display: 'block' }} />
                </div>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 16, color: TEXT, marginBottom: 3 }}>{agent.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: MUTED, marginBottom: 8 }}>Seed: {agent.name.toLowerCase().replace(/\s+/g, '-')}-v1</div>
                  <button style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', padding: '6px 14px', borderRadius: 20, background: '#F5F4F0', border: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer' }}>
                    ↻ Randomise
                  </button>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 8, fontWeight: 600 }}>Style picks</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Elara Voss', 'Sofia Reyes', 'Marcus Webb', 'James Okafor', 'The Surgeon'].map((seed, i) => (
                    <div key={seed} style={{
                      width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
                      border: `2px solid ${i === 4 ? ACCENT : BORDER}`,
                      opacity: i === 4 ? 1 : 0.6, cursor: 'pointer', flexShrink: 0,
                    }}>
                      <img src={av(seed, 50)} alt={seed} width={36} height={36} style={{ display: 'block' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stats step */}
          {builderStep === 'Stats' && (
            <>
              <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 14, fontWeight: 600 }}>Skill Ratings</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {agent.skills.map((s, i) => (
                  <div key={s.label} style={{ animation: `dUp .35s ease ${.4 + i * .08}s both` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT }}>{s.label}</span>
                      <span style={{ fontFamily: SERIF, fontSize: 16, color: TEXT, lineHeight: 1 }}>{s.val}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: '#F0EFEB', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: `linear-gradient(90deg, ${s.col} 0%, ${s.col}70 100%)`,
                        // @ts-ignore
                        '--w': `${s.val}%`,
                        animation: animStep >= 1 ? `dBar .9s ease ${.5 + i * .1}s both` : 'none',
                        width: animStep >= 1 ? `${s.val}%` : '0%',
                        transition: 'none',
                      } as React.CSSProperties} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Live card preview */}
        {!isMobile && (
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: '20px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            animation: 'dIn .6s ease .5s both',
          }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'rgba(196,93,62,.08)', border: '2px solid rgba(196,93,62,.3)' }}>
              <img src={av(agent.name, 100)} alt={agent.name} width={72} height={72} style={{ display: 'block' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 19, color: TEXT, fontWeight: 400, marginBottom: 3 }}>{agent.name}</div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>{agent.specialisation}</div>
            </div>
            <div style={{ width: '100%', paddingTop: 14, borderTop: `1px solid ${BORDER}`, textAlign: 'center' }}>
              <div style={{ fontFamily: SANS, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>OVR</div>
              <div style={{ fontFamily: SERIF, fontSize: 52, color: TEXT, lineHeight: 1, fontWeight: 300 }}>{agent.ovr}</div>
            </div>
          </div>
        )}
      </div>
    </Shell>
    </>
  );
}

// ── Slide 5 — Clawern Reveal ──────────────────────────────────────────────
const TERM_LINES: Record<CaseId, { delay: number; text: string; col: string }[]> = {
  heartconnect: [
    { delay: 400,  text: '⚙  Daemon started  ·  PID 42847  ·  11:02 PM', col: 'rgba(250,249,246,.55)' },
    { delay: 1100, text: '📁  Watching  ~/Documents/Contracts/', col: 'rgba(250,249,246,.55)' },
    { delay: 1900, text: '📄  heartconnect-tos-v3.pdf  ·  218 KB  ·  queued', col: 'rgba(250,249,246,.7)' },
    { delay: 2700, text: '🤖  Privacy Counsel, Red Teamer, Regulatory +2 dispatched', col: 'rgba(250,249,246,.55)' },
    { delay: 3800, text: '⚠️  RED  GDPR Art. 7 — consent bundled with ToS acceptance', col: '#FF6B6B' },
    { delay: 4600, text: '⚠️  RED  Age verification — self-certification insufficient', col: '#FF6B6B' },
    { delay: 5300, text: '⚖️  2 debates resolved  ·  avg confidence 0.94', col: '#74C0FC' },
    { delay: 6100, text: '✅  Delivered  ·  $4.20  ·  3 findings  ·  11:54 PM', col: '#69DB7C' },
    { delay: 7000, text: '📱  Telegram sent  →  "3 critical issues found in HeartConnect ToS"', col: 'rgba(250,249,246,.38)' },
    { delay: 7900, text: '💾  Precedent indexed  "GDPR Consent Bundling"', col: 'rgba(250,249,246,.28)' },
  ],
  medivault: [
    { delay: 400,  text: '⚙  Daemon started  ·  PID 38291  ·  11:14 PM', col: 'rgba(250,249,246,.55)' },
    { delay: 1100, text: '📁  Watching  ~/Documents/Legal/', col: 'rgba(250,249,246,.55)' },
    { delay: 1900, text: '📄  medivault-privacy-policy-v2.pdf  ·  94 KB  ·  queued', col: 'rgba(250,249,246,.7)' },
    { delay: 2700, text: '🤖  Privacy Counsel, Compliance Officer, HIPAA Specialist +3 dispatched', col: 'rgba(250,249,246,.55)' },
    { delay: 3800, text: '⚠️  RED  HIPAA §164.308 — third-party safeguard agreement missing', col: '#FF6B6B' },
    { delay: 4600, text: '⚠️  RED  GDPR cross-border transfers — SCC basis undocumented', col: '#FF6B6B' },
    { delay: 5300, text: '⚖️  2 debates resolved  ·  avg confidence 0.95', col: '#74C0FC' },
    { delay: 6100, text: '✅  Delivered  ·  $3.80  ·  4 findings  ·  12:01 AM', col: '#69DB7C' },
    { delay: 7000, text: '📱  Telegram sent  →  "HIPAA gap + GDPR transfer risk in MediVault"', col: 'rgba(250,249,246,.38)' },
    { delay: 7900, text: '💾  Precedent indexed  "HIPAA Third-Party Risk"', col: 'rgba(250,249,246,.28)' },
  ],
  cloudmsa: [
    { delay: 400,  text: '⚙  Daemon started  ·  PID 51204  ·  11:31 PM', col: 'rgba(250,249,246,.55)' },
    { delay: 1100, text: '📁  Watching  ~/Documents/Contracts/', col: 'rgba(250,249,246,.55)' },
    { delay: 1900, text: '📄  cloud-services-msa-draft.pdf  ·  312 KB  ·  queued', col: 'rgba(250,249,246,.7)' },
    { delay: 2700, text: '🤖  Contract Reviewer, Red Teamer, IP Counsel +1 dispatched', col: 'rgba(250,249,246,.55)' },
    { delay: 3800, text: '⚠️  RED  Unlimited liability — Section 8.2  (sign Friday — flag now)', col: '#FF6B6B' },
    { delay: 4600, text: '⚠️  YELLOW  Indemnity scope ambiguous — counterparty could read broadly', col: '#FEBC2E' },
    { delay: 5300, text: '⚖️  1 debate resolved  ·  confidence 0.91', col: '#74C0FC' },
    { delay: 6100, text: '✅  Delivered  ·  $3.40  ·  2 critical findings  ·  12:08 AM', col: '#69DB7C' },
    { delay: 7000, text: '📱  Telegram sent  →  "Unlimited liability in CloudMSA — do NOT sign yet"', col: 'rgba(250,249,246,.38)' },
    { delay: 7900, text: '💾  Precedent indexed  "Unlimited Indemnification"', col: 'rgba(250,249,246,.28)' },
  ],
};

const CLAW_BUDGET: Record<CaseId, { cost: string; hours: string; pct: string }> = {
  heartconnect: { cost: '$4.20', hours: '4.6h / 50h', pct: '9.2%' },
  medivault:    { cost: '$3.80', hours: '3.8h / 50h', pct: '7.6%' },
  cloudmsa:     { cost: '$3.40', hours: '3.4h / 50h', pct: '6.8%' },
};


function S5Clawern({ isMobile, caseId, onExit, onNext }: { isMobile: boolean; caseId: CaseId; onExit: () => void; onNext: () => void }) {
  const termLines = TERM_LINES[caseId];
  const budget = CLAW_BUDGET[caseId];
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [showSteps, setShowSteps] = useState(isMobile);
  const [showCTA, setShowCTA]     = useState(isMobile);
  const allLinesVisible = visibleLines.length >= termLines.length;

  useEffect(() => {
    setVisibleLines([]);
    setShowSteps(isMobile);
    setShowCTA(isMobile);
    const lastDelay = termLines[termLines.length - 1].delay;
    const ts    = termLines.map((l, i) => setTimeout(() => setVisibleLines(v => [...v, i]), l.delay));
    const sT    = setTimeout(() => setShowSteps(true), 500);
    const ctaT  = setTimeout(() => setShowCTA(true), lastDelay + 600);
    return () => [...ts, sT, ctaT].forEach(clearTimeout);
  }, [caseId]);

  const STEPS = [
    { n: '01', title: 'It lives on your computer.', body: 'Your law firm on your Mac Mini, always on. It does stuff for you, delivered to your folder.' },
    { n: '02', title: 'Heartbeat of 30 minutes.', body: 'The firm works while you sleep. You get a message if something interesting happens. Wake up to findings.' },
    { n: '03', title: 'Local models combined with the newest models.', body: 'Local models keep your data safe and make it possible to keep the AI always on. Combine with the newest models when you need more horsepower.' },
  ];

  const telegramMsg = caseId === 'heartconnect'
    ? '"3 critical issues in HeartConnect ToS — GDPR, age verification, transparency"'
    : caseId === 'medivault'
    ? '"HIPAA third-party gap + undocumented GDPR transfer basis in MediVault"'
    : '"Unlimited liability in CloudMSA Section 8.2 — do NOT sign until reviewed"';

  const terminalEl = (
    <div style={{
      background: 'rgba(0,0,0,.75)', border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 10, padding: '12px 16px',
      fontFamily: MONO, fontSize: 11,
      backdropFilter: 'blur(12px)',
    }}>
      {/* macOS dots */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        {['#FF5F57','#FEBC2E','#28C840'].map(col => (
          <div key={col} style={{ width: 9, height: 9, borderRadius: '50%', background: col, opacity: .75 }} />
        ))}
        <span style={{ marginLeft: 8, fontSize: 9, color: 'rgba(255,255,255,.2)', letterSpacing: 1 }}>lavern claw</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', fontFamily: SANS, fontSize: 9, color: '#69DB7C' }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#69DB7C', display: 'inline-block', animation: 'dPulse 1.5s ease infinite' }} />
          Running
        </div>
      </div>

      {/* Log lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: isMobile ? 72 : 100 }}>
        {termLines.map((l, i) =>
          visibleLines.includes(i) ? (
            <div key={i} style={{ color: l.col, animation: 'dTermLine .25s ease both', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: isMobile ? 10 : 11 }}>
              {l.text}
            </div>
          ) : null
        )}
        {/* Blinking cursor while lines are still coming */}
        {!allLinesVisible && visibleLines.length > 0 && (
          <div style={{ color: 'rgba(255,255,255,.45)', lineHeight: 1.5, fontSize: isMobile ? 10 : 11, animation: 'dPulse .9s ease infinite' }}>▋</div>
        )}
      </div>

      {/* Budget */}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: visibleLines.length >= 4 ? 1 : 0, transition: 'opacity .6s ease',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,.22)', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: SANS }}>Monthly budget</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 100, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.07)' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #69DB7C, #40C057)', width: visibleLines.length >= 8 ? budget.pct : '0%', transition: 'width 1s ease .3s' }} />
            </div>
            <span style={{ fontSize: 9, color: 'rgba(250,249,246,.35)', fontFamily: SANS }}>{budget.hours}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SERIF, fontSize: 18, color: '#69DB7C', lineHeight: 1 }}>{budget.cost}</div>
          <div style={{ fontFamily: SANS, fontSize: 8, color: 'rgba(250,249,246,.25)', letterSpacing: 1 }}>this document</div>
        </div>
      </div>

      {/* Telegram */}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        opacity: visibleLines.length >= 9 ? 1 : 0, transition: 'opacity .6s ease',
      }}>
        <span style={{ fontSize: 16 }}>📱</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, color: 'rgba(250,249,246,.45)', letterSpacing: 0.4, marginBottom: 3 }}>
            Telegram · {caseId === 'heartconnect' ? '11:54 PM' : caseId === 'medivault' ? '12:01 AM' : '12:08 AM'}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(250,249,246,.8)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {telegramMsg}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Mobile ─────────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ position: 'absolute', inset: 0, backgroundColor: '#050505' }}>
        {/* Mac Mini photo — top 40%, fades into dark */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', overflow: 'hidden', zIndex: 1 }}>
          <img src="/mac-mini-dark.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%', opacity: 0.75 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(5,5,5,0) 30%, #050505 100%)' }} />
        </div>

        {/* Content — sits below photo, no scroll needed */}
        <div style={{ position: 'absolute', top: '36%', left: 0, right: 0, bottom: 0, zIndex: 10, padding: '0 24px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(40px,11vw,56px)', fontWeight: 300, lineHeight: 0.95, letterSpacing: -1.5, color: CREAM, margin: '0 0 28px', animation: 'dReveal .8s ease .2s both' }}>
              While you <em style={{ fontStyle: 'italic' }}>sleep.</em>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: showSteps ? 1 : 0, transform: showSteps ? 'none' : 'translateY(10px)', transition: 'opacity .5s ease, transform .5s ease' }}>
              {STEPS.map(s => (
                <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(250,249,246,.38)', lineHeight: 1.8, flexShrink: 0, letterSpacing: 1 }}>{s.n}</span>
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: CREAM, lineHeight: 1.3, marginBottom: 3 }}>{s.title}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(250,249,246,.72)', lineHeight: 1.6 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={(e) => { if (!showCTA) return; e.stopPropagation(); onNext(); }}
            style={{ ...PILL_STYLE, padding: '18px 32px', opacity: showCTA ? 1 : 0.3, transition: 'opacity .6s ease', pointerEvents: showCTA ? 'auto' : 'none' }}
            onMouseEnter={showCTA ? pillEnter : undefined}
            onMouseLeave={showCTA ? pillLeave : undefined}
          >What does it cost? →</button>
        </div>
      </div>
    );
  }

  /* ── Desktop ─────────────────────────────────────────────────────── */
  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#050505', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* ── Hero photo — top 42% of screen ── */}
      <div style={{ position: 'relative', width: '100%', height: '42vh', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src="/mac-mini-dark.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%', opacity: 0.85 }}
        />
        {/* Fade out at bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top, #050505, transparent)' }} />
        {/* Headline overlaid bottom-left of photo */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 80px 32px', zIndex: 10 }}>
          <h2 style={{
            fontFamily: SERIF,
            fontSize: 'clamp(48px,5vw,72px)',
            fontWeight: 300, lineHeight: 0.95, letterSpacing: -2,
            color: CREAM, margin: 0,
            animation: 'dReveal .9s ease .1s both',
          }}>
            While you <em style={{ fontStyle: 'italic' }}>sleep.</em>
          </h2>
        </div>
      </div>

      {/* ── Content below photo ── */}
      <div style={{ padding: '40px 80px 80px', maxWidth: 1080, margin: '0 auto' }}>

        {/* Steps + terminal side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start' }}>

          {/* Steps */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 28,
            opacity: showSteps ? 1 : 0,
            transform: showSteps ? 'none' : 'translateY(14px)',
            transition: 'opacity .6s ease, transform .6s ease',
          }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{
                display: 'flex', gap: 20, alignItems: 'flex-start',
                animation: showSteps ? `dUp .5s ease ${i * 0.12 + 0.1}s both` : undefined,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(250,249,246,.38)', lineHeight: 1.8, flexShrink: 0, letterSpacing: 1 }}>{s.n}</span>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: CREAM, lineHeight: 1.3, marginBottom: 5 }}>{s.title}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: 'rgba(250,249,246,.72)', lineHeight: 1.7 }}>{s.body}</div>
                </div>
              </div>
            ))}

            {/* CTA — dims in immediately, activates when terminal done */}
            <div style={{ paddingTop: 12, maxWidth: 240 }}>
              <button
                onClick={(e) => { if (!showCTA) return; e.stopPropagation(); onNext(); }}
                style={{ ...PILL_STYLE, padding: '16px 32px', opacity: showCTA ? 1 : 0.3, transition: 'opacity .6s ease', pointerEvents: showCTA ? 'auto' : 'none' }}
                onMouseEnter={showCTA ? pillEnter : undefined}
                onMouseLeave={showCTA ? pillLeave : undefined}
              >What does it cost? →</button>
            </div>
          </div>

          {/* Terminal */}
          <div>{terminalEl}</div>

        </div>
      </div>
    </div>
  );
}

// ── Slide 0 — Intro ───────────────────────────────────────────────────────
const INTRO_AGENTS = [
  'Mae Chen', 'Tariq Osei', 'Noa Bergman', 'Sienna Walsh',
  'Leon Müller', 'Priya Nair', 'Kai Tanaka', 'Zara Okonkwo',
];

function SIntro({ isMobile, onContinue }: { isMobile: boolean; onContinue: () => void }) {
  const [showCTA, setShowCTA] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowCTA(true), 1000);
    return () => clearTimeout(t);
  }, []);

  const avatarCount = isMobile ? 6 : 8;
  const avatarSize  = isMobile ? 40 : 48;

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: isMobile ? '0 28px' : '0',
        maxWidth: isMobile ? '100%' : 680,
      }}>

        {/* Agent faces */}
        <div style={{ marginBottom: 40, animation: 'dIn .5s ease .05s both' }}>
          <div style={{ display: 'flex' }}>
            {INTRO_AGENTS.slice(0, avatarCount).map((seed, i) => (
              <img
                key={seed}
                src={av(seed, avatarSize * 2)}
                alt=""
                role="presentation"
                style={{
                  width: avatarSize, height: avatarSize,
                  borderRadius: '50%',
                  border: '2px solid rgba(8,8,8,1)',
                  marginLeft: i === 0 ? 0 : -(avatarSize * 0.28),
                  background: 'rgba(255,255,255,.06)',
                  filter: 'saturate(0.6) brightness(0.9)',
                  boxShadow: '0 2px 12px rgba(0,0,0,.6)',
                  opacity: 0,
                  animation: `dIn .4s ease ${i * 80}ms both`,
                }}
              />
            ))}
            <div style={{
              width: avatarSize, height: avatarSize, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,.08)',
              marginLeft: -(avatarSize * 0.28),
              background: 'rgba(255,255,255,.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SANS, fontSize: 9, color: 'rgba(250,249,246,.35)', letterSpacing: 0.5,
              opacity: 0,
              animation: `dIn .4s ease ${avatarCount * 80}ms both`,
            }}>+58</div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: SERIF,
          fontSize: isMobile ? 'clamp(36px,9vw,52px)' : 'clamp(52px,4.5vw,72px)',
          fontWeight: 300, lineHeight: 1.0, letterSpacing: -2,
          color: CREAM, margin: '0 0 24px',
          animation: 'dReveal .9s ease .3s both',
        }}>
          Software <em style={{ fontStyle: 'italic' }}>masquerading</em><br />as a law firm.
        </h1>

        {/* Sub */}
        <p style={{
          fontFamily: SANS, fontSize: isMobile ? 14 : 15,
          color: 'rgba(250,249,246,.72)', lineHeight: 1.8,
          margin: '0 0 36px', maxWidth: 480,
          animation: 'dIn .7s ease .5s both',
        }}>
          It is like your favorite law firm that works for you. Just this time, the specialists are agents. And the office is in a Mac Mini.<br /><br />
          Use it once, or let it run. It will work while you sleep. It is a law firm on autopilot.<br /><br />
          The firm is called <strong style={{ color: CREAM, fontWeight: 600 }}>Lavern.</strong>
        </p>

        {/* CTA */}
        <div style={{
          opacity: showCTA ? 1 : 0,
          transform: showCTA ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .5s ease, transform .5s ease',
        }}>
          <button onClick={onContinue}
            style={{ ...PILL_STYLE, padding: isMobile ? '18px 36px' : '20px 44px', fontSize: 11 }}
            onMouseEnter={pillEnter} onMouseLeave={pillLeave}>
            See Lavern in action →
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Slide 7 — Pricing ─────────────────────────────────────────────────────
function SPricing({ isMobile, onExit }: { isMobile: boolean; onExit: () => void }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1100),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  const card1 = (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
      borderRadius: 16, padding: isMobile ? '28px 24px' : '32px 32px',
      opacity: phase >= 1 ? 1 : 0, transform: phase >= 1 ? 'none' : 'translateY(20px)',
      transition: 'opacity .6s ease .1s, transform .6s ease .1s',
    }}>
      <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: ACCENT, marginBottom: 16 }}>Option 01</div>
      <div style={{ fontFamily: SERIF, fontSize: isMobile ? 32 : 42, fontWeight: 300, color: CREAM, lineHeight: 0.95, letterSpacing: -1, marginBottom: 24 }}>
        The billable<br />hour.
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 40, color: '#69DB7C', fontWeight: 300, letterSpacing: -1, marginBottom: 12 }}>$1 / hour</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(250,249,246,.38)', lineHeight: 1.6 }}>
        A typical document review runs $3–5.
      </div>
    </div>
  );

  const card2 = (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
      borderRadius: 16, padding: isMobile ? '28px 24px' : '32px 32px',
      opacity: phase >= 2 ? 1 : 0, transform: phase >= 2 ? 'none' : 'translateY(20px)',
      transition: 'opacity .6s ease .2s, transform .6s ease .2s',
    }}>
      <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(116,192,252,.7)', marginBottom: 16 }}>Option 02</div>
      <div style={{ fontFamily: SERIF, fontSize: isMobile ? 32 : 42, fontWeight: 300, color: CREAM, lineHeight: 0.95, letterSpacing: -1, marginBottom: 24 }}>
        The retainer.
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 40, color: CREAM, fontWeight: 300, letterSpacing: -1, marginBottom: 12 }}>$0</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(250,249,246,.38)', lineHeight: 1.6 }}>
        Local models. Except the electricity for your Mac Mini.
      </div>
    </div>
  );

  const ctaRow = (
    <div style={{
      opacity: phase >= 3 ? 1 : 0, transform: phase >= 3 ? 'none' : 'translateY(10px)',
      transition: 'opacity .5s ease, transform .5s ease',
      display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'center',
    }}>
      <button
        onClick={() => { window.location.hash = '#/demo'; window.location.reload(); }}
        style={{ ...PILL_STYLE, padding: '16px 28px', background: 'transparent', border: '1px solid rgba(255,255,255,.28)', color: 'rgba(250,249,246,.72)', flex: isMobile ? undefined : '0 0 auto' }}
        onMouseEnter={pillEnter} onMouseLeave={pillLeave}>Try another case</button>
      <button
        onClick={() => window.open('mailto:hello@lavern.ai?subject=Knock%20Knock', '_blank')}
        style={{ ...PILL_STYLE, padding: '16px 28px', flex: isMobile ? undefined : '0 0 auto' }}
        onMouseEnter={pillEnter} onMouseLeave={pillLeave}>Contact us</button>
      <button
        onClick={() => window.open('https://lavern.ai/claw/how-it-works.html', '_blank')}
        style={{ ...PILL_STYLE, padding: '16px 28px', flex: isMobile ? undefined : '0 0 auto' }}
        onMouseEnter={pillEnter} onMouseLeave={pillLeave}>Go deeper →</button>
    </div>
  );

  /* ── Mobile ──────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#090706', overflowY: 'auto' }}>
        <div style={{ padding: '60px 22px 80px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(40px,10vw,52px)', fontWeight: 300, lineHeight: 0.95, letterSpacing: -1.5, color: CREAM, margin: '0 0 4px', animation: 'dReveal .9s ease .1s both' }}>
            What does<br />this cost?
          </h2>
          {card1}
          {card2}
          {ctaRow}
        </div>
      </div>
    );
  }

  /* ── Desktop ─────────────────────────────────────────────────── */
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#090706', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 15% 70%, rgba(196,93,62,.05) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 85% 30%, rgba(116,192,252,.04) 0%, transparent 50%)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 80px' }}>
        <div style={{ width: '100%', maxWidth: 1040 }}>

          {/* Headline + subhead */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{
              fontFamily: SERIF, fontSize: 'clamp(48px,4.8vw,68px)',
              fontWeight: 300, lineHeight: 0.93, letterSpacing: -2,
              color: CREAM, margin: '0 0 14px',
              animation: 'dReveal .9s ease .1s both',
            }}>
              What does this cost?
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 14, color: 'rgba(250,249,246,.42)', lineHeight: 1.6, margin: 0, animation: 'dIn .7s ease .3s both' }}>
              Two ways to work with Lavern.
            </p>
          </div>

          {/* Two cards side by side */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 36 }}>
            {card1}
            {card2}
          </div>

          {ctaRow}
        </div>
      </div>
    </div>
  );
}
