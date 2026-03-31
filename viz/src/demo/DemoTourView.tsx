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
// 0=case(click), 1=partner(auto after memo), 2=team, 3=builder(CTA), 4=clawern(post-delivery)
const DURATIONS = [0, 0, 8000, 0, 0];
const TOTAL = 5;

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

  // Detect resume from delivery view (shem-demo-resume → skip to slide 4 = Clawern)
  const initialSlide = (() => {
    const resume = sessionStorage.getItem('shem-demo-resume');
    if (resume === 'clawern') {
      sessionStorage.removeItem('shem-demo-resume');
      return 4;
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
        // After slide 3 (builder) → launch real demo; slide 4 = Clawern shown post-delivery
        if (next === 4) {
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
      if ((e.key === 'ArrowRight' || e.key === ' ') && slide > 0 && slide < 4) {
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
        {slide === 1 && <S1Partner isMobile={isMobile} onContinue={() => advance(true)} />}
        {slide === 2 && <S2Team isMobile={isMobile} />}
        {slide === 3 && <S3Builder isMobile={isMobile} onLaunch={() => advance(true)} />}
        {slide === 4 && <S4Clawern isMobile={isMobile} onExit={onExit} />}
      </div>

      {/* Dots + progress — only on slides 0-3 */}
      {slide < 4 && (
        <BottomBar slide={slide} total={4} goTo={goTo} progKey={progKey} duration={DURATIONS[slide]} isMobile={isMobile} />
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
        {slide > 0 && slide < 4 && (
          <span style={{ fontFamily: SANS, fontSize: 10, color: CREAM, opacity: 0.25, letterSpacing: 1 }}>
            {slide} / 3
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
  isMobile, headline, sub, children, footer,
}: {
  isMobile: boolean;
  headline: React.ReactNode;
  sub: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        padding: '68px 22px 80px', gap: 0,
      }}>
        <div style={{ marginBottom: 22, animation: 'dUp .5s ease .05s both' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(36px,10vw,52px)', fontWeight: 300, lineHeight: 1.02, letterSpacing: -1, color: CREAM, margin: '0 0 12px' }}>{headline}</h2>
          <p style={{ fontFamily: SANS, fontSize: 13, color: 'rgba(250,249,246,.42)', margin: 0, lineHeight: 1.6, animation: 'dIn .5s ease .25s both' }}>{sub}</p>
          {footer && <div style={{ marginTop: 22 }}>{footer}</div>}
        </div>
        <div style={{ animation: 'dUp .5s ease .4s both', flex: 1 }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '40fr 60fr' }}>
      {/* Left */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '96px 44px 96px 64px',
        borderRight: '1px solid rgba(255,255,255,0.04)',
        animation: 'dUp .5s ease .05s both',
      }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(42px,4.2vw,68px)', fontWeight: 300, lineHeight: 1.02, letterSpacing: -1.5, color: CREAM, margin: '0 0 16px' }}>{headline}</h2>
        <p style={{ fontFamily: SANS, fontSize: 15, color: 'rgba(250,249,246,.42)', margin: 0, lineHeight: 1.65, maxWidth: 330, animation: 'dIn .5s ease .2s both' }}>{sub}</p>
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
    <Shell isMobile={isMobile}
      headline={<>Choose<br />your matter.</>}
      sub="Select a case. In Lavern, you can drop any document."
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
                border: `1.5px solid ${sel ? ACCENT : h ? '#C5C3BD' : BORDER}`,
                borderRadius: 10, padding: '15px 18px', cursor: 'pointer',
                transition: 'all .17s ease',
                boxShadow: sel ? `0 0 0 3px rgba(196,93,62,.1), 0 3px 14px rgba(0,0,0,.08)` : h ? '0 4px 18px rgba(0,0,0,.07)' : '0 1px 3px rgba(0,0,0,.04)',
                transform: h && !sel ? 'translateY(-1px)' : 'none',
                animation: `dCard .4s ease ${.35 + i * .09}s both`,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: TEXT }}>{c.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                  {sel && <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>SELECTED ✓</span>}
                  <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, background: '#F5F4F0', border: `1px solid ${BORDER}`, color: MUTED }}>{c.badge}</span>
                </div>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 12, color: MUTED, margin: '0 0 10px', lineHeight: 1.5 }}>{c.desc}</p>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {c.tags.map(t => (
                  <span key={t} style={{ fontFamily: SANS, fontSize: 9, letterSpacing: .5, padding: '2px 7px', background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 3, color: MUTED }}>{t}</span>
                ))}
                <span style={{
                  fontFamily: SANS, fontSize: 9, letterSpacing: .5, marginLeft: 'auto',
                  padding: '2px 7px',
                  background: c.risk === 'CRITICAL' ? 'rgba(196,93,62,.07)' : 'rgba(184,134,11,.07)',
                  border: `1px solid ${c.risk === 'CRITICAL' ? 'rgba(196,93,62,.2)' : 'rgba(184,134,11,.2)'}`,
                  borderRadius: 3, color: c.risk === 'CRITICAL' ? ACCENT : '#B8860B', fontWeight: 600,
                }}>{c.risk} RISK</span>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

// ── Slide 1 — Talk to a partner ───────────────────────────────────────────
function S1Partner({ isMobile, onContinue }: { isMobile: boolean; onContinue: () => void }) {
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
      headline={<>Meet your<br />partner.</>}
      sub="She listens, asks the right questions, and builds the team."
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
          Assemble the team →
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
            <ChatBubble align="right" text="HeartConnect — dating platform. Need Terms of Service reviewed before EU launch next month." />
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
            <ChatBubble align="left" avatar="Catherine Blackwell" text="I'm flagging two pressure points immediately: GDPR consent bundling in your sign-up flow, and age verification gaps under the Digital Services Act. Give me a moment." />
          )}
          {phase >= 4 && (
            <div style={{ animation: 'dBubble .3s ease both' }}>
              <div style={{ background: '#F5F4F0', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: 10, fontWeight: 600 }}>Briefing memo · 3 issues flagged</div>
                {[
                  { sev: 'RED',    text: 'GDPR Art. 7 — consent bundled with acceptance' },
                  { sev: 'RED',    text: 'DSA Art. 28 — age verification gap' },
                  { sev: 'YELLOW', text: 'Algorithmic transparency — Section 7' },
                ].map((item, i) => (
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

// ── Slide 2 — Assemble your team ──────────────────────────────────────────
const TEAM = [
  { ini: 'CB', name: 'Catherine Blackwell',  role: 'Managing Partner',     ovr: 96, cat: 'orchestrator', rec: true  },
  { ini: 'SR', name: 'Sofia Reyes',           role: 'Privacy Counsel',      ovr: 91, cat: 'lawyer',       rec: false },
  { ini: 'MW', name: 'Marcus Webb',            role: 'Red Teamer',           ovr: 88, cat: 'specialist',   rec: false },
  { ini: 'JO', name: 'James Okafor',           role: 'Risk Pricer',          ovr: 87, cat: 'specialist',   rec: false },
  { ini: 'IH', name: 'Ingrid Hansen',          role: 'Regulatory Counsel',   ovr: 89, cat: 'lawyer',       rec: false },
  { ini: 'DM', name: 'David Marsh',            role: 'Plain Language Spec.', ovr: 84, cat: 'specialist',   rec: false },
  { ini: 'KL', name: 'Kim Li',                 role: 'Junior Associate',     ovr: 78, cat: 'lawyer',       rec: false },
  { ini: 'PT', name: 'Patrick Torres',         role: 'IP Specialist',        ovr: 82, cat: 'specialist',   rec: false },
  { ini: 'EV', name: 'Elara Voss',             role: 'Contract Reviewer',    ovr: 85, cat: 'lawyer',       rec: false },
];

const INFRA = [
  { ini: 'QG', name: 'Quality Gate',    role: 'Evaluator',         ovr: 95, cat: 'orchestrator', rec: false },
  { ini: 'SC', name: 'Score Keeper',    role: 'Scoring Engine',    ovr: 90, cat: 'orchestrator', rec: false },
  { ini: 'VF', name: 'Vera Fontaine',   role: 'Verifier',          ovr: 88, cat: 'orchestrator', rec: false },
  { ini: 'AR', name: 'Assembly Robot',  role: 'Doc Assembler',     ovr: 86, cat: 'orchestrator', rec: false },
  { ini: 'RK', name: 'Risk Kernel',     role: 'Risk Pricing',      ovr: 89, cat: 'orchestrator', rec: false },
  { ini: 'MM', name: 'Memory Manager',  role: 'Precedent Board',   ovr: 84, cat: 'orchestrator', rec: false },
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

function S2Team({ isMobile }: { isMobile: boolean }) {
  const [activeTab, setActiveTab] = useState('Lawyers');
  const tabs = ['Lawyers', 'Specialists', 'Infrastructure'];
  const mounted = useMount();
  const visibleAgents = TAB_AGENTS[activeTab] ?? [];

  return (
    <Shell isMobile={isMobile}
      headline={<>Sixty-six<br />specialists.</>}
      sub="Partners, red teamers, privacy counsel, risk pricers. You assemble the bench."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Category tabs */}
        <div style={{
          display: 'flex', gap: 6,
          background: WHITE, border: `1px solid ${BORDER}`,
          borderRadius: 8, padding: '4px', animation: 'dIn .4s ease .3s both',
        }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 500,
              padding: '6px 14px', borderRadius: 6,
              background: activeTab === t ? TEXT : 'transparent',
              color: activeTab === t ? CREAM : MUTED,
              border: 'none', cursor: 'pointer', transition: 'all .18s ease', flex: 1,
            }}>{t}</button>
          ))}
        </div>

        {/* Agent grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {visibleAgents.map((a, i) => (
            <AgentCard key={a.ini} agent={a} delay={.08 + i * .06} />
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
  return (
    <div style={{
      background: WHITE,
      border: `1px solid ${agent.rec ? ACCENT : BORDER}`,
      borderRadius: 9, padding: '13px 11px',
      display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: agent.rec ? `0 0 0 2px rgba(196,93,62,.09)` : '0 1px 3px rgba(0,0,0,.04)',
      animation: `dFlip .42s ease ${delay}s both`,
      position: 'relative', overflow: 'hidden',
      perspective: 800,
    }}>
      {agent.rec && (
        <div style={{ position: 'absolute', top: 7, right: 7, fontFamily: SANS, fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>
          ★ REC
        </div>
      )}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
        background: `${col}10`, border: `1.5px solid ${col}25`, flexShrink: 0,
      }}>
        <img src={TEAM_AVATAR[agent.ini]} alt={agent.name} width={40} height={40} style={{ display: 'block' }} />
      </div>
      <div>
        <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: TEXT, lineHeight: 1.25, marginBottom: 2 }}>{agent.name}</div>
        <div style={{ fontFamily: SANS, fontSize: 9, color: MUTED, lineHeight: 1.3 }}>{agent.role}</div>
      </div>
      <div style={{
        paddingTop: 8, borderTop: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: SANS, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>OVR</span>
        <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 300, color: TEXT, lineHeight: 1 }}>{agent.ovr}</span>
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

function S3Builder({ isMobile, onLaunch }: { isMobile: boolean; onLaunch: () => void }) {
  const [animStep, setAnimStep] = useState(0);
  const [builderStep, setBuilderStep] = useState<BuilderStep>('Stats');

  useEffect(() => {
    const t = setTimeout(() => setAnimStep(1), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <Shell isMobile={isMobile}
      headline={<>Make it<br />yours.</>}
      sub="66 agents in the roster. Not enough? Forge your own. Set the rules."
      footer={
        <button
          onClick={(e) => { e.stopPropagation(); onLaunch(); }}
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
          See the agents work →
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
            <button style={{
              width: '100%', padding: '9px', background: ACCENT, border: 'none',
              borderRadius: 7, color: CREAM, fontFamily: SANS, fontSize: 9,
              letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
            }}>Forge Agent</button>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ── Slide 4 — Clawern Reveal ──────────────────────────────────────────────
const TERM_LINES = [
  { delay: 600,  text: '⚙  Daemon started  ·  PID 42847', col: 'rgba(250,249,246,.7)' },
  { delay: 1500, text: '📁  Watching ~/Documents/Contracts/', col: 'rgba(250,249,246,.7)' },
  { delay: 2400, text: '📄  cloud-services-msa.pdf detected', col: 'rgba(250,249,246,.7)' },
  { delay: 3400, text: '🤖  Dispatching 4 agents…', col: 'rgba(250,249,246,.7)' },
  { delay: 4500, text: '⚠️  CRITICAL: Unlimited liability — Section 8.2', col: '#FF6B6B' },
  { delay: 5200, text: '⚖️  Debate resolved  ·  0.91 confidence', col: '#74C0FC' },
  { delay: 6000, text: '✅  Delivered  ·  $3.40  ·  2 critical findings', col: '#69DB7C' },
  { delay: 7000, text: '💡  Precedent learned: "Unlimited Indemnification"', col: 'rgba(250,249,246,.45)' },
];

function S4Clawern({ isMobile, onExit }: { isMobile: boolean; onExit: () => void }) {
  const [lines, setLines] = useState<number[]>([]);
  const [showCTA, setShowCTA] = useState(false);

  useEffect(() => {
    const ts = TERM_LINES.map((l, i) => setTimeout(() => setLines(v => [...v, i]), l.delay));
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
            By morning — findings, diffs, and a Telegram message.
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
            {TERM_LINES.map((l, i) =>
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
            How Clawern works →
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
            Start for free →
          </button>
        </div>
      </div>
    </div>
  );
}
