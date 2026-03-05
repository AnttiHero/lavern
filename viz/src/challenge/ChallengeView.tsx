/**
 * ChallengeView — "The Marble Challenge."
 *
 * We will beat your lawyer.
 * Upload any legal document. We make our own version.
 * A neutral AI judge scores both blind. If yours wins, it's free.
 *
 * Dark cinematic design (same template as PricingView/BetTheCompanyView).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fonts, radii } from '../staffing/styles/tokens.js';
import { useChallengeState } from './useChallengeState.js';
import type { DimensionScore } from './useChallengeState.js';

// -- Confetti engine (zero dependencies) ----------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  decay: number;
}

const CONFETTI_COLORS = [
  '#B8960B', '#D4AF37', '#FFD700', '#E8C547',   // golds
  'rgba(250, 249, 246, 0.9)',                      // white
  'rgba(250, 249, 246, 0.5)',                      // dim white
];

function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animFrame = useRef<number>(0);

  const fire = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Spawn ~120 particles from center-top
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.35;
    for (let i = 0; i < 120; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 8;
      particles.current.push({
        x: cx + (Math.random() - 0.5) * 100,
        y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        width: 6 + Math.random() * 6,
        height: 3 + Math.random() * 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        opacity: 1,
        decay: 0.008 + Math.random() * 0.008,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current = particles.current.filter(p => p.opacity > 0.01);

      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;
        p.opacity -= p.decay;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      }

      if (particles.current.length > 0) {
        animFrame.current = requestAnimationFrame(animate);
      }
    };

    cancelAnimationFrame(animFrame.current);
    animate();
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  return { canvasRef, fire };
}

interface Props {
  onBack: () => void;
}

// -- Dark palette -------------------------------------------------------------

const D = {
  bg: '#0A0A0F',
  surface: 'rgba(250, 249, 246, 0.05)',
  surfaceLight: 'rgba(250, 249, 246, 0.10)',
  border: 'rgba(250, 249, 246, 0.10)',
  borderHover: 'rgba(250, 249, 246, 0.25)',
  gold: '#B8960B',
  goldDim: 'rgba(184, 150, 11, 0.5)',
  goldFaint: 'rgba(184, 150, 11, 0.15)',
  text: 'rgba(250, 249, 246, 0.85)',
  textDim: 'rgba(250, 249, 246, 0.6)',
  textFaint: 'rgba(250, 249, 246, 0.35)',
  white: 'rgba(250, 249, 246, 0.92)',
  green: '#4ade80',
  red: '#f87171',
};

// Types are imported from useChallengeState

// -- Section wrapper ----------------------------------------------------------

function Section({
  label,
  delay = 0,
  children,
}: {
  label: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...sty.section,
        animation: `chFadeIn 0.6s ease ${delay}s both`,
      }}
    >
      <div style={sty.sectionHeader}>
        <span style={sty.sectionRule} />
        <span style={sty.sectionLabel}>{label}</span>
        <span style={sty.sectionRule} />
      </div>
      {children}
    </div>
  );
}

// -- Dimension Bar ------------------------------------------------------------

function DimensionBar({
  dim,
  assignment,
  revealed,
  delay,
}: {
  dim: DimensionScore;
  assignment: { A: 'human' | 'marble'; B: 'human' | 'marble' } | null;
  revealed: boolean;
  delay: number;
}) {
  const maxScore = Math.max(dim.scoreA, dim.scoreB);
  const aWins = dim.scoreA > dim.scoreB;
  const bWins = dim.scoreB > dim.scoreA;

  const labelA = revealed && assignment
    ? (assignment.A === 'marble' ? 'MARBLE' : 'YOUR LAWYER')
    : 'DOCUMENT A';
  const labelB = revealed && assignment
    ? (assignment.B === 'marble' ? 'MARBLE' : 'YOUR LAWYER')
    : 'DOCUMENT B';

  const colorA = revealed && assignment
    ? (assignment.A === 'marble' ? D.gold : D.textDim)
    : D.textDim;
  const colorB = revealed && assignment
    ? (assignment.B === 'marble' ? D.gold : D.textDim)
    : D.textDim;

  return (
    <div style={{ ...sty.dimCard, animation: `chFadeIn 0.5s ease ${delay}s both` }}>
      <div style={sty.dimName}>{dim.name}</div>
      <div style={sty.dimDesc}>{dim.description}</div>
      <div style={sty.dimBars}>
        {/* Bar A */}
        <div style={sty.dimBarRow}>
          <span style={{ ...sty.dimBarLabel, color: colorA }}>{labelA}</span>
          <div style={sty.dimBarTrack}>
            <div
              style={{
                ...sty.dimBarFill,
                width: `${dim.scoreA}%`,
                backgroundColor: aWins ? D.gold : D.textFaint,
                transition: 'width 1s ease, background-color 0.5s ease',
              }}
            />
          </div>
          <span style={{ ...sty.dimBarScore, color: aWins ? D.gold : D.textDim }}>
            {dim.scoreA}
          </span>
        </div>
        {/* Bar B */}
        <div style={sty.dimBarRow}>
          <span style={{ ...sty.dimBarLabel, color: colorB }}>{labelB}</span>
          <div style={sty.dimBarTrack}>
            <div
              style={{
                ...sty.dimBarFill,
                width: `${dim.scoreB}%`,
                backgroundColor: bWins ? D.gold : D.textFaint,
                transition: 'width 1s ease, background-color 0.5s ease',
              }}
            />
          </div>
          <span style={{ ...sty.dimBarScore, color: bWins ? D.gold : D.textDim }}>
            {dim.scoreB}
          </span>
        </div>
      </div>
    </div>
  );
}

// -- UploadZone helper --------------------------------------------------------

function UploadZone({
  label,
  prompt,
  upload,
}: {
  label: string;
  prompt: string;
  upload: ReturnType<typeof useChallengeState>['marbleUpload'];
}) {
  const hasDoc = upload.documents.length > 0;
  const docName = upload.documents[0]?.name ?? '';

  return (
    <div style={{ flex: 1 }}>
      <div style={sty.uploadLabel}>{label}</div>
      <div
        style={{
          ...sty.dropZone,
          borderColor: upload.isDragOver ? D.gold : hasDoc ? D.borderHover : D.border,
          backgroundColor: upload.isDragOver ? D.goldFaint : D.surface,
        }}
        onDrop={upload.handleDrop}
        onDragOver={upload.handleDragOver}
        onDragLeave={upload.handleDragLeave}
        onClick={!hasDoc ? upload.openFilePicker : undefined}
      >
        <input
          ref={upload.inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html"
          style={{ display: 'none' }}
          onChange={upload.handleFileInput}
        />
        {hasDoc ? (
          <div style={sty.docReady}>
            <div style={sty.docIcon}>{'\uD83D\uDCC4'}</div>
            <div style={sty.docName}>{docName}</div>
            <div style={sty.docMeta}>
              {upload.parsedDocuments[0]
                ? `${upload.parsedDocuments[0].wordCount.toLocaleString()} words`
                : upload.parsing ? 'Parsing...' : 'Ready'}
            </div>
          </div>
        ) : (
          <div style={sty.dropPrompt}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>{'+'}</div>
            <div style={sty.dropText}>{prompt}</div>
            <div style={sty.dropHint}>PDF, DOCX, TXT, MD, HTML</div>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Main component -----------------------------------------------------------

export default function ChallengeView({ onBack }: Props) {
  const [backHover, setBackHover] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);
  const [revealCtaHover, setRevealCtaHover] = useState(false);
  const [envelopeOpen, setEnvelopeOpen] = useState(false);
  const { canvasRef, fire: fireConfetti } = useConfetti();

  const {
    phase,
    result,
    revealed,
    error: displayError,
    bothReady,
    eitherParsing,
    marbleUpload,
    humanUpload,
    acceptChallenge,
    doReveal,
  } = useChallengeState();

  // Fire confetti when result phase starts
  useEffect(() => {
    if (phase === 'result' && result?.winner === 'marble') {
      fireConfetti();
    }
  }, [phase, result?.winner, fireConfetti]);

  const handleReveal = useCallback(() => {
    setEnvelopeOpen(true);
    // Brief pause for envelope animation, then reveal identities
    setTimeout(() => {
      doReveal();
      // Fire confetti on any reveal (will also fire again on result for marble wins)
      fireConfetti();
    }, 600);
  }, [doReveal, fireConfetti]);

  return (
    <div style={sty.page}>
      {/* Background layers */}
      <div style={sty.marbleBg}>
        <img
          src="/marble-texture.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div style={sty.veil} />
      <div style={sty.goldGlow} />

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          ...sty.backBtn,
          color: backHover ? D.white : D.textDim,
          borderColor: backHover ? D.borderHover : D.border,
        }}
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
      >
        {'\u2190'} Back
      </button>

      {/* Confetti canvas — full viewport overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      />

      <style>{`
        @keyframes chFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes chEnvelope {
          from { transform: scale(0.8) rotateY(90deg); opacity: 0; }
          to { transform: scale(1) rotateY(0deg); opacity: 1; }
        }
        @keyframes chEnvelopeOpen {
          0% { transform: scale(1) rotate(0deg); }
          30% { transform: scale(1.15) rotate(-3deg); }
          60% { transform: scale(1.3) rotate(2deg); filter: brightness(1.5); }
          100% { transform: scale(1) rotate(0deg); opacity: 0; }
        }
        @keyframes chGoldShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes chScoreCount {
          from { opacity: 0; transform: scale(0.3); }
          50% { transform: scale(1.15); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes chWinnerGlow {
          0%, 100% { text-shadow: 0 0 20px rgba(184, 150, 11, 0.3); }
          50% { text-shadow: 0 0 40px rgba(184, 150, 11, 0.6), 0 0 80px rgba(184, 150, 11, 0.2); }
        }
      `}</style>

      {/* Content */}
      <div style={sty.container}>
        {/* ── Hero ───────────────────────────────────── */}
        <div style={{ ...sty.header, animation: 'chFadeIn 0.6s ease 0.1s both' }}>
          <h1 style={sty.logoWrap}>MARBLE</h1>
          <div style={sty.rule} />
          <h2 style={sty.heroTitle}>The Marble Challenge</h2>
          <p style={sty.heroSubtitle}>We will beat your lawyer.</p>
        </div>

        {/* ── Rules ──────────────────────────────────── */}
        {phase === 'idle' && (
          <Section label="The Rules" delay={0.2}>
            <div style={sty.rulesGrid}>
              <div style={sty.ruleCard}>
                <div style={sty.ruleNum}>1</div>
                <div style={sty.ruleText}>Upload the Marble-created document and the human-created document.</div>
              </div>
              <div style={sty.ruleCard}>
                <div style={sty.ruleNum}>2</div>
                <div style={sty.ruleText}>A neutral AI judge scores both blind. Neither side knows which is which.</div>
              </div>
              <div style={sty.ruleCard}>
                <div style={sty.ruleNum}>3</div>
                <div style={sty.ruleText}>The envelope opens. Identities revealed.</div>
              </div>
              <div style={sty.ruleCard}>
                <div style={sty.ruleNum}>4</div>
                <div style={sty.ruleText}>If your lawyer wins, the engagement is free.</div>
              </div>
            </div>
            <p style={sty.bravado}>{"We've never lost."}</p>
          </Section>
        )}

        {/* ── Two Upload Zones ────────────────────────── */}
        {phase === 'idle' && (
          <Section label="The Documents" delay={0.3}>
            <div style={sty.uploadRow}>
              <UploadZone
                label="MARBLE"
                prompt="Drop the Marble document"
                upload={marbleUpload}
              />
              <div style={sty.uploadVs}>vs</div>
              <UploadZone
                label="YOUR LAWYER"
                prompt="Drop the human document"
                upload={humanUpload}
              />
            </div>
            {displayError && (
              <div style={{ color: D.red, fontSize: 12, marginTop: 12, fontFamily: fonts.sans, textAlign: 'center' as const }}>
                {displayError}
              </div>
            )}
          </Section>
        )}

        {/* ── Accept CTA ─────────────────────────────── */}
        {phase === 'idle' && bothReady && (
          <div style={{ textAlign: 'center', animation: 'chFadeIn 0.5s ease 0.1s both' }}>
            <button
              onClick={acceptChallenge}
              disabled={eitherParsing}
              style={{
                ...sty.acceptBtn,
                backgroundColor: ctaHover ? D.gold : 'transparent',
                color: ctaHover ? '#0A0A0F' : D.gold,
                borderColor: D.gold,
                opacity: eitherParsing ? 0.4 : 1,
              }}
              onMouseEnter={() => setCtaHover(true)}
              onMouseLeave={() => setCtaHover(false)}
            >
              Accept the Challenge
            </button>
          </div>
        )}

        {/* ── Processing ─────────────────────────────── */}
        {phase === 'processing' && (
          <Section label="The Judge Is Deliberating" delay={0.1}>
            <div style={sty.processingCard}>
              <div style={sty.pulseOrb} />
              <div style={sty.processingStep}>
                Opus is scoring both documents blind...
              </div>
            </div>
          </Section>
        )}

        {/* ── Blind Comparison ───────────────────────── */}
        {(phase === 'reveal' || phase === 'result') && result && (
          <>
            <Section label="The Verdict" delay={0.1}>
              <div style={sty.dimList}>
                {result.dimensions.map((dim, i) => (
                  <DimensionBar
                    key={dim.name}
                    dim={dim}
                    assignment={revealed ? result.assignment : null}
                    revealed={revealed}
                    delay={0.1 + i * 0.1}
                  />
                ))}
              </div>

              {/* Overall scores */}
              <div style={{ ...sty.overallRow, animation: 'chFadeIn 0.5s ease 0.8s both' }}>
                <div style={sty.overallCol}>
                  <div style={{
                    ...sty.overallLabel,
                    ...(revealed && result.assignment.A === 'marble' ? {
                      color: D.gold,
                      fontWeight: 800,
                    } : {}),
                    transition: 'all 0.5s ease',
                  }}>
                    {revealed
                      ? (result.assignment.A === 'marble' ? 'MARBLE' : 'YOUR LAWYER')
                      : 'DOCUMENT A'}
                  </div>
                  <div style={{
                    ...sty.overallScore,
                    color: result.overallA > result.overallB ? D.gold : D.textDim,
                    animation: revealed ? 'chScoreCount 0.6s ease both' : undefined,
                  }}>
                    {result.overallA}
                  </div>
                </div>
                <div style={sty.overallVs}>vs</div>
                <div style={sty.overallCol}>
                  <div style={{
                    ...sty.overallLabel,
                    ...(revealed && result.assignment.B === 'marble' ? {
                      color: D.gold,
                      fontWeight: 800,
                    } : {}),
                    transition: 'all 0.5s ease',
                  }}>
                    {revealed
                      ? (result.assignment.B === 'marble' ? 'MARBLE' : 'YOUR LAWYER')
                      : 'DOCUMENT B'}
                  </div>
                  <div style={{
                    ...sty.overallScore,
                    color: result.overallB > result.overallA ? D.gold : D.textDim,
                    animation: revealed ? 'chScoreCount 0.6s ease 0.15s both' : undefined,
                  }}>
                    {result.overallB}
                  </div>
                </div>
              </div>
            </Section>

            {/* Reveal button — the envelope */}
            {!revealed && phase === 'reveal' && (
              <div style={{
                textAlign: 'center',
                animation: envelopeOpen ? 'chEnvelopeOpen 0.8s ease forwards' : 'chFadeIn 0.5s ease 1s both',
              }}>
                <div style={sty.envelopeIcon}>
                  {envelopeOpen ? '\u2709\uFE0F' : '\u2709'}
                </div>
                <button
                  onClick={handleReveal}
                  disabled={envelopeOpen}
                  style={{
                    ...sty.revealBtn,
                    backgroundColor: revealCtaHover ? D.gold : 'transparent',
                    color: revealCtaHover ? '#0A0A0F' : D.gold,
                    opacity: envelopeOpen ? 0.5 : 1,
                  }}
                  onMouseEnter={() => setRevealCtaHover(true)}
                  onMouseLeave={() => setRevealCtaHover(false)}
                >
                  {envelopeOpen ? 'Opening...' : 'Open the Envelope'}
                </button>
              </div>
            )}

            {/* Result banner */}
            {phase === 'result' && (
              <div style={{ ...sty.resultBanner, animation: 'chEnvelope 0.8s ease 0.2s both' }}>
                {result.winner === 'marble' && (
                  <>
                    <div style={{
                      ...sty.resultTitle,
                      animation: 'chWinnerGlow 2s ease-in-out infinite',
                    }}>
                      As expected.
                    </div>
                    <div style={sty.resultSummary}>{result.summary}</div>
                    <button
                      onClick={() => { window.location.hash = '#/quickstart'; }}
                      style={sty.resultCta}
                    >
                      Ready to hire us?
                    </button>
                  </>
                )}
                {result.winner === 'human' && (
                  <>
                    <div style={sty.resultTitle}>You win. We pay.</div>
                    <div style={sty.resultSummary}>
                      {"This doesn't happen often. Your refund is on the way."}
                    </div>
                    <div style={sty.resultSummary}>{result.summary}</div>
                  </>
                )}
                {result.winner === 'tie' && (
                  <>
                    <div style={sty.resultTitle}>Dead heat.</div>
                    <div style={sty.resultSummary}>
                      {"We'll take that as a win. Your lawyer charges more."}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Footer ─────────────────────────────────── */}
        <div style={{ ...sty.footer, animation: 'chFadeIn 0.4s ease 0.8s both' }}>
          <span style={sty.footerText}>{'MARBLE \u00B7 THE CHALLENGE'}</span>
        </div>
      </div>
    </div>
  );
}

// -- Styles -------------------------------------------------------------------

const sty: Record<string, React.CSSProperties> = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    backgroundColor: D.bg,
    color: D.text,
    fontFamily: fonts.sans,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  marbleBg: {
    position: 'fixed',
    inset: 0,
    filter: 'brightness(0.1) contrast(1.1) saturate(0.15)',
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  veil: {
    position: 'fixed',
    inset: 0,
    background:
      'radial-gradient(ellipse 80% 60% at center top, transparent 0%, rgba(10, 10, 15, 0.7) 100%)',
    pointerEvents: 'none' as const,
  },
  goldGlow: {
    position: 'fixed',
    top: -200,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 600,
    height: 400,
    background:
      'radial-gradient(ellipse at center, rgba(184, 150, 11, 0.06) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  container: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 800,
    margin: '0 auto',
    padding: '80px 48px 120px',
  },
  backBtn: {
    position: 'fixed' as const,
    top: 28,
    left: 36,
    zIndex: 100,
    padding: '6px 16px',
    border: `1.5px solid ${D.border}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'color 0.25s ease, border-color 0.25s ease',
  },

  // Hero
  header: {
    textAlign: 'center' as const,
    marginBottom: 48,
    paddingTop: 24,
  },
  logoWrap: {
    fontSize: 72,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    margin: 0,
    letterSpacing: 16,
    textTransform: 'uppercase' as const,
  },
  rule: {
    width: 60,
    height: 2,
    backgroundColor: D.gold,
    margin: '28px auto',
    opacity: 0.6,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 300,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: D.gold,
    margin: 0,
    letterSpacing: 1,
  },
  heroSubtitle: {
    fontSize: 18,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: D.white,
    margin: '16px auto 0',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },

  // Section
  section: {
    marginBottom: 48,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: D.border,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 3,
    color: D.textDim,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
    flexShrink: 0,
  },

  // Rules
  rulesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 20,
  },
  ruleCard: {
    display: 'flex',
    gap: 14,
    padding: '18px 20px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    alignItems: 'flex-start',
  },
  ruleNum: {
    fontSize: 20,
    fontFamily: fonts.mono,
    color: D.goldDim,
    fontWeight: 600,
    lineHeight: 1,
    flexShrink: 0,
  },
  ruleText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.text,
    lineHeight: 1.5,
  },
  bravado: {
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: D.gold,
    textAlign: 'center' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginTop: 8,
  },

  // Upload row (two zones side by side)
  uploadRow: {
    display: 'flex',
    gap: 24,
    alignItems: 'stretch',
  },
  uploadVs: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textFaint,
    fontStyle: 'italic' as const,
    flexShrink: 0,
  },
  uploadLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
    color: D.textDim,
    marginBottom: 10,
    textAlign: 'center' as const,
  },

  // Upload
  dropZone: {
    padding: 40,
    border: `2px dashed ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'border-color 0.3s ease, background-color 0.3s ease',
  },
  dropPrompt: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
  },
  dropText: {
    fontSize: 15,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: D.text,
  },
  dropHint: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textFaint,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  docReady: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
  },
  docIcon: {
    fontSize: 32,
  },
  docName: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
  },
  docMeta: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: D.textDim,
  },

  // Accept CTA
  acceptBtn: {
    padding: '12px 32px',
    border: `2px solid ${D.gold}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: D.gold,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: 8,
  },

  // Processing
  processingCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 20,
    padding: 48,
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
  pulseOrb: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${D.gold} 0%, transparent 70%)`,
    animation: 'chPulse 2s ease-in-out infinite',
  },
  processingStep: {
    fontSize: 15,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: D.text,
    textAlign: 'center' as const,
    minHeight: 24,
  },
  processingDots: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },

  // Dimension bars
  dimList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  dimCard: {
    padding: '16px 20px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
  dimName: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
    marginBottom: 2,
  },
  dimDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textDim,
    marginBottom: 12,
  },
  dimBars: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  dimBarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  dimBarLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    width: 100,
    flexShrink: 0,
  },
  dimBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(250, 249, 246, 0.04)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  dimBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  dimBarScore: {
    fontSize: 14,
    fontFamily: fonts.mono,
    fontWeight: 600,
    width: 32,
    textAlign: 'right' as const,
    flexShrink: 0,
  },

  // Overall
  overallRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    marginTop: 32,
    padding: '24px 0',
    borderTop: `1px solid ${D.border}`,
  },
  overallCol: {
    textAlign: 'center' as const,
  },
  overallLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: D.textDim,
    marginBottom: 6,
  },
  overallScore: {
    fontSize: 48,
    fontFamily: fonts.serif,
    fontWeight: 300,
  },
  overallVs: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textFaint,
    fontStyle: 'italic' as const,
  },

  // Reveal
  envelopeIcon: {
    fontSize: 56,
    marginBottom: 16,
    filter: 'grayscale(0.3)',
    transition: 'transform 0.3s ease',
  },
  revealBtn: {
    padding: '14px 36px',
    border: `2px solid ${D.gold}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: D.gold,
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: 16,
  },

  // Result
  resultBanner: {
    textAlign: 'center' as const,
    padding: '48px 32px',
    border: `1px solid ${D.gold}`,
    borderRadius: radii.md,
    backgroundColor: D.goldFaint,
    marginTop: 32,
  },
  resultTitle: {
    fontSize: 36,
    fontFamily: fonts.serif,
    fontWeight: 300,
    fontStyle: 'italic' as const,
    color: D.gold,
    marginBottom: 16,
  },
  resultSummary: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.text,
    lineHeight: 1.7,
    maxWidth: 500,
    margin: '0 auto 16px',
  },
  resultCta: {
    padding: '10px 24px',
    border: `1.5px solid ${D.gold}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: D.gold,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: 8,
  },

  // Footer
  footer: {
    textAlign: 'center' as const,
    paddingTop: 32,
    marginTop: 24,
    borderTop: `1px solid ${D.border}`,
  },
  footerText: {
    fontSize: 10,
    fontWeight: 500,
    color: D.textFaint,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
  },
};
