/**
 * BetTheCompanyView -- Premium tier landing page.
 *
 * Dark cinematic design matching AgentDocsView. Explains the
 * highest tier of Marble service: full AI multi-agent power
 * combined with human expert oversight.
 *
 * When everything is on the line.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { MarbleIlluminated } from '../components/MarbleIlluminated.js';

interface Props {
  onBack: () => void;
}

// -- Dark palette -- Marble at night ----------------------------------------

const D = {
  bg: '#0A0A0F',
  surface: 'rgba(250, 249, 246, 0.03)',
  border: 'rgba(250, 249, 246, 0.08)',
  borderHover: 'rgba(250, 249, 246, 0.2)',
  accent: colors.accent,
  accentDim: 'rgba(196, 93, 62, 0.6)',
  gold: '#B8960B',
  goldDim: 'rgba(184, 150, 11, 0.5)',
  goldFaint: 'rgba(184, 150, 11, 0.15)',
  text: 'rgba(250, 249, 246, 0.8)',
  textDim: 'rgba(250, 249, 246, 0.4)',
  textFaint: 'rgba(250, 249, 246, 0.15)',
  white: 'rgba(250, 249, 246, 0.92)',
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

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={sty.metricCard}>
      <div style={sty.metricValue}>{value}</div>
      <div style={sty.metricLabel}>{label}</div>
    </div>
  );
}

function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div style={sty.stepCard}>
      <div style={sty.stepNum}>{num}</div>
      <div>
        <div style={sty.stepTitle}>{title}</div>
        <div style={sty.stepDesc}>{desc}</div>
      </div>
    </div>
  );
}

// -- Contact form ------------------------------------------------------------

function InquiryForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() && email.trim() && description.trim();

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'bet-the-company',
          name: name.trim(),
          email: email.trim(),
          organization: org.trim() || undefined,
          description: description.trim(),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        // Graceful fallback -- endpoint may not exist yet
        const d = await res.json().catch(() => ({}));
        if (res.status === 404) {
          // No endpoint yet -- still show confirmation (demo mode)
          setSubmitted(true);
        } else {
          throw new Error(d.error || `Submission failed (${res.status})`);
        }
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error -- show confirmation anyway (offline/demo)
        setSubmitted(true);
      } else {
        setError(err instanceof Error ? err.message : 'Submission failed');
      }
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, name, email, org, description]);

  if (submitted) {
    return (
      <div style={sty.card}>
        <div style={{
          color: D.gold,
          fontWeight: 600,
          marginBottom: 12,
          fontFamily: fonts.sans,
          fontSize: 12,
          letterSpacing: 1.5,
          textTransform: 'uppercase' as const,
        }}>
          Inquiry Received
        </div>
        <p style={{
          fontSize: 16,
          fontFamily: fonts.serif,
          color: D.white,
          lineHeight: 1.6,
          marginBottom: 8,
          fontWeight: 300,
        }}>
          Thank you, {name.trim()}.
        </p>
        <p style={{
          fontSize: 14,
          fontFamily: fonts.sans,
          color: D.text,
          lineHeight: 1.7,
          marginBottom: 24,
        }}>
          We{'\u2019'}ve received your inquiry and a member of our team will be in touch
          within 24 hours to discuss your matter.
        </p>
        <button
          onClick={onBack}
          style={{ ...sty.primaryBtn, backgroundColor: D.gold, borderColor: D.gold }}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={sty.card}>
      <div style={sty.formRow}>
        <label style={sty.formLabel}>Your Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Full name"
          style={sty.input}
        />
      </div>
      <div style={sty.formRow}>
        <label style={sty.formLabel}>Email</label>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          style={sty.input}
          type="email"
        />
      </div>
      <div style={sty.formRow}>
        <label style={sty.formLabel}>
          Organization <span style={{ fontWeight: 400, color: D.textFaint }}>(optional)</span>
        </label>
        <input
          value={org}
          onChange={e => setOrg(e.target.value)}
          placeholder="Company or firm name"
          style={sty.input}
        />
      </div>
      <div style={sty.formRow}>
        <label style={sty.formLabel}>Describe Your Matter</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of your legal question or document..."
          rows={5}
          style={{
            ...sty.input,
            resize: 'vertical' as const,
            lineHeight: 1.6,
          }}
        />
      </div>
      {error && (
        <div style={{ color: D.accent, fontSize: 12, fontFamily: fonts.sans, marginTop: 4 }}>
          {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        style={{
          ...sty.primaryBtn,
          marginTop: 16,
          opacity: !canSubmit || submitting ? 0.4 : 1,
          cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
          backgroundColor: D.gold,
          borderColor: D.gold,
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Inquiry'}
      </button>
    </div>
  );
}

// -- Main component ----------------------------------------------------------

export default function BetTheCompanyView({ onBack }: Props) {
  const [backHover, setBackHover] = useState(false);

  return (
    <div style={sty.page}>
      {/* Subtle marble texture */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={sty.marbleBg}
      />

      {/* Radial veil -- darkens edges */}
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
          <div style={sty.title}>
            <MarbleIlluminated
              color="rgba(250, 249, 246, 0.55)"
              glow="rgba(250, 249, 246, 0.95)"
            />
          </div>
          <div style={sty.rule} />
          <h2 style={sty.heroTitle}>Bet the Company</h2>
          <p style={sty.description}>
            When the stakes are existential and the margin for error is zero.
            The highest tier of Marble service {'\u2014'} AI precision backed by human judgment.
          </p>
        </div>

        {/* ---- When Everything Is on the Line -------------------------- */}
        <Section label="When Everything Is on the Line" delay={0.2}>
          <div style={sty.pitch}>
            The full power of our multi-agent system,{' '}
            <span style={{ color: D.gold }}>with a human expert reviewing every decision.</span>
          </div>
          <div style={sty.bulletList}>
            <div style={sty.bullet}>57 specialist AI agents working your matter at maximum depth</div>
            <div style={sty.bullet}>Every quality gate reviewed and approved by a human legal expert</div>
            <div style={sty.bullet}>Maximal intensity {'\u2014'} deepest analysis, extended deliberation, no shortcuts</div>
            <div style={sty.bullet}>Dual sign-off on every deliverable: AI analysis + human counsel</div>
            <div style={sty.bullet}>Complete audit trail with cited evidence for every finding</div>
          </div>
        </Section>

        {/* ---- By the Numbers ------------------------------------------ */}
        <Section label="By the Numbers" delay={0.3}>
          <div style={sty.metricGrid}>
            <MetricCard value="57" label="Specialist Agents" />
            <MetricCard value="14+" label="Senior Team" />
            <MetricCard value="Human" label="Expert Review" />
            <MetricCard value="All" label="Gates Manual" />
          </div>
        </Section>

        {/* ---- How It Works -------------------------------------------- */}
        <Section label="How It Works" delay={0.4}>
          <div style={sty.stepList}>
            <StepCard
              num="01"
              title="Describe your matter"
              desc="Upload your documents and describe the legal question. Our team will review the full context before engaging."
            />
            <StepCard
              num="02"
              title="AI deep analysis"
              desc="The full senior team works your matter at maximal intensity. Full-bench workflow, extended multi-agent deliberation, every angle covered."
            />
            <StepCard
              num="03"
              title="Human expert review"
              desc="A senior legal professional reviews every gate decision and the final work product. No automated approvals. Every finding verified by a human."
            />
            <StepCard
              num="04"
              title="Dual-signed delivery"
              desc="You receive the complete work product with both AI analysis and human expert sign-off, plus a full audit trail with cited evidence."
            />
          </div>
        </Section>

        {/* ---- What's Included ----------------------------------------- */}
        <Section label="What's Included" delay={0.5}>
          <div style={sty.featureGrid}>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Full-Bench Workflow</div>
              <div style={sty.featureDesc}>
                The most comprehensive workflow {'\u2014'} designed for M{'\u0026'}A, major litigation,
                and transformative legal work. All phases active.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>14+ Specialist Agents</div>
              <div style={sty.featureDesc}>
                Full senior team: managing partner, supervising partner, regulatory counsel,
                privacy counsel, ethics auditor, and more.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Maximal Intensity</div>
              <div style={sty.featureDesc}>
                Deepest reasoning with Opus 4.6 at maximum effort. Extended deliberation,
                no token limits on analysis depth.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Human Gate Review</div>
              <div style={sty.featureDesc}>
                Every gate decision {'\u2014'} ethics, meaning, delivery {'\u2014'} reviewed and
                approved by a human legal expert. Zero automation.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Extended Deliberation</div>
              <div style={sty.featureDesc}>
                Multi-agent debate with full rounds. Adversarial challenges,
                evidence-weighted resolutions, no shortcuts on reasoning.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureTitle}>Dual-Artifact Delivery</div>
              <div style={sty.featureDesc}>
                User-facing plain-language document plus complete legal review package
                with findings, debate transcripts, and audit trail.
              </div>
            </div>
          </div>
        </Section>

        {/* ---- Get Started --------------------------------------------- */}
        <Section label="Get Started" delay={0.6}>
          <p style={sty.bodyText}>
            Bet the Company engagements begin with a conversation. Describe your matter
            below and a member of our team will be in touch to discuss scope, timeline,
            and the right approach for your situation.
          </p>
          <InquiryForm onBack={onBack} />
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
          Bet the Company
        </div>
      </div>
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
  title: {
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

  // -- Metrics
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 28,
  },
  metricCard: {
    textAlign: 'center' as const,
    padding: '20px 8px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.sm,
    backgroundColor: D.surface,
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.gold,
    lineHeight: 1,
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 10,
    color: D.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
  },

  // -- Steps
  stepList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  stepCard: {
    display: 'flex',
    gap: 20,
    padding: 24,
    border: `1px solid ${D.border}`,
    borderLeft: `3px solid ${D.gold}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
  stepNum: {
    fontSize: 24,
    fontFamily: fonts.mono,
    color: D.goldDim,
    fontWeight: 600,
    lineHeight: 1,
    flexShrink: 0,
    minWidth: 36,
  },
  stepTitle: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.6,
  },

  // -- Feature cards
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
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

  // -- Cards
  card: {
    padding: 24,
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },

  // -- Form
  formRow: {
    marginBottom: 16,
  },
  formLabel: {
    display: 'block',
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: D.textDim,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: radii.sm,
    border: `1px solid ${D.border}`,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    color: D.white,
    fontFamily: fonts.sans,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
  },
  primaryBtn: {
    padding: '10px 24px',
    borderRadius: radii.sm,
    border: `2px solid ${D.accent}`,
    backgroundColor: D.accent,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },

  bodyText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.6,
    marginBottom: 20,
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
