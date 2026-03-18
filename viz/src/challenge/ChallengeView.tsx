/**
 * ChallengeView — "The Lavern Challenge."
 *
 * We will beat your lawyer.
 * Upload any legal document. We make our own version.
 * A neutral AI judge scores both blind. If yours wins, it's free.
 *
 * Dark cinematic design (same template as PricingView).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fonts, radii } from '../staffing/styles/tokens.js';
import { useChallengeState } from './useChallengeState.js';
import type { DimensionScore, ComparisonResult } from './useChallengeState.js';

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

// -- Share card image renderer (canvas-based PNG export) -----------------------

function renderShareCardToCanvas(result: ComparisonResult): HTMLCanvasElement {
  const W = 1200;
  const H = 630; // LinkedIn recommended image size
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0A0A0F';
  ctx.fillRect(0, 0, W, H);

  // Subtle gold vignette
  const grad = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.6);
  grad.addColorStop(0, 'rgba(184, 150, 11, 0.06)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Gold border
  ctx.strokeStyle = 'rgba(184, 150, 11, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Header: LAVERN | THE CHALLENGE
  ctx.fillStyle = 'rgba(250, 249, 246, 0.92)';
  ctx.font = '400 16px "Cormorant Garamond", Georgia, serif';
  ctx.letterSpacing = '6px';
  ctx.textAlign = 'center';
  ctx.fillText('LAVERN', W / 2 - 80, 72);
  ctx.fillStyle = 'rgba(250, 249, 246, 0.35)';
  ctx.fillRect(W / 2 - 18, 60, 1, 16);
  ctx.fillStyle = 'rgba(250, 249, 246, 0.6)';
  ctx.font = '600 10px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('THE CHALLENGE', W / 2 + 70, 72);

  // Headline
  const headline = result.winner === 'lavern' ? 'As expected.'
    : result.winner === 'human' ? "Credit where it's due."
    : 'Dead heat.';
  ctx.fillStyle = '#B8960B';
  ctx.font = 'italic 300 42px "Cormorant Garamond", Georgia, serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(headline, W / 2, 130);

  // Divider line
  ctx.fillStyle = 'rgba(250, 249, 246, 0.10)';
  ctx.fillRect(100, 155, W - 200, 1);

  // Score face-off
  const mScore = result.assignment.A === 'lavern' ? result.overallA : result.overallB;
  const cScore = result.assignment.A === 'human' ? result.overallA : result.overallB;

  // LAVERN score
  ctx.fillStyle = result.winner === 'lavern' ? '#B8960B' : 'rgba(250, 249, 246, 0.6)';
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('LAVERN', W / 2 - 160, 200);
  ctx.font = '300 72px "Cormorant Garamond", Georgia, serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(String(mScore), W / 2 - 160, 275);

  // vs
  ctx.fillStyle = 'rgba(250, 249, 246, 0.35)';
  ctx.font = 'italic 16px Inter, system-ui, sans-serif';
  ctx.fillText('vs', W / 2, 250);

  // CHALLENGER score
  ctx.fillStyle = result.winner === 'human' ? '#B8960B' : 'rgba(250, 249, 246, 0.6)';
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('CHALLENGER', W / 2 + 160, 200);
  ctx.font = '300 72px "Cormorant Garamond", Georgia, serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(String(cScore), W / 2 + 160, 275);

  // Divider
  ctx.fillStyle = 'rgba(250, 249, 246, 0.10)';
  ctx.fillRect(100, 300, W - 200, 1);

  // Dimension scores — compact two-column
  const dims = result.dimensions;
  const colW = 500;
  const startY = 330;
  const rowH = 28;
  const leftX = W / 2 - colW / 2;

  ctx.textAlign = 'right';
  for (let i = 0; i < dims.length; i++) {
    const y = startY + i * rowH;
    const dm = result.assignment.A === 'lavern' ? dims[i].scoreA : dims[i].scoreB;
    const dc = result.assignment.A === 'human' ? dims[i].scoreA : dims[i].scoreB;
    const mWins = dm > dc;

    // Dimension name
    ctx.fillStyle = 'rgba(250, 249, 246, 0.6)';
    ctx.font = '400 13px Inter, system-ui, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText(dims[i].name, leftX + 240, y);

    // Lavern score
    ctx.fillStyle = mWins ? '#B8960B' : 'rgba(250, 249, 246, 0.6)';
    ctx.font = '600 14px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(dm), leftX + 290, y);

    // Dash
    ctx.fillStyle = 'rgba(250, 249, 246, 0.35)';
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.fillText('\u2013', leftX + 325, y);

    // Challenger score
    ctx.fillStyle = !mWins ? '#B8960B' : 'rgba(250, 249, 246, 0.6)';
    ctx.font = '600 14px "SF Mono", "Fira Code", monospace';
    ctx.fillText(String(dc), leftX + 360, y);

    ctx.textAlign = 'right';
  }

  // Summary (wrap text)
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(250, 249, 246, 0.85)';
  ctx.font = '400 14px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '0px';
  const summary = result.summary;
  const maxLineW = W - 200;
  const words = summary.split(' ');
  let line = '';
  let sumY = 520;
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxLineW && line) {
      ctx.fillText(line, W / 2, sumY);
      line = word;
      sumY += 20;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, W / 2, sumY);

  // Footer
  ctx.fillStyle = 'rgba(250, 249, 246, 0.10)';
  ctx.fillRect(100, H - 55, W - 200, 1);
  ctx.fillStyle = 'rgba(250, 249, 246, 0.35)';
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('LAVERN.LAW  \u00B7  BLIND AI COMPARISON', W / 2, H - 32);

  return canvas;
}

function downloadShareCard(result: ComparisonResult) {
  const canvas = renderShareCardToCanvas(result);
  const link = document.createElement('a');
  link.download = 'lavern-challenge-result.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function shareOnLinkedIn(result: ComparisonResult) {
  const mScore = result.assignment.A === 'lavern' ? result.overallA : result.overallB;
  const cScore = result.assignment.A === 'human' ? result.overallA : result.overallB;
  const n = result.dimensions.length;
  let text: string;
  if (result.winner === 'lavern') {
    text = `Lavern ${mScore} \u2013 ${cScore} Challenger.\n\nBlind comparison. ${n} dimensions. Independent AI judge. Neither side knew which document was which.\n\nTry the Lavern Challenge \u2192 lavern.law/challenge`;
  } else if (result.winner === 'human') {
    text = `Lavern ${mScore} \u2013 ${cScore} Challenger.\n\nWe lost. Blind comparison, ${n} dimensions, independent judge. We publish every result \u2014 wins and losses. The engagement was free.\n\nThink you can beat us too? \u2192 lavern.law/challenge`;
  } else {
    text = `Lavern ${mScore} \u2013 ${cScore} Challenger.\n\nDead heat. ${n} dimensions, blind comparison, independent judge. Neither blinked.\n\nTry the Lavern Challenge \u2192 lavern.law/challenge`;
  }
  const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://lavern.law/challenge')}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
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
  assignment: { A: 'human' | 'lavern'; B: 'human' | 'lavern' } | null;
  revealed: boolean;
  delay: number;
}) {
  const maxScore = Math.max(dim.scoreA, dim.scoreB);
  const aWins = dim.scoreA > dim.scoreB;
  const bWins = dim.scoreB > dim.scoreA;

  const labelA = revealed && assignment
    ? (assignment.A === 'lavern' ? 'LAVERN' : 'CHALLENGER')
    : 'DOCUMENT A';
  const labelB = revealed && assignment
    ? (assignment.B === 'lavern' ? 'LAVERN' : 'CHALLENGER')
    : 'DOCUMENT B';

  const colorA = revealed && assignment
    ? (assignment.A === 'lavern' ? D.gold : D.textDim)
    : D.textDim;
  const colorB = revealed && assignment
    ? (assignment.B === 'lavern' ? D.gold : D.textDim)
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
  upload: ReturnType<typeof useChallengeState>['lavernUpload'];
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
  const [shareHover, setShareHover] = useState(false);
  const [dlHover, setDlHover] = useState(false);
  const { canvasRef, fire: fireConfetti } = useConfetti();
  const fogRef = useRef<HTMLDivElement>(null);

  // Fog of war — dark mist at bottom, dissolves on scroll
  useEffect(() => {
    const onScroll = () => {
      if (!fogRef.current) return;
      const t = Math.min(1, window.scrollY / 300);
      fogRef.current.style.opacity = String(1 - t);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const {
    phase,
    result,
    revealed,
    error: displayError,
    bothReady,
    eitherParsing,
    lavernUpload,
    humanUpload,
    lavernSessionText,
    lavernSessionTitle,
    loadLavernFromSession,
    acceptChallenge,
    doReveal,
    retry,
  } = useChallengeState();

  // Fire confetti when result phase starts
  useEffect(() => {
    if (phase === 'result' && result?.winner === 'lavern') {
      fireConfetti();
    }
  }, [phase, result?.winner, fireConfetti]);

  const handleReveal = useCallback(() => {
    setEnvelopeOpen(true);
    // Brief pause for envelope animation, then reveal identities
    setTimeout(() => {
      doReveal();
      // Fire confetti on any reveal (will also fire again on result for lavern wins)
      fireConfetti();
    }, 600);
  }, [doReveal, fireConfetti]);

  return (
    <div style={sty.page}>
      {/* Background layers */}
      <div style={sty.darkBg} />
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
          <h1 style={sty.logoWrap}>LAVERN</h1>
          <div style={sty.rule} />
          <h2 style={sty.heroTitle}>The Lavern Challenge</h2>
          <p style={sty.heroSubtitle}>We will beat your lawyer. And their AI.</p>
        </div>

        {/* ── Rules ──────────────────────────────────── */}
        {phase === 'idle' && (
          <Section label="The Rules" delay={0.2}>
            <div style={sty.rulesGrid}>
              <div style={sty.ruleCard}>
                <div style={sty.ruleNum}>1</div>
                <div style={sty.ruleText}>Upload the Lavern version and the challenger. Your lawyer, Harvey, Legora. Anyone.</div>
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
                <div style={sty.ruleText}>If the challenger wins, the engagement is free.</div>
              </div>
            </div>
            <p style={sty.bravado}>{"We don't like to lose. Luckily, it doesn't happen often."}</p>
          </Section>
        )}

        {/* ── Two Upload Zones ────────────────────────── */}
        {phase === 'idle' && (
          <Section label="The Documents" delay={0.3}>
            <div style={sty.uploadRow}>
              {lavernSessionText ? (
                <div style={{
                  flex: 1,
                  border: `1px solid ${D.gold}`,
                  borderRadius: radii.md,
                  padding: '24px 20px',
                  textAlign: 'center' as const,
                  background: 'rgba(184, 150, 11, 0.08)',
                }}>
                  <div style={{ color: D.gold, fontSize: 11, fontWeight: 700, letterSpacing: 2, fontFamily: fonts.sans, marginBottom: 8 }}>LAVERN</div>
                  <div style={{ color: D.white, fontSize: 14, fontFamily: fonts.sans }}>{lavernSessionTitle}</div>
                  <div style={{ color: D.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 4 }}>{lavernSessionText.length.toLocaleString()} chars loaded from session</div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  <UploadZone
                    label="LAVERN"
                    prompt="Drop the Lavern document"
                    upload={lavernUpload}
                  />
                  <button
                    onClick={loadLavernFromSession}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: D.gold,
                      fontSize: 12,
                      fontFamily: fonts.sans,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 4,
                    }}
                  >
                    or load from active session
                  </button>
                </div>
              )}
              <div style={sty.uploadVs}>vs</div>
              <UploadZone
                label="THE CHALLENGER"
                prompt="Drop the challenger's document"
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

        {/* ── Processing skeleton ──────────────────────── */}
        {phase === 'processing' && (
          <Section label="The Judge Is Deliberating" delay={0.1}>
            <div style={sty.processingCard}>
              <div style={sty.pulseOrb} />
              <div style={sty.processingStep}>
                The judge is scoring both documents blind...
              </div>
              {/* Skeleton bars mimicking dimension scores */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column' as const, gap: 10, marginTop: 12 }}>
                {[0.7, 0.5, 0.85, 0.6, 0.75].map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 80,
                      height: 10,
                      borderRadius: 4,
                      backgroundColor: 'rgba(250, 249, 246, 0.06)',
                      animation: `chPulse 2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                    <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(250, 249, 246, 0.04)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${w * 100}%`,
                        height: '100%',
                        borderRadius: 4,
                        backgroundColor: 'rgba(184, 150, 11, 0.15)',
                        animation: `chPulse 2s ease-in-out ${i * 0.15}s infinite`,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── Error state ────────────────────────────────── */}
        {phase === 'error' && (
          <Section label="Something Went Wrong" delay={0.1}>
            <div style={{
              ...sty.processingCard,
              borderColor: D.red,
            }}>
              <div style={{
                fontSize: 32,
                marginBottom: 4,
              }}>
                {'\u26A0'}
              </div>
              <div style={{
                fontSize: 15,
                fontFamily: fonts.serif,
                color: D.text,
                textAlign: 'center' as const,
                maxWidth: 400,
                lineHeight: 1.6,
              }}>
                {displayError || 'The challenge could not be completed. Please try again.'}
              </div>
              <button
                onClick={retry}
                style={{
                  ...sty.acceptBtn,
                  marginTop: 16,
                  backgroundColor: 'transparent',
                  color: D.gold,
                  borderColor: D.gold,
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = D.gold;
                  (e.target as HTMLButtonElement).style.color = '#0A0A0F';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.target as HTMLButtonElement).style.color = D.gold;
                }}
              >
                Try Again
              </button>
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
                    ...(revealed && result.assignment.A === 'lavern' ? {
                      color: D.gold,
                      fontWeight: 800,
                    } : {}),
                    transition: 'all 0.5s ease',
                  }}>
                    {revealed
                      ? (result.assignment.A === 'lavern' ? 'LAVERN' : 'CHALLENGER')
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
                    ...(revealed && result.assignment.B === 'lavern' ? {
                      color: D.gold,
                      fontWeight: 800,
                    } : {}),
                    transition: 'all 0.5s ease',
                  }}>
                    {revealed
                      ? (result.assignment.B === 'lavern' ? 'LAVERN' : 'CHALLENGER')
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

            {/* Result share card — designed to be screenshot-worthy for LinkedIn */}
            {phase === 'result' && (
              <div style={{ ...sty.shareCard, animation: 'chEnvelope 0.8s ease 0.2s both' }}>
                {/* Card header — Lavern branding */}
                <div style={sty.shareCardHeader}>
                  <span style={sty.shareCardLogo}>LAVERN</span>
                  <span style={sty.shareCardDivider} />
                  <span style={sty.shareCardLabel}>THE CHALLENGE</span>
                </div>

                {/* Headline */}
                <div style={{
                  ...sty.resultTitle,
                  animation: (result.winner === 'lavern' || result.winner === 'human')
                    ? 'chWinnerGlow 2s ease-in-out infinite' : undefined,
                  color: result.winner === 'human' ? D.text : D.gold,
                }}>
                  {result.winner === 'lavern' && 'As expected.'}
                  {result.winner === 'human' && 'Humans are still better at this.'}
                  {result.winner === 'tie' && 'Dead heat.'}
                </div>

                {/* Score face-off */}
                <div style={sty.shareFaceoff}>
                  <div style={sty.shareSide}>
                    <div style={{
                      ...sty.shareSideLabel,
                      color: result.winner === 'lavern'
                        ? D.gold
                        : result.winner === 'human' ? D.textDim : D.text,
                    }}>LAVERN</div>
                    <div style={{
                      ...sty.shareSideScore,
                      color: result.winner === 'lavern' ? D.gold : D.textDim,
                    }}>
                      {result.assignment.A === 'lavern' ? result.overallA : result.overallB}
                    </div>
                  </div>
                  <div style={sty.shareSideVs}>vs</div>
                  <div style={sty.shareSide}>
                    <div style={{
                      ...sty.shareSideLabel,
                      color: result.winner === 'human'
                        ? D.gold
                        : result.winner === 'lavern' ? D.textDim : D.text,
                    }}>CHALLENGER</div>
                    <div style={{
                      ...sty.shareSideScore,
                      color: result.winner === 'human' ? D.gold : D.textDim,
                    }}>
                      {result.assignment.A === 'human' ? result.overallA : result.overallB}
                    </div>
                  </div>
                </div>

                {/* Punchy one-liner — designed for screenshots */}
                <div style={sty.resultTagline}>
                  {result.winner === 'lavern' && `Blind comparison. ${result.dimensions.length} dimensions. One clear winner.`}
                  {result.winner === 'human' && 'Blind. Fair. Published. The engagement is on us.'}
                  {result.winner === 'tie' && `${result.dimensions.length} dimensions. Neither blinked.`}
                </div>

                {/* Card footer */}
                <div style={sty.shareCardFooter}>
                  <span style={sty.shareCardFooterText}>lavern.law</span>
                  <span style={sty.shareCardFooterText}>{'\u00B7'}</span>
                  <span style={sty.shareCardFooterText}>Blind AI comparison</span>
                </div>

                {/* Share + Download actions */}
                <div style={sty.shareActions}>
                  <button
                    onClick={() => shareOnLinkedIn(result)}
                    style={{
                      ...sty.shareBtn,
                      backgroundColor: shareHover ? D.gold : 'transparent',
                      color: shareHover ? '#0A0A0F' : D.gold,
                    }}
                    onMouseEnter={() => setShareHover(true)}
                    onMouseLeave={() => setShareHover(false)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                    </svg>
                    Share on LinkedIn
                  </button>
                  <button
                    onClick={() => downloadShareCard(result)}
                    style={{
                      ...sty.dlBtn,
                      backgroundColor: dlHover ? 'rgba(250, 249, 246, 0.12)' : 'transparent',
                      color: dlHover ? D.white : D.textDim,
                      borderColor: dlHover ? D.borderHover : D.border,
                    }}
                    onMouseEnter={() => setDlHover(true)}
                    onMouseLeave={() => setDlHover(false)}
                  >
                    {'\u2913'} Download Image
                  </button>
                </div>

                {/* CTA below card */}
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                  {result.winner === 'lavern' && (
                    <button
                      onClick={() => { window.location.hash = '#/quickstart'; }}
                      style={sty.resultCta}
                    >
                      Ready to hire us?
                    </button>
                  )}
                  {result.winner === 'human' && (
                    <button
                      onClick={() => { window.location.hash = '#/quickstart'; }}
                      style={{ ...sty.resultCta, borderColor: D.text, color: D.text }}
                    >
                      Challenge us again
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Detailed breakdown — outside the share card, for people who want the numbers */}
            {phase === 'result' && result && (
              <div style={{ maxWidth: 520, margin: '32px auto 0', animation: 'chFadeIn 0.6s ease 1s both' }}>
                <div style={sty.shareDims}>
                  {result.dimensions.map((dim) => {
                    const mScore = result.assignment.A === 'lavern' ? dim.scoreA : dim.scoreB;
                    const cScore = result.assignment.A === 'human' ? dim.scoreA : dim.scoreB;
                    const mWins = mScore > cScore;
                    return (
                      <div key={dim.name} style={sty.shareDimRow}>
                        <span style={sty.shareDimName}>{dim.name}</span>
                        <span style={{ ...sty.shareDimScore, color: mWins ? D.gold : D.textDim }}>{mScore}</span>
                        <span style={sty.shareDimDash}>{'\u2013'}</span>
                        <span style={{ ...sty.shareDimScore, color: !mWins ? D.gold : D.textDim }}>{cScore}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...sty.resultSummary, marginTop: 20 }}>{result.summary}</div>
              </div>
            )}
          </>
        )}

        {/* ── Footer ─────────────────────────────────── */}
        <div style={{ ...sty.footer, animation: 'chFadeIn 0.4s ease 0.8s both' }}>
          <span style={sty.footerText}>{'LAVERN \u00B7 THE CHALLENGE'}</span>
        </div>
      </div>

      {/* ── Fog of War — dark mist that dissolves on scroll ──── */}
      <div
        ref={fogRef}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40vh',
          background: `linear-gradient(to top, ${D.bg} 0%, ${D.bg} 15%, rgba(10, 10, 15, 0.92) 30%, rgba(10, 10, 15, 0.7) 45%, rgba(10, 10, 15, 0.35) 65%, transparent 100%)`,
          pointerEvents: 'none',
          zIndex: 50,
          transition: 'opacity 0.3s ease-out',
        }}
      />
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
  darkBg: {
    position: 'fixed',
    inset: 0,
    background: 'linear-gradient(145deg, #0A0A12 0%, #0F0E18 40%, #0A0A0F 100%)',
    opacity: 0.8,
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

  // Share card — self-contained, screenshot-worthy result card
  shareCard: {
    textAlign: 'center' as const,
    padding: '40px 40px 32px',
    border: `1px solid ${D.gold}`,
    borderRadius: radii.md,
    backgroundColor: 'rgba(10, 10, 15, 0.95)',
    marginTop: 32,
    // Subtle gold gradient border glow
    boxShadow: `0 0 40px rgba(184, 150, 11, 0.08), inset 0 1px 0 rgba(184, 150, 11, 0.15)`,
  },
  shareCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  shareCardLogo: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: D.white,
    letterSpacing: 6,
    textTransform: 'uppercase' as const,
  },
  shareCardDivider: {
    width: 1,
    height: 14,
    backgroundColor: D.textFaint,
  },
  shareCardLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: D.textDim,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
  },
  resultTitle: {
    fontSize: 36,
    fontFamily: fonts.serif,
    fontWeight: 300,
    fontStyle: 'italic' as const,
    color: D.gold,
    marginBottom: 24,
  },
  shareFaceoff: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 28,
    padding: '20px 0',
    borderTop: `1px solid ${D.border}`,
    borderBottom: `1px solid ${D.border}`,
  },
  shareSide: {
    textAlign: 'center' as const,
    minWidth: 100,
  },
  shareSideLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  shareSideScore: {
    fontSize: 56,
    fontFamily: fonts.serif,
    fontWeight: 300,
    lineHeight: 1,
  },
  shareSideVs: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: D.textFaint,
    fontStyle: 'italic' as const,
  },
  shareDims: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    marginBottom: 24,
    padding: '0 20px',
  },
  shareDimRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareDimName: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textDim,
    width: 180,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  shareDimScore: {
    fontSize: 13,
    fontFamily: fonts.mono,
    fontWeight: 600,
    width: 28,
    textAlign: 'center' as const,
  },
  shareDimDash: {
    fontSize: 10,
    color: D.textFaint,
  },
  resultTagline: {
    fontSize: 16,
    fontFamily: fonts.sans,
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: D.text,
    lineHeight: 1.6,
    maxWidth: 400,
    margin: '0 auto 8px',
  },
  resultSummary: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.7,
    maxWidth: 500,
    margin: '0 auto 16px',
  },
  shareCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
    borderTop: `1px solid ${D.border}`,
  },
  shareCardFooterText: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: D.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  shareActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
  },
  shareBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    border: `1.5px solid ${D.gold}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: D.gold,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
  },
  dlBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    border: `1.5px solid ${D.border}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: D.textDim,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
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
