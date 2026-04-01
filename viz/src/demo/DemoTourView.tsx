/**
 * DemoTourView — Cinematic tech demo. ~60-90 seconds.
 *
 * Slides (custom):
 *   0. Choose the case         (interactive — click to pick)
 *   1. Talk to a partner       (auto-playing conversation)
 *   2. Assemble your team      (high-fidelity team grid)
 *   3. Craft your own agents   (agent builder recreation)
 *   4. Clawern reveal          (cinematic — wild — the finale)
 *
 * Between slides 3 and 4:
 *   → real WorkingView (demo session set via onLaunchDemo)
 *   → real DeliveryView (auto-advances and sets shem-demo-resume=true)
 *   → DemoTourView resumes at slide 4 (Clawern)
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

// ── Slide durations (ms). 0 = wait for user interaction. ──────────────────
// 0=case(click), 1=partner(CTA), 2=voice(CTA), 3=team(CTA), 4=builder(CTA), 5=clawern(post-delivery)
const DURATIONS = [0, 0, 0, 0, 0, 0];
const TOTAL = 6;

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

  // Detect resume from delivery view (shem-demo-resume → skip to slide 5 = Clawern)
  const initialSlide = (() => {
    const resume = sessionStorage.getItem('shem-demo-resume');
    if (resume === 'clawern') {
      sessionStorage.removeItem('shem-demo-resume');
      return 5;
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
        // After slide 4 (builder) → launch real demo; slide 5 = Clawern shown post-delivery
        if (next === 5) {
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
      if ((e.key === 'ArrowRight' || e.key === ' ') && slide > 0 && slide < 5) {
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
        {slide === 0 && <S0Case isMobile={isMobile} selected={selectedCase} onPick={pickCase} onContinue={() => advance(true)} />}
        {slide === 1 && <S1Partner isMobile={isMobile} caseId={selectedCase} onContinue={() => advance(true)} />}
        {slide === 2 && <S2Voice isMobile={isMobile} caseId={selectedCase} onContinue={() => advance(true)} />}
        {slide === 3 && <S3Team isMobile={isMobile} caseId={selectedCase} onContinue={() => advance(true)} />}
        {slide === 4 && <S4Builder isMobile={isMobile} onLaunch={() => advance(true)} />}
        {slide === 5 && <S5Clawern isMobile={isMobile} caseId={selectedCase} onExit={onExit} />}
      </div>

      {/* Dots + progress — only on slides 0-4 */}
      {slide < 5 && (
        <BottomBar slide={slide} total={5} goTo={goTo} progKey={progKey} duration={DURATIONS[slide]} isMobile={isMobile} />
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
        @keyframes dGrain{ 0%{transform:translate(0,0);} 10%{transform:translate(-2%,-3%);} 20%{transform:translate(3%,2%);} 30%{transform:translate(-1%,4%);} 40%{transform:translate(4%,-2%);} 50%{transform:translate(-3%,1%);} 60%{transform:translate(2%,3%);} 70%{transform:translate(-4%,-1%);} 80%{transform:translate(3%,-3%);} 90%{transform:translate(-2%,2%);} 100%{transform:translate(0,0);} }
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
      background: 'linear-gradient(to bottom, rgba(8,8,8,0.85) 0%, transparent 100%)',
    }}>
      <span style={{ fontFamily: SERIF, fontSize: isMobile ? 13 : 15, fontWeight: 300, letterSpacing: 7, color: CREAM, opacity: 0.55 }}>
        LAVERN
      </span>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {slide > 0 && slide < 5 && (
          <span style={{ fontFamily: SANS, fontSize: 10, color: CREAM, opacity: 0.25, letterSpacing: 1 }}>
            {slide} / 4
          </span>
        )}
        <button onClick={onExit} style={{
          fontFamily: SANS, fontSize: 10, fontWeight: 500, letterSpacing: 2.5, textTransform: 'uppercase',
          color: CREAM, opacity: 0.25, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
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
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: 'linear-gradient(to top, rgba(8,8,8,0.8) 0%, transparent 100%)',
      paddingBottom: isMobile ? 16 : 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingBottom: 14 }}>
        {Array.from({ length: total }).map((_, i) => (
          <button key={i} onClick={() => goTo(i)} style={{
            width: i === slide ? 24 : 6, height: 6, borderRadius: 3, border: 'none', padding: 0,
            cursor: 'pointer',
            background: i === slide ? CREAM : 'rgba(250,249,246,0.2)',
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
  sub: string;
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
          {footer && <div style={{ marginTop: 22 }}>{footer}</div>}
        </div>
        <div style={{ animation: 'dUp .5s ease .4s both', flex: 1 }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '40fr 60fr', background: bgOverlay }}>
      {/* Left */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '96px 44px 96px 64px',
        borderRight: `1px solid ${dividerColor}`,
        animation: 'dUp .5s ease .05s both',
      }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(52px,5.2vw,84px)', fontWeight: 300, lineHeight: 1.02, letterSpacing: -2, color: headlineColor, margin: '0 0 20px', textShadow: headlineShadow }}>{headline}</h2>
        <p style={{ fontFamily: SANS, fontSize: 17, fontWeight: 500, color: subColor, opacity: subOpacity, margin: 0, lineHeight: 1.6, maxWidth: 340, animation: 'dIn .5s ease .2s both' }}>{sub}</p>
        {footer && <div style={{ marginTop: 36, animation: 'dIn .4s ease .35s both' }}>{footer}</div>}
      </div>
      {/* Right */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 52px 80px 36px',
        animation: 'dUp .5s ease .18s both',
      }}>
        <div style={{ width: '100%', maxWidth: 540 }}>{children}</div>
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
      headline={<>Choose<br />your matter.</>}
      sub="A driverless law firm. 66 specialist agents, no billable hours. Pick a case and see it work."
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
      headline={<>Talk to<br />a partner.</>}
      sub="Lavern listens, asks the right questions, and assembles the team."
      footer={phase >= 4 ? (
        <button
          onClick={(e) => { e.stopPropagation(); onContinue(); }}
          style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 3,
            textTransform: 'uppercase', padding: '17px 48px', borderRadius: 100,
            background: CREAM, color: BG, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(250,249,246,.12)',
            transition: 'transform .22s ease',
            animation: 'dUp .4s ease both',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          Try voice mode
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
      headline={<>Lavern<br />listens.</>}
      sub="Press spacebar and talk to the agents. Plain language. No forms."
      footer={phase >= 4 ? (
        <button onClick={(e) => { e.stopPropagation(); onContinue(); }} style={{
          fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 3,
          textTransform: 'uppercase', padding: '17px 48px', borderRadius: 100,
          background: CREAM, color: BG, border: 'none', cursor: 'pointer',
          transition: 'transform .22s ease', animation: 'dUp .4s ease both',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >Meet the team</button>
      ) : undefined}
    >
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Avatar */}
      <div style={{
        position: 'relative', marginBottom: 20,
        animation: 'dUp .5s ease .05s both',
      }}>
        {/* Pulse rings */}
        {phase >= 1 && phase < 4 && [1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: -i * 14,
            borderRadius: '50%',
            border: '1px solid rgba(250,249,246,.12)',
            animation: `dPulse ${1.4 + i * 0.3}s ease ${i * 0.2}s infinite`,
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

      <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: CREAM, letterSpacing: 1, marginBottom: 4, animation: 'dUp .5s ease .15s both' }}>
        Catherine Blackwell
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: 'rgba(250,249,246,.35)', letterSpacing: .5, marginBottom: 36, animation: 'dUp .5s ease .2s both' }}>
        Managing Partner
      </div>

      {/* Waveform */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3, height: 36, marginBottom: 32,
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
            <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(250,249,246,.3)', marginBottom: 8 }}>You</div>
            <p style={{ fontFamily: SERIF, fontSize: isMobile ? 17 : 20, fontWeight: 300, color: CREAM, lineHeight: 1.4, margin: 0 }}>
              {c.voiceUser}
            </p>
          </div>
        )}
        {phase >= 4 && (
          <div style={{ animation: 'dBubble .4s ease both', marginTop: 16 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(250,249,246,.3)', marginBottom: 8 }}>Lavern</div>
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
    const t = setTimeout(() => setShowCTA(true), 3400); // after all cards + auto-flips complete
    return () => clearTimeout(t);
  }, []);

  return (
    <Shell isMobile={isMobile}
      headline={<>Assemble<br />your team.</>}
      sub="Partners, red teamers, privacy counsel, risk pricers. 66 specialists on the bench."
      footer={showCTA ? (
        <button onClick={(e) => { e.stopPropagation(); onContinue(); }} style={{
          fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 3,
          textTransform: 'uppercase', padding: '17px 48px', borderRadius: 100,
          background: CREAM, color: BG, border: 'none', cursor: 'pointer',
          transition: 'transform .22s ease', animation: 'dUp .4s ease both',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >Make it yours</button>
      ) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Agent grid — 6 core agents, 3×2. Cards clickable; 2 auto-flip to stats. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {TEAM.slice(0, 6).map((a, i) => (
            <AgentCard
              key={a.ini} agent={a} delay={.1 + i * .38}
              autoFlip={i === 0 ? 1800 : i === 4 ? 2600 : undefined}
            />
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

function AgentCard({ agent, delay, autoFlip }: { agent: typeof TEAM[0]; delay: number; autoFlip?: number }) {
  const col = CAT[agent.cat] ?? MUTED;
  // Start visible (entered), then optionally auto-flip to stats side
  const [entered, setEntered]   = useState(false);
  const [flipped, setFlipped]   = useState(false);

  // Entrance: card appears after `delay`
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), delay * 1000);
    return () => clearTimeout(t);
  }, [delay]);

  // Auto-flip to stats side if autoFlip ms specified
  useEffect(() => {
    if (!autoFlip) return;
    const t = setTimeout(() => setFlipped(true), autoFlip);
    return () => clearTimeout(t);
  }, [autoFlip]);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); if (entered) setFlipped(f => !f); }}
      style={{
        perspective: 700,
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0) scale(1)' : 'translateY(12px) scale(.93)',
        transition: `opacity .38s ease, transform .38s ease`,
        cursor: entered ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <div style={{
        position: 'relative',
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
        height: 148,
      }}>
        {/* Face A — dark back (shown before flip) */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          borderRadius: 9,
          background: 'linear-gradient(135deg, #1A1A1A 0%, #252525 50%, #1A1A1A 100%)',
          border: `1px solid ${col}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: agent.rec ? `0 0 0 2px ${col}30` : '0 1px 4px rgba(0,0,0,.18)',
        }}>
          <div style={{
            fontFamily: SERIF, fontSize: 48, fontWeight: 700,
            color: `${col}22`, textShadow: '0 2px 4px rgba(0,0,0,.4)',
          }}>L</div>
          <div style={{
            position: 'absolute', inset: 10,
            border: `1px solid ${col}12`,
            borderRadius: 6,
          }} />
        </div>

        {/* Face B — agent info + stats (revealed on flip) */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 9,
          background: WHITE,
          border: `1px solid ${agent.rec ? ACCENT : BORDER}`,
          padding: '10px 10px 8px',
          boxShadow: agent.rec ? `0 0 0 2px rgba(196,93,62,.09)` : '0 1px 3px rgba(0,0,0,.04)',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          {agent.rec && (
            <div style={{ position: 'absolute', top: 6, right: 7, fontFamily: SANS, fontSize: 7, letterSpacing: 1, textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>
              ★ REC
            </div>
          )}
          {/* Avatar + name */}
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: `${col}10`, border: `1.5px solid ${col}25` }}>
              <img src={TEAM_AVATAR[agent.ini]} alt={agent.name} width={34} height={34} style={{ display: 'block' }} />
            </div>
            <div>
              <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 600, color: TEXT, lineHeight: 1.2 }}>{agent.name.split(' ')[0]}</div>
              <div style={{ fontFamily: SANS, fontSize: 8.5, color: MUTED }}>{agent.role}</div>
            </div>
          </div>

          {/* Skill bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {agent.skills.map(s => (
              <div key={s.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontFamily: SANS, fontSize: 8, color: MUTED }}>{s.l}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: TEXT, lineHeight: 1 }}>{s.v}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: '#F0EFEB', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: `linear-gradient(90deg, ${col} 0%, ${col}80 100%)`,
                    width: `${s.v}%`,
                    animation: 'dBar .7s ease .1s both',
                    // @ts-ignore
                    '--w': `${s.v}%`,
                  } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>

          {/* OVR */}
          <div style={{
            paddingTop: 6, borderTop: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginTop: 'auto',
          }}>
            <span style={{ fontFamily: SANS, fontSize: 7.5, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>OVR</span>
            <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 300, color: TEXT, lineHeight: 1 }}>{agent.ovr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 3 — Craft your own agents ──────────────────────────────────────
const SKILLS = [
  { label: 'Precision',  val: 97, col: '#2E7D9C' },
  { label: 'Depth',      val: 93, col: '#7B5EA7' },
  { label: 'Creativity', val: 71, col: '#B8860B' },
  { label: 'Risk',       val: 88, col: ACCENT },
];

const BUILDER_STEPS = ['Identity', 'Face', 'Stats'] as const;
type BuilderStep = typeof BUILDER_STEPS[number];

// ── Demo agent profile — "The Surgeon" ────────────────────────────────────
const DEMO_SURGEON_PROFILE: AgentProfile = {
  role: 'contract-reviewer',
  displayName: 'The Surgeon',
  tagline: 'Methodical. Cuts through ambiguity. Never skips a clause.',
  category: 'lawyer',
  seniority: 'partner',
  costTier: 'sonnet',
  billingRateUsd: 380,
  skills: {
    precision: 94, creativity: 72, speed: 85, depth: 97,
    negotiation: 88, communication: 76, research: 91, risk: 93,
  },
  personality: {
    archetype: 'The Surgeon',
    traits: {
      'conservative-vs-creative': 2,
      'thorough-vs-fast': 2,
      'risk-averse-vs-tolerant': 2,
      'formal-vs-approachable': 3,
      'adversarial-vs-collaborative': 4,
    },
    workStyle: 'Methodical. Cuts through ambiguity. Never skips a clause.',
  },
  practiceAreas: ['Contract Review', 'Risk Assessment'],
  strengths: ['Precision analysis', 'Risk identification', 'Clause-by-clause review'],
  limitations: ['Less suited for high-level strategy'],
  optional: true,
  defaultSelected: false,
  avatarSeed: 'The Surgeon',
};

function S4Builder({ isMobile, onLaunch }: { isMobile: boolean; onLaunch: () => void }) {
  const [animStep, setAnimStep] = useState(0);
  const [builderStep, setBuilderStep] = useState<BuilderStep>('Stats');
  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimStep(1), 800);
    return () => clearTimeout(t);
  }, []);

  const forgeAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowReveal(true);
  };

  return (
    <>
    {showReveal && (
      <CardRevealOverlay
        profile={DEMO_SURGEON_PROFILE}
        ovr={94}
        costTier="sonnet"
        billingRate={380}
        onSave={onLaunch}
        onBuildAnother={() => setShowReveal(false)}
        onClose={() => setShowReveal(false)}
      />
    )}
    <Shell isMobile={isMobile}
      headline={<>Make it<br />yours.</>}
      sub="66 agents in the roster. Not enough? Forge your own. Set the rules."
      footer={
        <button
          onClick={forgeAgent}
          style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase',
            padding: '17px 48px', borderRadius: 100,
            background: CREAM, color: BG, border: 'none', cursor: 'pointer',
            transition: 'transform .22s ease, box-shadow .22s ease',
            boxShadow: '0 4px 20px rgba(250,249,246,.12)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.03)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(250,249,246,.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(250,249,246,.12)';
          }}
        >
          Forge Agent
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
                <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT, background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px' }}>The Surgeon</div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Specialisation</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT, background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px' }}>Contract Review</div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Archetype</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['The Gatekeeper', 'The Surgeon', 'The Diplomat', 'The Hawk'].map(a => (
                    <div key={a} style={{
                      fontFamily: SANS, fontSize: 10, padding: '5px 10px',
                      borderRadius: 20, border: `1px solid ${a === 'The Surgeon' ? ACCENT : BORDER}`,
                      background: a === 'The Surgeon' ? 'rgba(196,93,62,.06)' : '#F5F4F0',
                      color: a === 'The Surgeon' ? ACCENT : MUTED, cursor: 'pointer',
                    }}>{a}</div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontWeight: 600 }}>Work Style</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: MUTED, background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px', lineHeight: 1.6 }}>
                  Methodical. Cuts through ambiguity. Never skips a clause.
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
                  <img src={av('The Surgeon', 100)} alt="The Surgeon" width={72} height={72} style={{ display: 'block' }} />
                </div>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 16, color: TEXT, marginBottom: 3 }}>The Surgeon</div>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: MUTED, marginBottom: 8 }}>Seed: surgeon-v1</div>
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
                {SKILLS.map((s, i) => (
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
            background: 'rgba(196,93,62,.04)', border: '1.5px solid rgba(196,93,62,.18)',
            borderRadius: 10, padding: '18px 14px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            animation: 'dIn .6s ease .5s both',
          }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: 'rgba(196,93,62,.07)', border: '1.5px solid rgba(196,93,62,.25)' }}>
              <img src={av('The Surgeon', 80)} alt="The Surgeon" width={56} height={56} style={{ display: 'block' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, color: TEXT, fontWeight: 400, marginBottom: 3 }}>The Surgeon</div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>Contract Review</div>
            </div>
            <div style={{ width: '100%', paddingTop: 12, borderTop: `1px solid ${BORDER}`, textAlign: 'center' }}>
              <div style={{ fontFamily: SANS, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 3 }}>OVR</div>
              <div style={{ fontFamily: SERIF, fontSize: 46, color: TEXT, lineHeight: 1, fontWeight: 300 }}>94</div>
            </div>
            <button
              onClick={forgeAgent}
              style={{
                width: '100%', padding: '9px', background: ACCENT, border: 'none',
                borderRadius: 7, color: CREAM, fontFamily: SANS, fontSize: 9,
                letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
              }}>Forge Agent</button>
          </div>
        )}
      </div>
    </Shell>
    </>
  );
}

// ── Slide 4 — Clawern Reveal ──────────────────────────────────────────────
const TERM_LINES: Record<CaseId, { delay: number; text: string; col: string }[]> = {
  heartconnect: [
    { delay: 600,  text: '⚙  Daemon started  ·  PID 42847', col: 'rgba(250,249,246,.7)' },
    { delay: 1500, text: '📁  Watching ~/Documents/Contracts/', col: 'rgba(250,249,246,.7)' },
    { delay: 2400, text: '📄  heartconnect-tos-v3.pdf detected', col: 'rgba(250,249,246,.7)' },
    { delay: 3400, text: '🤖  Dispatching 5 agents…', col: 'rgba(250,249,246,.7)' },
    { delay: 4500, text: '⚠️  CRITICAL: GDPR consent bundling — Section 4.1', col: '#FF6B6B' },
    { delay: 5200, text: '⚖️  Debate resolved  ·  0.94 confidence', col: '#74C0FC' },
    { delay: 6000, text: '✅  Delivered  ·  $4.20  ·  3 findings', col: '#69DB7C' },
    { delay: 7000, text: '💡  Precedent learned: "GDPR Consent Bundling"', col: 'rgba(250,249,246,.45)' },
  ],
  medivault: [
    { delay: 600,  text: '⚙  Daemon started  ·  PID 38291', col: 'rgba(250,249,246,.7)' },
    { delay: 1500, text: '📁  Watching ~/Documents/Legal/', col: 'rgba(250,249,246,.7)' },
    { delay: 2400, text: '📄  medivault-privacy-policy.pdf detected', col: 'rgba(250,249,246,.7)' },
    { delay: 3400, text: '🤖  Dispatching 5 agents…', col: 'rgba(250,249,246,.7)' },
    { delay: 4500, text: '⚠️  CRITICAL: HIPAA §164.308 — third-party gap', col: '#FF6B6B' },
    { delay: 5200, text: '⚖️  Debate resolved  ·  0.96 confidence', col: '#74C0FC' },
    { delay: 6000, text: '✅  Delivered  ·  $3.80  ·  3 findings', col: '#69DB7C' },
    { delay: 7000, text: '💡  Precedent learned: "HIPAA Third-Party Risk"', col: 'rgba(250,249,246,.45)' },
  ],
  cloudmsa: [
    { delay: 600,  text: '⚙  Daemon started  ·  PID 42847', col: 'rgba(250,249,246,.7)' },
    { delay: 1500, text: '📁  Watching ~/Documents/Contracts/', col: 'rgba(250,249,246,.7)' },
    { delay: 2400, text: '📄  cloud-services-msa.pdf detected', col: 'rgba(250,249,246,.7)' },
    { delay: 3400, text: '🤖  Dispatching 4 agents…', col: 'rgba(250,249,246,.7)' },
    { delay: 4500, text: '⚠️  CRITICAL: Unlimited liability — Section 8.2', col: '#FF6B6B' },
    { delay: 5200, text: '⚖️  Debate resolved  ·  0.91 confidence', col: '#74C0FC' },
    { delay: 6000, text: '✅  Delivered  ·  $3.40  ·  2 critical findings', col: '#69DB7C' },
    { delay: 7000, text: '💡  Precedent learned: "Unlimited Indemnification"', col: 'rgba(250,249,246,.45)' },
  ],
};

function S5Clawern({ isMobile, caseId, onExit }: { isMobile: boolean; caseId: CaseId; onExit: () => void }) {
  const c = CASE_CONTENT[caseId];
  const termLines = TERM_LINES[caseId];
  const [lines, setLines] = useState<number[]>([]);
  const [showCTA, setShowCTA] = useState(false);

  useEffect(() => {
    const ts = termLines.map((l, i) => setTimeout(() => setLines(v => [...v, i]), l.delay));
    const ctaT = setTimeout(() => setShowCTA(true), 8200);
    return () => [...ts, ctaT].forEach(clearTimeout);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#050505', overflow: 'hidden' }}>
      {/* Grain overlay */}
      <div style={{
        position: 'absolute', inset: '-50%',
        width: '200%', height: '200%',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.45'/%3E%3C/svg%3E")`,
        opacity: 0.55,
        animation: 'dGrain 0.5s steps(1) infinite',
        pointerEvents: 'none', zIndex: 2,
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,.7) 100%)',
        pointerEvents: 'none', zIndex: 3,
      }} />

      {/* Content */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '56px 22px 56px' : '64px 48px 64px',
        gap: 0, overflowY: 'auto',
      }}>
        {/* Headline */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 18 : 28 }}>
          <div style={{
            fontSize: isMobile ? 60 : 88, lineHeight: 1,
            animation: 'dCrab 3s ease infinite, dIn .8s ease .2s both',
            display: 'inline-block', marginBottom: 14,
          }}>🦀</div>
          <h2 style={{
            fontFamily: SERIF,
            fontSize: isMobile ? 'clamp(36px,8vw,48px)' : 'clamp(48px,5.5vw,78px)',
            fontWeight: 300, lineHeight: 1.0, letterSpacing: -1.5,
            color: CREAM, margin: '0 0 12px',
            animation: 'dReveal .8s ease .4s both',
          }}>While you sleep.</h2>
          <p style={{
            fontFamily: SANS, fontSize: isMobile ? 13 : 16,
            color: 'rgba(250,249,246,.4)',
            maxWidth: 480, margin: '0 auto',
            lineHeight: 1.55,
            animation: 'dIn .6s ease .7s both',
          }}>
            Clawern watches your folders overnight. Drop a contract in at 11pm.
            By morning — findings, diffs, and a Telegram message. Tonight it delivered: <em>{c.deliverable}</em>.
          </p>
        </div>

        {/* Terminal */}
        <div style={{
          width: '100%', maxWidth: 560,
          background: 'rgba(0,0,0,.65)', border: '1px solid rgba(255,255,255,.09)',
          borderRadius: 12, padding: '14px 18px',
          fontFamily: MONO, fontSize: isMobile ? 11 : 12,
          marginBottom: 20,
          animation: 'dUp .5s ease .5s both',
        }}>
          {/* Title bar */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: .75 }} />
            ))}
            <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(255,255,255,.2)', letterSpacing: 1 }}>lavern claw — live</span>
            <div style={{
              marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center',
              fontFamily: SANS, fontSize: 9, color: '#69DB7C',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#69DB7C', display: 'inline-block', animation: 'dPulse 1.5s ease infinite' }} />
              Running
            </div>
          </div>

          {/* Log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 100 }}>
            {termLines.map((l, i) =>
              lines.includes(i) ? (
                <div key={i} style={{ color: l.col, animation: 'dTermLine .22s ease both', lineHeight: 1.5 }}>
                  {l.text}
                </div>
              ) : null
            )}
          </div>

          {/* Budget gauge */}
          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            opacity: lines.length >= 4 ? 1 : 0,
            transition: 'opacity .5s ease',
          }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.28)', letterSpacing: 1 }}>Budget</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 90, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.08)' }}>
                <div style={{ height: '100%', width: '9.2%', borderRadius: 2, background: '#69DB7C' }} />
              </div>
              <span style={{ fontSize: 10, color: 'rgba(250,249,246,.4)' }}>4.6h / 50h</span>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
          opacity: showCTA ? 1 : 0,
          transform: showCTA ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity .5s ease, transform .5s ease',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); window.open('https://lavern.ai/claw/how-it-works.html', '_blank'); }}
            style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 600,
              letterSpacing: 3, textTransform: 'uppercase',
              padding: '16px 44px', borderRadius: 100,
              background: CREAM, color: BG, border: 'none', cursor: 'pointer',
              transition: 'transform .22s ease, box-shadow .22s ease',
              boxShadow: '0 4px 24px rgba(250,249,246,.14)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            How Clawern works
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onExit(); }}
            style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 600,
              letterSpacing: 3, textTransform: 'uppercase',
              padding: '16px 36px', borderRadius: 100,
              background: 'transparent', color: CREAM,
              border: '1px solid rgba(250,249,246,.18)',
              cursor: 'pointer', opacity: .65, transition: 'opacity .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '.65'; }}
          >
            Start for free
          </button>
        </div>
      </div>
    </div>
  );
}
