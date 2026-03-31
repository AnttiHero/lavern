/**
 * DemoTourView — Cinematic 7-slide guided tour of Lavern.
 *
 * Slides:
 *   1. Choose the case
 *   2. Talk to a partner
 *   3. Choose your agent team
 *   4. Build your own agents
 *   5. Agents working  (~10s)
 *   6. The deliverable
 *   7. Clawern pitch  (no auto-advance, CTAs)
 *
 * Auto-advances per slide duration. Click anywhere / ArrowRight / Space
 * to skip to the next slide immediately.
 *
 * No backend, no sessionStorage, no API calls — entirely self-contained.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

// ── Design tokens ──────────────────────────────────────────────────────────
const BG     = '#080808';
const TEXT   = '#FAF9F6';
const DIM    = 'rgba(250,249,246,0.45)';
const PANEL  = 'rgba(255,255,255,0.03)';
const BORDER = 'rgba(255,255,255,0.07)';
const SERIF  = "'Cormorant Garamond', Georgia, serif";
const SANS   = "'Inter', -apple-system, sans-serif";
const ACCENT = '#E8845C';

// ── Slide durations (ms). Slide 6 = last auto-advance; slide 7 = no timer ─
const DURATIONS = [4000, 5000, 4000, 4500, 10000, 5000, 0];
const TOTAL_SLIDES = 7;

// ── Types ──────────────────────────────────────────────────────────────────
interface Props {
  onExit: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DemoTourView({ onExit }: Props) {
  const isMobile = useMediaQuery('mobile');
  const [slide, setSlide]       = useState(0);
  const [visible, setVisible]   = useState(true); // for cross-fade
  const [progKey, setProgKey]   = useState(0);    // reset progress bar
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancingRef = useRef(false);

  const advance = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    setVisible(false);
    setTimeout(() => {
      setSlide(prev => {
        const next = prev + 1;
        if (next >= TOTAL_SLIDES) {
          // Wrap back to start instead of exiting
          advancingRef.current = false;
          setVisible(true);
          setProgKey(k => k + 1);
          return 0;
        }
        return next;
      });
      setProgKey(k => k + 1);
      setVisible(true);
      advancingRef.current = false;
    }, 280);
  }, []);

  // Auto-advance timer
  useEffect(() => {
    const duration = DURATIONS[slide];
    if (duration === 0) return; // slide 7: no timer
    timerRef.current = setTimeout(advance, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slide, advance]);

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (slide < TOTAL_SLIDES - 1) advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slide, advance]);

  const handleSlideClick = () => {
    if (slide < TOTAL_SLIDES - 1) advance();
  };

  const goTo = (i: number) => {
    if (advancingRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => {
      setSlide(i);
      setProgKey(k => k + 1);
      setVisible(true);
    }, 200);
  };

  const slides = [
    <Slide1 key="s1" isMobile={isMobile} />,
    <Slide2 key="s2" isMobile={isMobile} />,
    <Slide3 key="s3" isMobile={isMobile} />,
    <Slide4 key="s4" isMobile={isMobile} />,
    <Slide5 key="s5" isMobile={isMobile} />,
    <Slide6 key="s6" isMobile={isMobile} />,
    <Slide7 key="s7" isMobile={isMobile} onExit={onExit} />,
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: BG,
        display: 'flex', flexDirection: 'column',
        fontFamily: SANS, color: TEXT, overflow: 'hidden',
        zIndex: 9999, userSelect: 'none',
      }}
      onClick={handleSlideClick}
    >
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '20px 24px' : '28px 40px',
        zIndex: 20,
      }}>
        <span style={{
          fontFamily: SERIF, fontSize: isMobile ? 13 : 16, fontWeight: 300,
          letterSpacing: 7, color: TEXT, opacity: 0.7,
        }}>LAVERN</span>

        {slide < TOTAL_SLIDES - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); advance(); }}
            style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 500,
              letterSpacing: 2, textTransform: 'uppercase',
              color: TEXT, opacity: 0.3, background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 0',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}
          >
            Skip →
          </button>
        )}
      </div>

      {/* Slide content — fade transition */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.28s ease, transform 0.28s ease',
      }}>
        {slides[slide]}
      </div>

      {/* Bottom: dots + progress bar */}
      <div
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8,
          paddingBottom: 20,
        }}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              style={{
                width: i === slide ? 20 : 6, height: 6,
                borderRadius: 3,
                backgroundColor: i === slide ? TEXT : 'rgba(255,255,255,0.2)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Progress bar */}
        {DURATIONS[slide] > 0 && (
          <ProgressBar key={progKey} duration={DURATIONS[slide]} />
        )}
      </div>

      <style>{`
        @keyframes tourFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tourFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes progressFill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes barAppear {
          from { opacity: 0; transform: scaleX(0); }
          to   { opacity: 1; transform: scaleX(1); }
        }
        @keyframes agentTyping {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes terminalLine {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes cardFlip {
          0%   { opacity: 0; transform: rotateY(90deg) scale(0.9); }
          100% { opacity: 1; transform: rotateY(0deg) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ duration }: { duration: number }) {
  return (
    <div style={{ width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div style={{
        height: '100%', backgroundColor: 'rgba(255,255,255,0.35)',
        animation: `progressFill ${duration}ms linear forwards`,
      }} />
    </div>
  );
}

// ── Slide shell ────────────────────────────────────────────────────────────
function SlideShell({
  narration, sub, children, isMobile, centered = false,
}: {
  narration: string;
  sub: string;
  children?: React.ReactNode;
  isMobile: boolean;
  centered?: boolean;
}) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: centered ? 'center' : 'flex-start',
      padding: isMobile ? '80px 24px 90px' : '90px 48px 90px',
      gap: 0, overflowY: 'auto',
    }}>
      {/* Narration */}
      <div style={{
        textAlign: 'center', marginBottom: 12,
        animation: 'tourFadeUp 0.5s ease 0.1s both',
      }}>
        <h2 style={{
          fontFamily: SERIF,
          fontSize: isMobile ? 'clamp(36px, 10vw, 52px)' : 'clamp(44px, 5.5vw, 72px)',
          fontWeight: 300, lineHeight: 1.05, letterSpacing: -1,
          color: TEXT, margin: 0, marginBottom: 14,
        }}>{narration}</h2>
        <p style={{
          fontFamily: SANS, fontSize: isMobile ? 14 : 16,
          color: DIM, margin: 0, letterSpacing: 0.2,
          animation: 'tourFade 0.5s ease 0.3s both',
        }}>{sub}</p>
      </div>

      {/* Mockup */}
      {children && (
        <div style={{
          width: '100%', maxWidth: 800,
          animation: 'tourFadeUp 0.5s ease 0.45s both',
          marginTop: isMobile ? 28 : 36,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Slide 1: Choose the case ───────────────────────────────────────────────
const CASES = [
  {
    id: 'heartconnect',
    icon: '💬',
    title: 'HeartConnect',
    desc: 'Dating platform Terms of Service',
    type: 'Consumer ToS',
    highlight: true,
  },
  {
    id: 'medivault',
    icon: '🏥',
    title: 'MediVault',
    desc: 'Health data privacy policy review',
    type: 'Privacy Policy',
    highlight: false,
  },
  {
    id: 'cloudmsa',
    icon: '☁️',
    title: 'Cloud MSA',
    desc: 'Software services master agreement',
    type: 'Commercial Contract',
    highlight: false,
  },
];

function Slide1({ isMobile }: { isMobile: boolean }) {
  return (
    <SlideShell
      narration="Start with your matter."
      sub="A contract. A policy. A term sheet. Anything."
      isMobile={isMobile}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 14,
      }}>
        {CASES.map((c, i) => (
          <div
            key={c.id}
            style={{
              background: c.highlight ? 'rgba(232,132,92,0.08)' : PANEL,
              border: `1px solid ${c.highlight ? 'rgba(232,132,92,0.3)' : BORDER}`,
              borderRadius: 12, padding: '24px 20px',
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: c.highlight ? '0 0 30px rgba(232,132,92,0.08)' : 'none',
              animation: `tourFadeUp 0.4s ease ${0.5 + i * 0.1}s both`,
            }}
          >
            <div style={{ fontSize: 28 }}>{c.icon}</div>
            <div>
              <div style={{
                fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: TEXT,
                marginBottom: 4,
              }}>{c.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: DIM }}>{c.desc}</div>
            </div>
            <div style={{
              marginTop: 'auto', paddingTop: 12,
              borderTop: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: SANS, fontSize: 10, letterSpacing: 2,
                textTransform: 'uppercase', color: c.highlight ? ACCENT : DIM,
              }}>{c.type}</span>
              {c.highlight && (
                <span style={{
                  fontFamily: SANS, fontSize: 10, letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: ACCENT, opacity: 0.8,
                }}>Selected ✓</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

// ── Slide 2: Talk to a partner ─────────────────────────────────────────────
function Slide2({ isMobile }: { isMobile: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 1800),
      setTimeout(() => setStep(3), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <SlideShell
      narration="Brief a partner. She listens."
      sub="Catherine asks the right questions and assembles the team."
      isMobile={isMobile}
    >
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: '20px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* User message */}
        {step >= 1 && (
          <ChatBubble
            align="right"
            text="HeartConnect dating platform — need our Terms of Service reviewed before EU launch next month."
            delay={0}
          />
        )}

        {/* Catherine message */}
        {step >= 2 && (
          <ChatBubble
            align="left"
            avatar="CB"
            name="Catherine Blackwell · Managing Partner"
            text="Got it. I'm already flagging GDPR consent bundling and age verification gaps as the likely pressure points. Give me a moment to assemble the right specialists."
            delay={0}
          />
        )}

        {/* Briefing memo */}
        {step >= 3 && (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '14px 16px',
            animation: 'tourFadeUp 0.35s ease both',
          }}>
            <div style={{
              fontFamily: SANS, fontSize: 10, letterSpacing: 2,
              textTransform: 'uppercase', color: DIM, marginBottom: 10,
            }}>Briefing memo</div>
            {[
              '🔴  GDPR consent bundling risk — Section 4',
              '🔴  Age verification gap — EU Digital Services Act',
              '🟡  Algorithmic transparency required — Section 7',
            ].map((item, i) => (
              <div key={i} style={{
                fontFamily: SANS, fontSize: 13, color: TEXT,
                padding: '5px 0',
                borderTop: i > 0 ? `1px solid ${BORDER}` : 'none',
                animation: `tourFade 0.3s ease ${i * 0.15}s both`,
              }}>{item}</div>
            ))}
          </div>
        )}
      </div>
    </SlideShell>
  );
}

function ChatBubble({
  align, avatar, name, text, delay,
}: {
  align: 'left' | 'right';
  avatar?: string;
  name?: string;
  text: string;
  delay: number;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: align === 'left' ? 'row' : 'row-reverse',
      gap: 10, alignItems: 'flex-start',
      animation: `agentTyping 0.35s ease ${delay}s both`,
    }}>
      {avatar && (
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(232,132,92,0.15)', border: `1px solid rgba(232,132,92,0.3)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SERIF, fontSize: 11, color: ACCENT, letterSpacing: 0.5,
        }}>{avatar}</div>
      )}
      <div style={{ maxWidth: '80%' }}>
        {name && (
          <div style={{
            fontFamily: SANS, fontSize: 10, letterSpacing: 1,
            textTransform: 'uppercase', color: DIM, marginBottom: 5,
          }}>{name}</div>
        )}
        <div style={{
          background: align === 'right' ? 'rgba(255,255,255,0.06)' : 'rgba(232,132,92,0.07)',
          border: `1px solid ${align === 'right' ? BORDER : 'rgba(232,132,92,0.18)'}`,
          borderRadius: align === 'left' ? '0 10px 10px 10px' : '10px 0 10px 10px',
          padding: '10px 14px',
          fontFamily: SANS, fontSize: 13, lineHeight: 1.55, color: TEXT,
        }}>{text}</div>
      </div>
    </div>
  );
}

// ── Slide 3: Choose your agent team ───────────────────────────────────────
const AGENTS = [
  { initials: 'MP', name: 'Catherine Blackwell', role: 'Managing Partner', ovr: 96, highlight: true },
  { initials: 'PC', name: 'Sofia Reyes',          role: 'Privacy Counsel',   ovr: 91, highlight: false },
  { initials: 'RT', name: 'Marcus Webb',           role: 'Red Teamer',        ovr: 88, highlight: false },
  { initials: 'RP', name: 'James Okafor',          role: 'Risk Pricer',       ovr: 87, highlight: false },
  { initials: 'RC', name: 'Ingrid Hansen',         role: 'Reg. Counsel',      ovr: 89, highlight: false },
  { initials: 'PL', name: 'David Marsh',           role: 'Plain Language',    ovr: 84, highlight: false },
];

function Slide3({ isMobile }: { isMobile: boolean }) {
  return (
    <SlideShell
      narration="Sixty-six specialists."
      sub="Partners, privacy counsel, red teamers, risk pricers. You pick the bench."
      isMobile={isMobile}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        gap: 12,
      }}>
        {AGENTS.map((a, i) => (
          <div
            key={a.initials + i}
            style={{
              background: a.highlight ? 'rgba(232,132,92,0.07)' : PANEL,
              border: `1px solid ${a.highlight ? 'rgba(232,132,92,0.25)' : BORDER}`,
              borderRadius: 10, padding: '16px 14px',
              display: 'flex', flexDirection: 'column', gap: 8,
              animation: `cardFlip 0.4s ease ${0.5 + i * 0.09}s both`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: a.highlight ? 'rgba(232,132,92,0.2)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${a.highlight ? 'rgba(232,132,92,0.4)' : BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SERIF, fontSize: 11, color: a.highlight ? ACCENT : DIM,
                flexShrink: 0,
              }}>{a.initials}</div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontFamily: SANS, fontSize: 10, color: DIM, marginTop: 1 }}>{a.role}</div>
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: 8, borderTop: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontFamily: SANS, fontSize: 10, color: DIM, letterSpacing: 1 }}>OVR</span>
              <span style={{
                fontFamily: SERIF, fontSize: 20, fontWeight: 400,
                color: a.highlight ? ACCENT : TEXT,
              }}>{a.ovr}</span>
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

// ── Slide 4: Build your own agents ─────────────────────────────────────────
const SKILLS = [
  { label: 'Precision',   value: 97 },
  { label: 'Depth',       value: 94 },
  { label: 'Creativity',  value: 72 },
  { label: 'Risk',        value: 89 },
];

function Slide4({ isMobile }: { isMobile: boolean }) {
  return (
    <SlideShell
      narration="Not enough? Build your own."
      sub="Set the personality, the expertise, the face. NBA 2K-style."
      isMobile={isMobile}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 220px',
        gap: 16,
      }}>
        {/* Stat editor */}
        <div style={{
          background: PANEL, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '20px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{
            fontFamily: SANS, fontSize: 10, letterSpacing: 2,
            textTransform: 'uppercase', color: DIM,
          }}>Agent stats</div>

          {SKILLS.map((s, i) => (
            <div key={s.label} style={{
              animation: `tourFadeUp 0.35s ease ${0.5 + i * 0.1}s both`,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: 6,
              }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT }}>{s.label}</span>
                <span style={{ fontFamily: SERIF, fontSize: 16, color: TEXT }}>{s.value}</span>
              </div>
              <div style={{
                height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(232,132,92,0.5) 100%)`,
                  width: `${s.value}%`,
                  transition: 'width 1s ease',
                  animation: `barAppear 0.6s ease ${0.6 + i * 0.1}s both`,
                }} />
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 8, paddingTop: 14, borderTop: `1px solid ${BORDER}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Personality</span>
            <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT, opacity: 0.6 }}>
              Conservative ←————→ Creative
            </span>
          </div>

          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
            <div style={{
              height: '100%', width: '30%', borderRadius: 2,
              background: `linear-gradient(90deg, ${ACCENT}, rgba(232,132,92,0.5))`,
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: '30%',
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: TEXT, boxShadow: '0 0 8px rgba(255,255,255,0.4)',
            }} />
          </div>
        </div>

        {/* Live card preview */}
        {!isMobile && (
          <div style={{
            background: 'rgba(232,132,92,0.06)', border: '1px solid rgba(232,132,92,0.2)',
            borderRadius: 12, padding: '20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            animation: 'tourFade 0.5s ease 0.6s both',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(232,132,92,0.15)', border: '1px solid rgba(232,132,92,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SERIF, fontSize: 16, color: ACCENT,
            }}>TS</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 18, color: TEXT, fontWeight: 300 }}>The Surgeon</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: DIM, marginTop: 3, letterSpacing: 1 }}>CONTRACT REVIEW</div>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              paddingTop: 12, borderTop: `1px solid ${BORDER}`, width: '100%',
            }}>
              <div style={{ fontFamily: SANS, fontSize: 10, color: DIM, letterSpacing: 1 }}>OVR</div>
              <div style={{ fontFamily: SERIF, fontSize: 42, color: ACCENT, lineHeight: 1 }}>94</div>
            </div>
            <button style={{
              width: '100%', padding: '10px',
              background: 'rgba(232,132,92,0.12)', border: '1px solid rgba(232,132,92,0.3)',
              borderRadius: 8, color: ACCENT, fontFamily: SANS,
              fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
              cursor: 'pointer',
            }}>Forge Agent</button>
          </div>
        )}
      </div>
    </SlideShell>
  );
}

// ── Slide 5: Agents working ────────────────────────────────────────────────
const FEED_ITEMS = [
  { delay: 600,  icon: '🤖', color: TEXT,    label: 'Privacy Counsel',  text: 'Analysing consent bundling in Section 4.2…' },
  { delay: 2000, icon: '⚠️', color: '#FF6B6B', label: 'Finding  ·  RED',  text: 'GDPR Art. 7 — consent is bundled with ToS acceptance' },
  { delay: 3800, icon: '⚖️', color: '#F0B429', label: 'Red Teamer challenges', text: 'Is this actually non-compliant under current EU precedent?' },
  { delay: 5600, icon: '✅', color: '#69DB7C', label: 'Privacy Counsel responds', text: 'Confirmed. Art. 7(2) explicitly prohibits this pattern.' },
  { delay: 7200, icon: '🔍', color: '#74C0FC', label: 'Verification',    text: 'Legal accuracy confirmed — 0.94 confidence' },
];

function Slide5({ isMobile }: { isMobile: boolean }) {
  const [visible, setVisible] = useState<number[]>([]);
  const [cost, setCost] = useState(0);

  useEffect(() => {
    const timers = FEED_ITEMS.map((item, i) =>
      setTimeout(() => setVisible(v => [...v, i]), item.delay)
    );
    // Cost ticker
    const costTimer = setInterval(() => {
      setCost(c => {
        const next = c + 0.08;
        return next >= 4.58 ? 4.58 : Math.round(next * 100) / 100;
      });
    }, 200);
    timers.push(costTimer as unknown as ReturnType<typeof setTimeout>);
    return () => timers.forEach(t => clearTimeout(t as ReturnType<typeof setTimeout>));
  }, []);

  return (
    <SlideShell
      narration="The team works."
      sub="Agents debate, challenge each other's findings, verify."
      isMobile={isMobile}
    >
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: '20px',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {/* Cost ticker */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: DIM, letterSpacing: 1, textTransform: 'uppercase' }}>Session active</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#69DB7C',
              animation: 'pulse 1.5s ease infinite',
            }} />
            <span style={{ fontFamily: SERIF, fontSize: 18, color: TEXT }}>${cost.toFixed(2)}</span>
          </div>
        </div>

        {/* Activity feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FEED_ITEMS.map((item, i) =>
            visible.includes(i) ? (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                animation: 'agentTyping 0.3s ease both',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4 }}>{item.icon}</span>
                <div>
                  <div style={{
                    fontFamily: SANS, fontSize: 10, letterSpacing: 1,
                    textTransform: 'uppercase', color: item.color,
                    opacity: 0.8, marginBottom: 3,
                  }}>{item.label}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
                    {item.text}
                  </div>
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>
    </SlideShell>
  );
}

// ── Slide 6: The deliverable ───────────────────────────────────────────────
const METRICS = [
  { label: 'Readability',    before: 1.8, after: 3.8 },
  { label: 'Clarity',        before: 2.3, after: 3.9 },
  { label: 'Visual Design',  before: 2.5, after: 4.1 },
  { label: 'Ethics',         before: 2.0, after: 3.2 },
];

function Slide6({ isMobile }: { isMobile: boolean }) {
  return (
    <SlideShell
      narration="Two deliverables."
      sub="A transformed document and the full legal review. Every finding cited."
      isMobile={isMobile}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 14,
      }}>
        {/* Document preview */}
        <div style={{
          background: PANEL, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '20px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{
              fontFamily: SANS, fontSize: 10, letterSpacing: 2,
              textTransform: 'uppercase', color: DIM,
            }}>The Work</span>
            <span style={{
              fontFamily: SANS, fontSize: 10, letterSpacing: 1,
              padding: '3px 8px', borderRadius: 4,
              background: 'rgba(105,219,124,0.1)', color: '#69DB7C',
              border: '1px solid rgba(105,219,124,0.25)',
            }}>Grade 7.8 ✓</span>
          </div>

          <div style={{
            fontFamily: SERIF, fontSize: 17, fontWeight: 300, color: TEXT,
            lineHeight: 1.6,
          }}>
            HeartConnect Terms of Service
          </div>

          <div style={{
            fontFamily: SANS, fontSize: 13, color: DIM, lineHeight: 1.65,
          }}>
            These terms explain your rights and our obligations in plain language.
            By using HeartConnect, you agree to the following. You may stop at any time.
          </div>

          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
          }}>
            {['GDPR compliant', 'Grade 7.8', 'WCAG AA'].map(tag => (
              <span key={tag} style={{
                fontFamily: SANS, fontSize: 10, letterSpacing: 1,
                padding: '3px 8px', borderRadius: 4,
                background: PANEL, border: `1px solid ${BORDER}`, color: DIM,
              }}>{tag}</span>
            ))}
          </div>

          <button style={{
            marginTop: 'auto', padding: '11px 20px',
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
            borderRadius: 8, color: TEXT, fontFamily: SANS,
            fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
            cursor: 'pointer',
          }}>↓ Download</button>
        </div>

        {/* Scorecard */}
        <div style={{
          background: PANEL, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '20px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <span style={{
            fontFamily: SANS, fontSize: 10, letterSpacing: 2,
            textTransform: 'uppercase', color: DIM,
          }}>The Scorecard</span>

          {METRICS.map((m, i) => (
            <div key={m.label} style={{
              animation: `tourFadeUp 0.35s ease ${0.6 + i * 0.1}s both`,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: 6,
              }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT }}>{m.label}</span>
                <span style={{ fontFamily: SANS, fontSize: 12 }}>
                  <span style={{ color: DIM }}>{m.before}</span>
                  <span style={{ color: DIM, margin: '0 4px' }}>→</span>
                  <span style={{ color: '#69DB7C' }}>{m.after}</span>
                </span>
              </div>
              <div style={{
                height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Before bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${(m.before / 5) * 100}%`, borderRadius: 2,
                  background: 'rgba(255,255,255,0.15)',
                }} />
                {/* After bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${(m.after / 5) * 100}%`, borderRadius: 2,
                  background: `linear-gradient(90deg, #69DB7C, rgba(105,219,124,0.5))`,
                  animation: `barAppear 0.8s ease ${0.7 + i * 0.1}s both`,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideShell>
  );
}

// ── Slide 7: Clawern ───────────────────────────────────────────────────────
const TERM_LINES = [
  { delay: 500,  text: '⚙  Daemon started  ·  PID 42847' },
  { delay: 1400, text: '📄  vendor-nda-2025.pdf detected' },
  { delay: 2600, text: '🤖  3 agents dispatched' },
  { delay: 3800, text: '✅  Delivered  ·  $1.20  ·  1 major finding' },
];

function Slide7({
  isMobile, onExit,
}: {
  isMobile: boolean;
  onExit: () => void;
}) {
  const [lines, setLines] = useState<number[]>([]);

  useEffect(() => {
    const timers = TERM_LINES.map((l, i) =>
      setTimeout(() => setLines(v => [...v, i]), l.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '68px 24px 72px' : '72px 48px 72px',
      gap: 0,
    }}>
      {/* Narration */}
      <div style={{
        textAlign: 'center', marginBottom: isMobile ? 20 : 26,
        animation: 'tourFadeUp 0.5s ease 0.1s both',
      }}>
        <h2 style={{
          fontFamily: SERIF,
          fontSize: isMobile ? 'clamp(32px, 9vw, 48px)' : 'clamp(38px, 4.5vw, 60px)',
          fontWeight: 300, lineHeight: 1.05, letterSpacing: -1,
          color: TEXT, margin: 0, marginBottom: 12,
        }}>Leave it running.</h2>
        <p style={{
          fontFamily: SANS, fontSize: isMobile ? 13 : 15,
          color: DIM, margin: '0 auto', maxWidth: 480,
          animation: 'tourFade 0.5s ease 0.3s both',
        }}>
          Clawern watches your folders while you sleep. Drop a contract in at 11pm.
          By morning, the work is done.
        </p>
      </div>

      {/* Terminal */}
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'rgba(0,0,0,0.6)', border: `1px solid rgba(255,255,255,0.1)`,
        borderRadius: 12, padding: '16px 20px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
        fontSize: isMobile ? 12 : 13,
        marginBottom: 24,
        animation: 'tourFadeUp 0.5s ease 0.45s both',
      }}>
        {/* Terminal title bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid rgba(255,255,255,0.06)`,
        }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.8 }} />
          ))}
          <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
            lavern claw
          </span>
        </div>

        {/* Log lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TERM_LINES.map((l, i) =>
            lines.includes(i) ? (
              <div key={i} style={{
                color: i === 3 ? '#69DB7C' : 'rgba(250,249,246,0.75)',
                animation: 'terminalLine 0.25s ease both',
              }}>{l.text}</div>
            ) : null
          )}
        </div>

        {/* Budget gauge */}
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid rgba(255,255,255,0.06)`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          animation: 'tourFade 0.5s ease 4.5s both',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>Budget</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 80, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>
              <div style={{
                height: '100%', width: '9%', borderRadius: 2,
                background: '#69DB7C',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'rgba(250,249,246,0.5)' }}>4.6h / 50h</span>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
        animation: 'tourFadeUp 0.5s ease 5s both',
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); onExit(); }}
          style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 600,
            letterSpacing: 3, textTransform: 'uppercase',
            padding: '18px 48px', borderRadius: 100,
            background: TEXT, color: BG, border: 'none',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          Start a real engagement →
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open('https://lavern.ai/claw/how-it-works.html', '_blank');
          }}
          style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 600,
            letterSpacing: 3, textTransform: 'uppercase',
            padding: '18px 40px', borderRadius: 100,
            background: 'transparent', color: TEXT,
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'pointer', opacity: 0.65,
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.65'; }}
        >
          How Clawern works →
        </button>
      </div>
    </div>
  );
}
