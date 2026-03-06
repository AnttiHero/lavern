/**
 * PricingView -- "Billable Hours."
 *
 * We are a law firm. We bill by the hour.
 * Except our partners charge $15/hr, not $1,500.
 *
 * Dark cinematic design (same template as BetTheCompanyView).
 * The Retainer pricing model: $0 engagement fee, 20% platform fee,
 * you set the budget, pay only what agents use.
 */

import { useState, useRef, useEffect } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import { MarbleIlluminated } from '../components/MarbleIlluminated.js';

interface Props {
  onBack: () => void;
}

// -- Dark palette -- Marble at night ----------------------------------------

const D = {
  bg: '#0A0A0F',
  surface: 'rgba(250, 249, 246, 0.05)',
  surfaceLight: 'rgba(250, 249, 246, 0.10)',
  border: 'rgba(250, 249, 246, 0.10)',
  borderHover: 'rgba(250, 249, 246, 0.25)',
  accent: colors.accent,
  gold: '#B8960B',
  goldDim: 'rgba(184, 150, 11, 0.5)',
  goldFaint: 'rgba(184, 150, 11, 0.15)',
  text: 'rgba(250, 249, 246, 0.85)',
  textDim: 'rgba(250, 249, 246, 0.6)',
  textFaint: 'rgba(250, 249, 246, 0.35)',
  white: 'rgba(250, 249, 246, 0.92)',
  strikethrough: 'rgba(250, 249, 246, 0.35)',
};

// -- Section wrapper ---------------------------------------------------------

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
        animation: `btcFadeIn 0.6s ease ${delay}s both`,
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

// -- Rate Card ---------------------------------------------------------------

function RateCard({
  title,
  model,
  tier,
  inputRate,
  outputRate,
  traditional,
}: {
  title: string;
  model: string;
  tier: string;
  inputRate: string;
  outputRate: string;
  traditional: string;
}) {
  return (
    <div style={sty.rateCard}>
      <div style={sty.rateTier}>{tier}</div>
      <div style={sty.rateTitle}>{title}</div>
      <div style={sty.rateModel}>{model}</div>
      <div style={sty.rateDivider} />
      <div style={sty.rateLine}>
        <span style={sty.rateLabel}>Input</span>
        <span style={sty.rateValue}>{inputRate}</span>
      </div>
      <div style={sty.rateLine}>
        <span style={sty.rateLabel}>Output</span>
        <span style={sty.rateValue}>{outputRate}</span>
      </div>
      <div style={sty.rateTraditional}>
        <span style={sty.rateStrike}>{traditional}</span>
        <span style={sty.rateTraditionalLabel}>Traditional firm</span>
      </div>
    </div>
  );
}

// -- Comparison Card ---------------------------------------------------------

function ComparisonCard({ doc, marble, firm, savings }: {
  doc: string; marble: string; firm: string; savings: string;
}) {
  return (
    <div style={sty.compCard}>
      <div style={sty.compDocName}>{doc}</div>
      <div style={sty.compRow}>
        <div style={sty.compCol}>
          <div style={sty.compLabel}>Marble</div>
          <div style={sty.compMarble}>{marble}</div>
        </div>
        <div style={sty.compCol}>
          <div style={sty.compLabel}>Traditional Firm</div>
          <div style={sty.compFirm}>{firm}</div>
        </div>
        <div style={sty.compCol}>
          <div style={sty.compLabel}>You Save</div>
          <div style={sty.compSavings}>{savings}</div>
        </div>
      </div>
    </div>
  );
}

// -- Main component ----------------------------------------------------------

export default function PricingView({ onBack }: Props) {
  const [backHover, setBackHover] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const fogRef = useRef<HTMLDivElement>(null);

  // Fog of war — dark mist at bottom, dissolves on scroll
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const onScroll = () => {
      if (!fogRef.current) return;
      const t = Math.min(1, page.scrollTop / 300);
      fogRef.current.style.opacity = String(1 - t);
    };
    page.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => page.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={pageRef} style={sty.page}>
      {/* Subtle marble texture */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={sty.marbleBg}
      />

      {/* Radial veil */}
      <div style={sty.veil} />

      {/* Gold accent glow at top */}
      <div style={sty.goldGlow} />

      {/* Back button */}
      <button
        style={{
          ...sty.backBtn,
          color: backHover ? D.white : D.textDim,
          borderColor: backHover ? D.borderHover : D.border,
        }}
        onClick={onBack}
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
      >
        {'\u2190'} Back
      </button>

      {/* Content container */}
      <div style={sty.container}>

        {/* ---- Hero ---------------------------------------------------- */}
        <div style={{
          ...sty.header,
          animation: 'btcFadeIn 0.8s ease 0.1s both',
        }}>
          <div style={sty.logoWrap}>
            <MarbleIlluminated
              color="rgba(250, 249, 246, 0.55)"
              glow="rgba(250, 249, 246, 0.95)"
            />
          </div>
          <div style={sty.rule} />
          <h2 style={sty.heroTitle}>Billable Hours</h2>
          <p style={sty.description}>
            We are a law firm. We bill by the hour.
          </p>
        </div>

        {/* ---- The Rate Card ------------------------------------------- */}
        <Section label="The Rate Card" delay={0.2}>
          <div style={sty.pitch}>
            The same work.{' '}
            <span style={{ color: D.gold }}>A different century{'\u2019'}s rates.</span>
          </div>
          <div style={sty.rateGrid}>
            <RateCard
              title="Partner"
              model="Claude Opus 4.6"
              tier="Senior"
              inputRate="$15/MTok"
              outputRate="$75/MTok"
              traditional={'$900\u20131,500/hr'}
            />
            <RateCard
              title="Associate"
              model="Claude Sonnet 4.5"
              tier="Specialist"
              inputRate="$3/MTok"
              outputRate="$15/MTok"
              traditional={'$400\u2013700/hr'}
            />
            <RateCard
              title="Paralegal"
              model="Claude Haiku 3.5"
              tier="Junior"
              inputRate="$0.80/MTok"
              outputRate="$4/MTok"
              traditional={'$150\u2013350/hr'}
            />
          </div>
          <div style={sty.rateFootnote}>
            Rates are per million tokens (MTok). Typical engagement: 50K{'\u2013'}500K tokens.{' '}
            Cache reads at 90% discount. Cache writes at cost.
          </div>
        </Section>

        {/* ---- The Retainer --------------------------------------------- */}
        <Section label="The Retainer" delay={0.3}>
          <div style={sty.pitch}>
            No engagement fee. No minimums.{' '}
            <span style={{ color: D.gold }}>You set the budget, we do the work.</span>
          </div>
          <div style={sty.bulletList}>
            <div style={sty.bullet}>
              <strong style={{ color: D.gold }}>$0</strong> engagement fee {'\u2014'} you only pay for compute
            </div>
            <div style={sty.bullet}>
              <strong style={{ color: D.gold }}>20%</strong> platform fee {'\u2014'} covers orchestration, quality gates, debate, audit trails
            </div>
            <div style={sty.bullet}>
              You set the budget {'\u2014'} $10, $40, $125, or custom
            </div>
            <div style={sty.bullet}>
              Hard cap enforced {'\u2014'} session halts if budget would be exceeded
            </div>
            <div style={sty.bullet}>
              Unused budget is never charged
            </div>
          </div>
        </Section>

        {/* ---- What It Actually Costs ----------------------------------- */}
        <Section label="What It Actually Costs" delay={0.4}>
          <h3 style={sty.pitch}>
            The same documents.{' '}
            <span style={{ color: D.gold, fontStyle: 'italic' }}>A fraction of the bill.</span>
          </h3>
          <div style={sty.compList}>
            <ComparisonCard
              doc="Terms of Service Review"
              marble={'$5\u201310'}
              firm={'$3,000\u20135,000'}
              savings="99.7%"
            />
            <ComparisonCard
              doc="Employment Contract"
              marble={'$15\u201330'}
              firm={'$2,000\u20134,000'}
              savings="99.2%"
            />
            <ComparisonCard
              doc="SaaS Agreement"
              marble={'$20\u201340'}
              firm={'$5,000\u201310,000'}
              savings="99.6%"
            />
            <ComparisonCard
              doc="NDA Review"
              marble={'$2\u20135'}
              firm={'$500\u20131,500'}
              savings="99.6%"
            />
            <ComparisonCard
              doc="Privacy Policy Audit"
              marble={'$10\u201325'}
              firm={'$4,000\u20138,000'}
              savings="99.7%"
            />
          </div>
        </Section>

        {/* ---- For Agents ---------------------------------------------- */}
        <Section label="For Agents" delay={0.5}>
          <div style={sty.featureGrid}>
            <div style={sty.card}>
              <div style={sty.featureTitle}>x402 / USDC on Base</div>
              <div style={sty.featureDesc}>
                Pay per request with USDC on Base via the x402 protocol.
                No account needed {'\u2014'} include the X-PAYMENT header. Instant settlement.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Bring Your Own Key</div>
              <div style={sty.featureDesc}>
                Use your Anthropic API key. We orchestrate the multi-agent pipeline {'\u2014'}
                you pay Anthropic directly. Platform fee only.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>A2A Protocol</div>
              <div style={sty.featureDesc}>
                Agent-to-Agent protocol support. Discover Marble{'\u2019'}s capabilities
                at <span style={{ fontFamily: fonts.mono, fontSize: 12 }}>/.well-known/agent.json</span>.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Budget Enforcement</div>
              <div style={sty.featureDesc}>
                Hard cap per session. Agents can query{' '}
                <span style={{ fontFamily: fonts.mono, fontSize: 12 }}>/api/pricing</span>{' '}
                for real-time rates before committing.
              </div>
            </div>
          </div>
        </Section>

        {/* ---- Claw Mode ----------------------------------------------- */}
        <Section label={'Claw Mode \u2014 The Night Shift'} delay={0.6}>
          <div style={sty.clawCard}>
            <div style={sty.clawEmoji}>{'\uD83E\uDD80'}</div>
            <div style={sty.clawTitle}>Law Firm on Retainer</div>
            <div style={sty.clawDesc}>
              Claw watches your folders, reviews new documents overnight,
              delivers findings by morning. Autonomous. Continuous. It works while you sleep.
            </div>
            <div style={sty.clawPrice}>
              <span style={{ color: D.gold, fontFamily: fonts.serif, fontSize: 28, fontWeight: 300 }}>
                $50
              </span>
              <span style={{ color: D.textDim, fontFamily: fonts.sans, fontSize: 13 }}>
                /month {'\u00B7'} includes $50 compute budget
              </span>
            </div>
            <div style={sty.clawNote}>
              Additional usage at standard rates. Confidential documents analyzed on-device at $0 cost.
            </div>
          </div>
        </Section>

        {/* ---- Footer -------------------------------------------------- */}
        <div style={{
          ...sty.footer,
          animation: 'btcFadeIn 0.6s ease 0.7s both',
        }}>
          <MarbleIlluminated
            color="rgba(250, 249, 246, 0.15)"
            glow="rgba(250, 249, 246, 0.4)"
          />
          <span style={sty.footerDot}>{'\u00B7'}</span>
          Billable Hours
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

      {/* Keyframe animation */}
      <style>{`
        @keyframes btcFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// -- Styles ------------------------------------------------------------------

const sty: Record<string, React.CSSProperties> = {
  // -- Page shell
  page: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: D.bg,
    color: D.text,
    fontFamily: fonts.sans,
    overflow: 'auto' as const,
  },
  marbleBg: {
    position: 'fixed' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    filter: 'brightness(0.1) contrast(1.1) saturate(0.15)',
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  veil: {
    position: 'fixed' as const,
    inset: 0,
    background: 'radial-gradient(ellipse 80% 60% at center top, transparent 0%, rgba(10, 10, 15, 0.7) 100%)',
    pointerEvents: 'none' as const,
  },
  goldGlow: {
    position: 'fixed' as const,
    top: -200,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 600,
    height: 400,
    background: 'radial-gradient(ellipse at center, rgba(184, 150, 11, 0.06) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  container: {
    position: 'relative' as const,
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
    color: D.textDim,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'color 0.25s ease, border-color 0.25s ease',
  },

  // -- Header
  header: {
    textAlign: 'center' as const,
    marginBottom: 64,
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
  description: {
    fontSize: 15,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.7,
    maxWidth: 500,
    margin: '20px auto 0',
    textAlign: 'center' as const,
  },

  // -- Section
  section: {
    marginBottom: 56,
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

  // -- Pitch & bullets
  pitch: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    lineHeight: 1.4,
    marginBottom: 32,
    letterSpacing: 0.3,
    textAlign: 'center' as const,
  },
  bulletList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.text,
    lineHeight: 1.6,
    paddingLeft: 16,
    borderLeft: `2px solid ${D.goldDim}`,
  },

  // -- Rate Grid
  rateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 20,
  },
  rateCard: {
    padding: 24,
    border: `1px solid ${D.borderHover}`,
    borderRadius: radii.md,
    backgroundColor: D.surfaceLight,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
  },
  rateTier: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: D.gold,
    fontFamily: fonts.sans,
  },
  rateTitle: {
    fontSize: 20,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    marginBottom: 2,
  },
  rateModel: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.textDim,
    marginBottom: 8,
  },
  rateDivider: {
    width: 32,
    height: 1,
    backgroundColor: D.border,
    margin: '8px 0',
  },
  rateLine: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: '3px 0',
  },
  rateLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textDim,
  },
  rateValue: {
    fontSize: 13,
    fontFamily: fonts.mono,
    color: D.gold,
    fontWeight: 600,
  },
  rateTraditional: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  rateStrike: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.strikethrough,
    textDecoration: 'line-through',
    fontStyle: 'italic' as const,
  },
  rateTraditionalLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: D.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  rateFootnote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textFaint,
    textAlign: 'center' as const,
    lineHeight: 1.6,
    maxWidth: 500,
    margin: '0 auto',
  },

  // -- Comparison cards
  compList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  compCard: {
    padding: '20px 24px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
  compDocName: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
    marginBottom: 14,
  },
  compRow: {
    display: 'flex',
    gap: 32,
  },
  compCol: {
    flex: 1,
  },
  compLabel: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: D.textDim,
    fontFamily: fonts.sans,
    marginBottom: 4,
  },
  compMarble: {
    fontSize: 20,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: D.gold,
  },
  compFirm: {
    fontSize: 20,
    fontFamily: fonts.sans,
    fontWeight: 300,
    color: D.strikethrough,
    textDecoration: 'line-through',
    fontStyle: 'italic' as const,
  },
  compSavings: {
    fontSize: 20,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: '#4ade80',
  },

  // -- Feature cards
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  card: {
    padding: 24,
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
  featureTitle: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
    marginBottom: 8,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.6,
  },

  // -- Claw Mode
  clawCard: {
    padding: 32,
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
  },
  clawEmoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  clawTitle: {
    fontSize: 20,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
  },
  clawDesc: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.text,
    lineHeight: 1.6,
    maxWidth: 480,
    marginBottom: 8,
  },
  clawPrice: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  clawNote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textFaint,
    lineHeight: 1.5,
    maxWidth: 400,
  },

  // -- Footer
  footer: {
    textAlign: 'center' as const,
    paddingTop: 32,
    marginTop: 24,
    borderTop: `1px solid ${D.border}`,
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: D.textFaint,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
  },
  footerDot: {
    margin: '0 6px',
  },
};
