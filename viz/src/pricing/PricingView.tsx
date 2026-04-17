/**
 * PricingView -- "Billable Hours."
 *
 * We are a law firm. We bill by the hour.
 * Except our hours cost ten cents.
 *
 * Dark cinematic design.
 * Credit-based pricing: join waitlist, get 50h free, buy packs or subscribe.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';
import type { Stripe, PaymentRequest, PaymentRequestPaymentMethodEvent } from '@stripe/stripe-js';

interface Props {
  onBack: () => void;
}

// -- Dark palette -- Lavern at night ----------------------------------------

const D = {
  bg: '#0A0A0F',
  surface: 'rgba(250, 249, 246, 0.04)',
  surfaceHover: 'rgba(250, 249, 246, 0.07)',
  surfaceLight: 'rgba(250, 249, 246, 0.08)',
  border: 'rgba(250, 249, 246, 0.08)',
  borderMed: 'rgba(250, 249, 246, 0.12)',
  borderHover: 'rgba(250, 249, 246, 0.22)',
  accent: colors.accent,
  gold: '#C9A227',
  goldBright: '#D4AF37',
  goldDim: 'rgba(201, 162, 39, 0.45)',
  goldFaint: 'rgba(201, 162, 39, 0.12)',
  goldGhost: 'rgba(201, 162, 39, 0.06)',
  green: '#34d399',
  greenDim: 'rgba(52, 211, 153, 0.15)',
  text: 'rgba(250, 249, 246, 0.82)',
  textDim: 'rgba(250, 249, 246, 0.55)',
  textFaint: 'rgba(250, 249, 246, 0.30)',
  white: 'rgba(250, 249, 246, 0.92)',
  cream: '#FAF9F6',
  strikethrough: 'rgba(250, 249, 246, 0.30)',
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

// -- Rate Card (refactored for hours) ----------------------------------------

function RateCard({
  title,
  model,
  tier,
  hoursPerEngagement,
  costPerHour,
  traditional,
}: {
  title: string;
  model: string;
  tier: string;
  hoursPerEngagement: string;
  costPerHour: string;
  traditional: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...sty.rateCard,
        borderColor: hover ? D.borderHover : D.borderMed,
        backgroundColor: hover ? D.surfaceHover : D.surfaceLight,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={sty.rateTier}>{tier}</div>
      <div style={sty.rateTitle}>{title}</div>
      <div style={sty.rateModel}>{model}</div>
      <div style={sty.rateDivider} />
      <div style={sty.rateHours}>
        <span style={sty.rateHoursValue}>{hoursPerEngagement}</span>
        <span style={sty.rateHoursLabel}>per engagement</span>
      </div>
      <div style={sty.rateCostLine}>{costPerHour}</div>
      <div style={sty.rateTraditional}>
        <span style={sty.rateStrike}>{traditional}</span>
        <span style={sty.rateTraditionalLabel}>Traditional firm</span>
      </div>
    </div>
  );
}

// -- Comparison Card ---------------------------------------------------------

function ComparisonCard({ doc, lavern, hours, firm, savings }: {
  doc: string; lavern: string; hours: string; firm: string; savings: string;
}) {
  return (
    <div style={sty.compCard}>
      <div style={sty.compTop}>
        <div style={sty.compDocName}>{doc}</div>
        <div style={sty.compSavingsBadge}>{savings}</div>
      </div>
      <div style={sty.compRow}>
        <div style={{ ...sty.compCol, flex: 1.2 }}>
          <div style={sty.compLabel}>Lavern</div>
          <div style={sty.compLavern}>{lavern}</div>
          <div style={sty.compHoursNote}>{hours}</div>
        </div>
        <div style={sty.compCol}>
          <div style={sty.compLabel}>Traditional Firm</div>
          <div style={sty.compFirm}>{firm}</div>
        </div>
      </div>
    </div>
  );
}

// -- Step Card ---------------------------------------------------------------

function StepCard({
  number,
  title,
  description,
  accent,
}: {
  number: string;
  title: string;
  description: string;
  accent?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...sty.stepCard,
        borderColor: hover ? D.borderHover : D.border,
        backgroundColor: hover ? D.surfaceHover : D.surface,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={sty.stepNumberCircle}>
        <span style={sty.stepNumberText}>{number}</span>
      </div>
      <div style={sty.stepTitle}>{title}</div>
      <div style={sty.stepDesc}>{description}</div>
      {accent && <div style={sty.stepAccent}>{accent}</div>}
    </div>
  );
}

// -- Engagement Row ----------------------------------------------------------

function EngagementRow({
  description,
  hours,
  cost,
  intensity,
}: {
  description: string;
  hours: string;
  cost: string;
  intensity: number; // 0-1, controls the visual bar width
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...sty.engRow,
        backgroundColor: hover ? D.surfaceHover : 'transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={sty.engGoldBar} />
      <div style={sty.engContent}>
        <div style={sty.engDesc}>{description}</div>
        <div style={sty.engBarTrack}>
          <div style={{ ...sty.engBarFill, width: `${intensity * 100}%` }} />
        </div>
      </div>
      <div style={sty.engRight}>
        <div style={sty.engHours}>{hours}</div>
        <div style={sty.engCost}>{cost}</div>
      </div>
    </div>
  );
}

// -- Plan Card ---------------------------------------------------------------

function PlanCard({
  name,
  hours,
  price,
  perHour,
  features,
  featured,
  badge,
  onBuy,
  onApplePay,
  applePayAvailable,
  buying,
}: {
  name: string;
  hours: string;
  price: string;
  perHour?: string;
  features: string[];
  featured?: boolean;
  badge?: string;
  onBuy?: () => void;
  onApplePay?: () => void;
  applePayAvailable?: boolean;
  buying?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [apBtnHover, setApBtnHover] = useState(false);
  return (
    <div
      style={{
        ...sty.planCard,
        borderColor: featured
          ? D.gold
          : hover
            ? D.borderHover
            : D.borderMed,
        ...(featured ? {
          boxShadow: `0 0 32px ${D.goldFaint}, inset 0 1px 0 ${D.goldDim}`,
          backgroundColor: D.goldGhost,
        } : {}),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {badge && (
        <div style={sty.planBadge}>{badge}</div>
      )}
      <div style={{
        ...sty.planName,
        color: featured ? D.goldBright : D.textDim,
      }}>{name}</div>
      <div style={sty.planHours}>{hours}</div>
      <div style={sty.planPrice}>{price}</div>
      {perHour && <div style={sty.planPerHour}>{perHour}</div>}
      <div style={sty.planDivider} />
      <div style={sty.planFeatures}>
        {features.map((f, i) => (
          <div key={i} style={sty.planFeature}>
            <span style={sty.planCheck}>{'\u2713'}</span> {f}
          </div>
        ))}
      </div>
      {applePayAvailable && onApplePay && (
        <button
          onClick={onApplePay}
          disabled={buying}
          style={{
            ...sty.applePayBtn,
            opacity: buying ? 0.5 : apBtnHover ? 0.85 : 1,
          }}
          onMouseEnter={() => setApBtnHover(true)}
          onMouseLeave={() => setApBtnHover(false)}
        >
          {buying ? 'Processing...' : '\uF8FF Pay'}
        </button>
      )}
      {onBuy && (
        <button
          onClick={onBuy}
          disabled={buying}
          style={{
            ...sty.buyBtn,
            opacity: buying ? 0.5 : btnHover ? 0.9 : 1,
          }}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
        >
          {buying ? 'Redirecting...' : `Buy ${hours}`}
        </button>
      )}
    </div>
  );
}

// -- Main component ----------------------------------------------------------

export default function PricingView({ onBack }: Props) {
  const [backHover, setBackHover] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const fogRef = useRef<HTMLDivElement>(null);
  const packsRef = useRef<HTMLDivElement>(null);

  // Waitlist form state
  const [email, setEmail] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  // Pack buying state
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  // Apple Pay / Google Pay state
  const stripeRef = useRef<Stripe | null>(null);
  const [applePayAvailable, setApplePayAvailable] = useState(false);

  // Initialize Stripe + check Apple Pay availability
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch publishable key from server
        const cfgRes = await fetch('/api/billing/stripe-config', { credentials: 'include' });
        if (!cfgRes.ok) return;
        const { publishableKey } = await cfgRes.json();
        if (!publishableKey || cancelled) return;

        // Dynamic import — only load Stripe.js when we have a key
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(publishableKey);
        if (!stripe || cancelled) return;
        stripeRef.current = stripe;

        // Check if Apple Pay or Google Pay is available
        const pr = stripe.paymentRequest({
          country: 'FI',
          currency: 'eur',
          total: { label: 'Test', amount: 100 },
          requestPayerEmail: true,
        });
        const result = await pr.canMakePayment();
        if (!cancelled && result) {
          setApplePayAvailable(true);
        }
      } catch {
        // Silently ignore — Apple Pay just won't be available
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Apple Pay handler
  const handleApplePay = useCallback(async (pack: string, label: string, amountCents: number) => {
    const stripe = stripeRef.current;
    if (!stripe) return;
    setBuyingPack(pack);

    try {
      // Create PaymentIntent on server
      const intentRes = await fetch('/api/billing/pack-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pack }),
      });
      if (intentRes.status === 401) {
        window.location.hash = '#/login';
        return;
      }
      if (!intentRes.ok) { setBuyingPack(null); return; }
      const { clientSecret } = await intentRes.json();

      // Create payment request
      const pr = stripe.paymentRequest({
        country: 'FI',
        currency: 'eur',
        total: { label, amount: amountCents },
        requestPayerEmail: true,
      });

      // Handle payment method from Apple Pay sheet
      pr.on('paymentmethod', async (ev: PaymentRequestPaymentMethodEvent) => {
        const { error } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false },
        );
        if (error) {
          ev.complete('fail');
          setBuyingPack(null);
        } else {
          ev.complete('success');
          // Redirect to success — webhook will credit hours
          window.location.href = `${window.location.origin}/?billing=success`;
        }
      });

      // Show the Apple Pay sheet
      const canPay = await pr.canMakePayment();
      if (canPay) {
        pr.show();
      } else {
        // Fallback to Stripe Checkout redirect
        setBuyingPack(null);
        handleBuyPack(pack);
      }
    } catch (err) {
      console.error('[PAYMENT] Apple Pay failed:', err);
      setBuyingPack(null);
      setWaitlistError('Payment failed. Please try again.');
    }
  }, []);

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

  // Auto-scroll to packs when redirected from 402 (topoff=true)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('topoff=true') && packsRef.current) {
      setTimeout(() => {
        packsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
    }
  }, []);

  // Pack checkout handler
  const handleBuyPack = async (pack: string) => {
    setBuyingPack(pack);
    try {
      const res = await fetch('/api/billing/checkout-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pack }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }
      if (res.status === 401) {
        // Not logged in — redirect to login
        window.location.hash = '#/login';
        return;
      }
      // Non-OK, non-401 response — show error to user
      const errBody = await res.json().catch(() => ({ error: 'Checkout failed' }));
      setWaitlistError((errBody as { error?: string }).error || 'Checkout failed. Please try again.');
      setBuyingPack(null);
    } catch (err) {
      console.error('[PAYMENT] Checkout failed:', err);
      setBuyingPack(null);
      setWaitlistError('Payment failed. Please try again.');
    }
  };

  const handleWaitlist = async () => {
    if (!email || waitlistStatus === 'sending') return;
    // Basic client-side email validation (server also validates)
    if (!email.includes('@') || !email.includes('.')) {
      setWaitlistError('Please enter a valid email address.');
      return;
    }
    setWaitlistStatus('sending');
    setWaitlistError(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, source: 'pricing' }),
      });
      if (res.ok) {
        setWaitlistStatus('done');
      } else {
        const data = await res.json().catch(() => ({}));
        setWaitlistError((data as { error?: string }).error || 'Something went wrong.');
        setWaitlistStatus('error');
      }
    } catch {
      setWaitlistError('Unable to connect.');
      setWaitlistStatus('error');
    }
  };

  return (
    <div ref={pageRef} style={sty.page}>
      {/* Subtle texture */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={sty.heroBg}
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
            <LavernIlluminated
              color="rgba(250, 249, 246, 0.55)"
              glow="rgba(250, 249, 246, 0.95)"
            />
          </div>
          <div style={sty.rule} />
          <h2 style={sty.heroTitle}>Billable Hours</h2>
          <p style={sty.description}>
            We are a law firm. We bill by the hour.
          </p>

          {/* The number — anchor the entire page around this */}
          <div style={sty.heroPriceWrap}>
            <span style={sty.heroPriceCent}>{'\u00A2'}</span>
            <span style={sty.heroPriceNum}>10</span>
          </div>
          <p style={sty.heroPriceLabel}>per hour</p>

          <p style={sty.heroSubtext}>
            One billable hour. Ten cents. That{'\u2019'}s it.
          </p>
        </div>

        {/* ---- How It Works -------------------------------------------- */}
        <Section label="How It Works" delay={0.2}>
          <div style={sty.stepGrid}>
            <StepCard
              number="1"
              title="Join the Waitlist"
              description="Request access. We onboard in small batches to ensure quality."
            />
            <StepCard
              number="2"
              title="Get Invited"
              description="Receive your invite code and create your account."
              accent="50 hours free"
            />
            <StepCard
              number="3"
              title="Instruct Your Firm"
              description="Upload a document, ask a question, and watch your team work."
            />
          </div>
        </Section>

        {/* ---- What an Hour Gets You ----------------------------------- */}
        <Section label="What an Hour Gets You" delay={0.3}>
          <div style={sty.pitch}>
            One hour costs{' '}
            <span style={{ color: D.gold, fontWeight: 400 }}>ten cents.</span>{' '}
            Here{'\u2019'}s what that buys.
          </div>
          <div style={sty.engList}>
            <EngagementRow
              description={'Quick counsel \u2014 a legal question answered'}
              hours={'5\u201310h'}
              cost={'$0.50\u2013$1'}
              intensity={0.12}
            />
            <EngagementRow
              description={'Contract review \u2014 NDA, terms of service'}
              hours={'20\u201340h'}
              cost={'$2\u2013$4'}
              intensity={0.4}
            />
            <EngagementRow
              description={'Adversarial review \u2014 attack + defend'}
              hours={'30\u201350h'}
              cost={'$3\u2013$5'}
              intensity={0.6}
            />
            <EngagementRow
              description={'Full bench \u2014 maximum team engagement'}
              hours={'50\u201390h'}
              cost={'$5\u2013$9'}
              intensity={1.0}
            />
          </div>
          <div style={sty.engFootnote}>
            Hours scale with document length and team size. You see real-time cost in every session.
          </div>
        </Section>

        {/* ---- Who's on Your Team -------------------------------------- */}
        <Section label={"Who\u2019s on Your Team"} delay={0.4}>
          <div style={sty.pitch}>
            The same work.{' '}
            <span style={{ color: D.gold, fontStyle: 'italic' }}>A different century{'\u2019'}s rates.</span>
          </div>
          <div style={sty.rateGrid}>
            <RateCard
              title="Partner"
              model="Claude Opus 4.7"
              tier="Senior"
              hoursPerEngagement={'~3h'}
              costPerHour={'$0.30 per engagement'}
              traditional={'$900\u20131,500/hr'}
            />
            <RateCard
              title="Associate"
              model="Claude Sonnet 4.7"
              tier="Specialist"
              hoursPerEngagement={'~1h'}
              costPerHour={'$0.10 per engagement'}
              traditional={'$400\u2013700/hr'}
            />
            <RateCard
              title="Paralegal"
              model="Claude Haiku 3.5"
              tier="Junior"
              hoursPerEngagement={'~0.3h'}
              costPerHour={'$0.03 per engagement'}
              traditional={'$150\u2013350/hr'}
            />
          </div>
          <div style={sty.rateFootnote}>
            Hours vary by document complexity. Real-time cost tracking in every session.
          </div>
        </Section>

        {/* ---- Get Started (free tier banner) ------------------------------ */}
        <Section label="Get Started" delay={0.42}>
          <div style={sty.freeBanner}>
            <div style={sty.freeBannerLeft}>
              <div style={sty.freeBannerTitle}>50 free hours</div>
              <div style={sty.freeBannerDesc}>
                Join the waitlist. Full access to every agent, every document type.
                No credit card.
              </div>
            </div>
            <div style={sty.freeBannerBadge}>FREE</div>
          </div>
        </Section>

        {/* ---- Buy Hours (packs — the main revenue event) --------------- */}
        <Section label="Buy Hours" delay={0.45}>
          <div ref={packsRef} style={sty.pitch}>
            Top off anytime.{' '}
            <span style={{ color: D.gold }}>No commitment.</span>
          </div>
          <div style={sty.packGrid}>
            <PlanCard
              name="QUICK TOP-OFF"
              hours="25h"
              price={'\u20AC5'}
              perHour={'\u20AC0.20/h'}
              features={[
                'One-click purchase',
                'Enough for a quick counsel',
                'Never expires',
              ]}
              featured
              badge="IMPULSE"
              onBuy={() => handleBuyPack('quick')}
              onApplePay={() => handleApplePay('quick', 'Lavern \u2014 25 Billable Hours', 500)}
              applePayAvailable={applePayAvailable}
              buying={buyingPack === 'quick'}
            />
            <PlanCard
              name="HOUR PACK"
              hours="100h"
              price={'\u20AC19'}
              perHour={'\u20AC0.19/h'}
              features={[
                'Full contract review',
                'Most popular top-off',
                'Never expires',
              ]}
              badge="BEST VALUE"
              onBuy={() => handleBuyPack('standard')}
              onApplePay={() => handleApplePay('standard', 'Lavern \u2014 100 Billable Hours', 1900)}
              applePayAvailable={applePayAvailable}
              buying={buyingPack === 'standard'}
            />
            <PlanCard
              name="BULK"
              hours="500h"
              price={'\u20AC89'}
              perHour={'\u20AC0.18/h'}
              features={[
                'Multiple engagements',
                'Best per-hour rate',
                'Never expires',
              ]}
              onBuy={() => handleBuyPack('bulk')}
              onApplePay={() => handleApplePay('bulk', 'Lavern \u2014 500 Billable Hours', 8900)}
              applePayAvailable={applePayAvailable}
              buying={buyingPack === 'bulk'}
            />
          </div>
          <div style={sty.packNote}>
            Hours never expire {'\u00B7'} Buy as many packs as you want {'\u00B7'} Use across all engagements
          </div>
        </Section>

        {/* ---- Subscribe & Save (monthly plans — the upgrade path) ------ */}
        <Section label="Subscribe & Save" delay={0.48}>
          <div style={sty.pitch}>
            Use Lavern regularly?{' '}
            <span style={{ color: D.gold, fontStyle: 'italic' }}>Save with a plan.</span>
          </div>
          <div style={sty.subGrid}>
            <div style={sty.subCard}>
              <div style={sty.subName}>SOLO</div>
              <div style={sty.subHours}>200h/mo</div>
              <div style={sty.subPrice}>{'\u20AC'}49<span style={sty.subPeriod}>/mo</span></div>
              <div style={sty.subPerHour}>{'\u20AC'}0.25/h {'\u00B7'} save vs packs</div>
              <div style={sty.subDivider} />
              <div style={sty.subFeature}>{'\u2713'} Priority processing</div>
              <div style={sty.subFeature}>{'\u2713'} Email support</div>
              <div style={sty.subFeature}>{'\u2713'} Rollover unused hours</div>
            </div>
            <div style={sty.subCard}>
              <div style={sty.subName}>TEAM</div>
              <div style={sty.subHours}>1,000h/mo</div>
              <div style={sty.subPrice}>{'\u20AC'}199<span style={sty.subPeriod}>/mo</span></div>
              <div style={sty.subPerHour}>{'\u20AC'}0.20/h {'\u00B7'} best rate</div>
              <div style={sty.subDivider} />
              <div style={sty.subFeature}>{'\u2713'} Multiple users</div>
              <div style={sty.subFeature}>{'\u2713'} Clawern included</div>
              <div style={sty.subFeature}>{'\u2713'} Dedicated support</div>
            </div>
          </div>
        </Section>

        {/* ---- What It Actually Costs ----------------------------------- */}
        <Section label="What It Actually Costs" delay={0.5}>
          <h3 style={sty.pitch}>
            The same documents.{' '}
            <span style={{ color: D.gold, fontStyle: 'italic' }}>A fraction of the bill.</span>
          </h3>
          <div style={sty.compList}>
            <ComparisonCard
              doc="NDA Review"
              lavern={'$2\u20135'}
              hours={'20\u201350 hours'}
              firm={'$500\u20131,500'}
              savings="99.6%"
            />
            <ComparisonCard
              doc="Terms of Service Review"
              lavern={'$5\u201310'}
              hours={'50\u2013100 hours'}
              firm={'$3,000\u20135,000'}
              savings="99.7%"
            />
            <ComparisonCard
              doc="Employment Contract"
              lavern={'$15\u201330'}
              hours={'150\u2013300 hours'}
              firm={'$2,000\u20134,000'}
              savings="99.2%"
            />
            <ComparisonCard
              doc="SaaS Agreement"
              lavern={'$20\u201340'}
              hours={'200\u2013400 hours'}
              firm={'$5,000\u201310,000'}
              savings="99.6%"
            />
            <ComparisonCard
              doc="Privacy Policy Audit"
              lavern={'$10\u201325'}
              hours={'100\u2013250 hours'}
              firm={'$4,000\u20138,000'}
              savings="99.7%"
            />
          </div>
        </Section>

        {/* ---- For Agents ---------------------------------------------- */}
        <Section label="For Agents" delay={0.55}>
          <div style={sty.featureGrid}>
            <div style={sty.card}>
              <div style={sty.featureIcon}>{'\uD83D\uDCB0'}</div>
              <div style={sty.featureTitle}>x402 / USDC on Base</div>
              <div style={sty.featureDesc}>
                Pay per request with USDC on Base via the x402 protocol.
                No account needed {'\u2014'} include the X-PAYMENT header.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureIcon}>{'\uD83D\uDD11'}</div>
              <div style={sty.featureTitle}>Bring Your Own Key</div>
              <div style={sty.featureDesc}>
                Use your Anthropic API key. We orchestrate {'\u2014'}
                you pay Anthropic directly. Platform fee only.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureIcon}>{'\uD83E\uDD16'}</div>
              <div style={sty.featureTitle}>A2A Protocol</div>
              <div style={sty.featureDesc}>
                Agent-to-Agent protocol support. Discover capabilities
                at <span style={{ fontFamily: fonts.mono, fontSize: 11 }}>/.well-known/agent.json</span>.
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.featureIcon}>{'\uD83D\uDEE1\uFE0F'}</div>
              <div style={sty.featureTitle}>Budget Enforcement</div>
              <div style={sty.featureDesc}>
                Hard cap per session. Query{' '}
                <span style={{ fontFamily: fonts.mono, fontSize: 11 }}>/api/pricing</span>{' '}
                for real-time rates before committing.
              </div>
            </div>
          </div>
        </Section>

        {/* ---- Claw Mode ----------------------------------------------- */}
        <Section label={'Clawern \u2014 The Night Shift'} delay={0.6}>
          <div style={sty.clawCard}>
            <div style={sty.clawEmoji}>{'\uD83E\uDD80'}</div>
            <div style={sty.clawTitle}>Law Firm on Retainer</div>
            <div style={sty.clawDesc}>
              Clawern watches your folders, reviews new documents overnight,
              delivers findings by morning. Autonomous. Continuous. It works while you sleep.
            </div>
            <div style={sty.clawPrice}>
              <span style={{ color: D.gold, fontFamily: fonts.serif, fontSize: 32, fontWeight: 300 }}>
                500h
              </span>
              <span style={{ color: D.textDim, fontFamily: fonts.sans, fontSize: 13 }}>
                /month {'\u00B7'} included with Team plan
              </span>
            </div>
            <div style={sty.clawNote}>
              Confidential documents analyzed on-device at $0 cost.
            </div>
          </div>
        </Section>

        {/* ---- Waitlist CTA -------------------------------------------- */}
        <div style={{
          ...sty.ctaSection,
          animation: 'btcFadeIn 0.6s ease 0.65s both',
        }}>
          <div style={sty.ctaGoldLine} />
          <h3 style={sty.ctaTitle}>Ready to rethink your legal spend?</h3>
          <p style={sty.ctaSubtext}>
            Join the waitlist. 50 hours on us. No credit card.
          </p>
          {waitlistStatus === 'done' ? (
            <div style={sty.ctaDone}>
              <span style={sty.ctaDoneCheck}>{'\u2713'}</span>
              {' '}You{'\u2019'}re on the list.
            </div>
          ) : (
            <div style={sty.ctaForm}>
              <input
                type="email"
                placeholder="you@firm.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleWaitlist(); }}
                style={sty.ctaInput}
              />
              <button
                onClick={handleWaitlist}
                disabled={waitlistStatus === 'sending' || !email}
                style={{
                  ...sty.ctaButton,
                  opacity: (!email || waitlistStatus === 'sending') ? 0.5 : 1,
                }}
              >
                {waitlistStatus === 'sending' ? 'Joining\u2026' : 'Join the Waitlist'}
              </button>
            </div>
          )}
          {waitlistStatus === 'error' && (
            <div style={sty.ctaError}>{waitlistError || 'Something went wrong. Please try again.'}</div>
          )}
          <div style={sty.ctaGoldLine} />
        </div>

        {/* ---- Footer -------------------------------------------------- */}
        <div style={{
          ...sty.footer,
          animation: 'btcFadeIn 0.6s ease 0.7s both',
        }}>
          <LavernIlluminated
            color="rgba(250, 249, 246, 0.15)"
            glow="rgba(250, 249, 246, 0.4)"
          />
          <span style={sty.footerDot}>{'\u00B7'}</span>
          Billable Hours
          <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 10, letterSpacing: 1, opacity: 0.4 }}>
            <a href="#/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</a>
            <span>{'\u00B7'}</span>
            <a href="#/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
          </div>
        </div>
      </div>

      {/* -- Fog of War -- dark mist that dissolves on scroll -- */}
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

      {/* Keyframe animations */}
      <style>{`
        @keyframes btcFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes goldPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
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
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: D.bg,
    color: D.text,
    fontFamily: fonts.sans,
    overflow: 'auto' as const,
    zIndex: 1,
  },
  heroBg: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    objectFit: 'cover' as const,
    filter: 'brightness(0.08) contrast(1.1) saturate(0.12)',
    opacity: 0.45,
    pointerEvents: 'none' as const,
  },
  veil: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'radial-gradient(ellipse 80% 60% at center top, transparent 0%, rgba(10, 10, 15, 0.75) 100%)',
    pointerEvents: 'none' as const,
  },
  goldGlow: {
    position: 'fixed' as const,
    top: -180,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 700,
    height: 450,
    background: 'radial-gradient(ellipse at center, rgba(201, 162, 39, 0.07) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  container: {
    position: 'relative' as const,
    zIndex: 1,
    maxWidth: 820,
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
    backgroundColor: 'rgba(10, 10, 15, 0.6)',
    backdropFilter: 'blur(8px)',
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
    marginBottom: 80,
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
    opacity: 0.5,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 300,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: D.gold,
    margin: 0,
    letterSpacing: 2,
  },
  description: {
    fontSize: 15,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.7,
    maxWidth: 500,
    margin: '16px auto 0',
    textAlign: 'center' as const,
  },
  heroPriceWrap: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 32,
    gap: 2,
    lineHeight: 1,
  },
  heroPriceCent: {
    fontSize: 40,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: D.gold,
    marginTop: 12,
  },
  heroPriceNum: {
    fontSize: 96,
    fontFamily: fonts.serif,
    fontWeight: 200,
    color: D.white,
    letterSpacing: -2,
    lineHeight: 1,
  },
  heroPriceLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
    color: D.textFaint,
    margin: '4px 0 0',
    textAlign: 'center' as const,
  },
  heroSubtext: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textFaint,
    lineHeight: 1.7,
    maxWidth: 400,
    margin: '24px auto 0',
    textAlign: 'center' as const,
  },

  // -- Section
  section: {
    marginBottom: 72,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 32,
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
    marginBottom: 36,
    letterSpacing: 0.3,
    textAlign: 'center' as const,
  },

  // -- Step Grid (How It Works)
  stepGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
  },
  stepCard: {
    padding: '32px 24px 28px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 10,
    transition: 'border-color 0.3s ease, background-color 0.3s ease',
  },
  stepNumberCircle: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: `1.5px solid ${D.goldDim}`,
    backgroundColor: D.goldGhost,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepNumberText: {
    fontSize: 20,
    fontWeight: 400,
    fontFamily: fonts.serif,
    color: D.gold,
    lineHeight: 1,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: 600,
    fontFamily: fonts.serif,
    color: D.white,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.6,
  },
  stepAccent: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: D.gold,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginTop: 4,
    padding: '3px 10px',
    borderRadius: 20,
    border: `1px solid ${D.goldDim}`,
    backgroundColor: D.goldGhost,
  },

  // -- Engagement list (What an Hour Gets You)
  engList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  engRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '18px 24px',
    borderBottom: `1px solid ${D.border}`,
    gap: 16,
    transition: 'background-color 0.2s ease',
  },
  engGoldBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
    backgroundColor: D.goldDim,
    flexShrink: 0,
  },
  engContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  engDesc: {
    fontSize: 15,
    fontFamily: fonts.sans,
    color: D.text,
    lineHeight: 1.4,
  },
  engBarTrack: {
    width: '100%',
    height: 3,
    backgroundColor: D.surface,
    borderRadius: 2,
  },
  engBarFill: {
    height: '100%',
    borderRadius: 2,
    background: `linear-gradient(90deg, ${D.goldDim}, ${D.gold})`,
    transition: 'width 0.8s ease',
  },
  engRight: {
    textAlign: 'right' as const,
    flexShrink: 0,
    minWidth: 80,
  },
  engHours: {
    fontSize: 16,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: D.gold,
  },
  engCost: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.textFaint,
    marginTop: 2,
  },
  engFootnote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textFaint,
    textAlign: 'center' as const,
    lineHeight: 1.6,
    maxWidth: 480,
    margin: '16px auto 0',
  },

  // -- Rate Grid (Who's on Your Team)
  rateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
    marginBottom: 20,
  },
  rateCard: {
    padding: '28px 20px',
    border: `1px solid ${D.borderMed}`,
    borderRadius: radii.md,
    backgroundColor: D.surfaceLight,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    transition: 'border-color 0.3s ease, background-color 0.3s ease',
  },
  rateTier: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: D.gold,
    fontFamily: fonts.sans,
  },
  rateTitle: {
    fontSize: 22,
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
    backgroundColor: D.borderMed,
    margin: '8px 0',
  },
  rateHours: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  rateHoursValue: {
    fontSize: 24,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: D.gold,
  },
  rateHoursLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: D.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  rateCostLine: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.textDim,
    marginTop: 4,
  },
  rateTraditional: {
    marginTop: 14,
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

  // -- Plan cards
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
    marginBottom: 20,
  },
  planCard: {
    padding: '32px 24px 28px',
    border: `1px solid ${D.borderMed}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
    cursor: 'default',
    position: 'relative' as const,
  },
  planBadge: {
    position: 'absolute' as const,
    top: -10,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
    color: D.bg,
    backgroundColor: D.gold,
    padding: '3px 12px',
    borderRadius: 20,
  },
  planName: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
    color: D.textDim,
    marginTop: 4,
  },
  planHours: {
    fontSize: 30,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    lineHeight: 1,
  },
  planPrice: {
    fontSize: 20,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: D.gold,
  },
  planPerHour: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.textFaint,
  },
  planDivider: {
    width: 40,
    height: 1,
    backgroundColor: D.border,
    margin: '6px 0',
  },
  planFeatures: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    alignItems: 'flex-start',
    width: '100%',
    paddingLeft: 8,
  },
  planFeature: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.4,
    textAlign: 'left' as const,
  },
  planCheck: {
    color: D.gold,
    fontSize: 11,
    fontWeight: 700,
    marginRight: 4,
  },
  planDesc: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.5,
    marginTop: 4,
  },
  applePayBtn: {
    marginTop: 12,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    color: '#fff',
    backgroundColor: '#000',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    width: '100%',
    letterSpacing: 0.5,
  },
  buyBtn: {
    marginTop: 8,
    padding: '10px 24px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: D.bg,
    backgroundColor: D.gold,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    width: '100%',
  },

  // -- Free banner (Get Started)
  freeBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '28px 32px',
    border: `1px solid ${D.goldFaint}`,
    borderRadius: radii.md,
    backgroundColor: D.goldGhost,
    gap: 24,
  },
  freeBannerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  freeBannerTitle: {
    fontSize: 24,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    lineHeight: 1,
  },
  freeBannerDesc: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.5,
    maxWidth: 380,
  },
  freeBannerBadge: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: fonts.mono,
    letterSpacing: 3,
    color: D.green,
    padding: '8px 20px',
    borderRadius: 24,
    backgroundColor: D.greenDim,
    flexShrink: 0,
  },

  // -- Pack grid (Buy Hours)
  packGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
    marginBottom: 16,
  },
  packNote: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: D.textFaint,
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },

  // -- Subscription cards (Subscribe & Save)
  subGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 20,
  },
  subCard: {
    padding: '32px 28px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    transition: 'border-color 0.25s ease',
  },
  subName: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
    color: D.textDim,
  },
  subHours: {
    fontSize: 26,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    lineHeight: 1.2,
    marginTop: 4,
  },
  subPrice: {
    fontSize: 20,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: D.gold,
    marginTop: 4,
  },
  subPeriod: {
    fontSize: 13,
    fontWeight: 400,
    color: D.textDim,
  },
  subPerHour: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.textFaint,
    marginTop: 2,
  },
  subDivider: {
    width: 40,
    height: 1,
    backgroundColor: D.border,
    margin: '12px 0 8px',
  },
  subFeature: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.8,
  },

  // -- Comparison cards
  compList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  compCard: {
    padding: '20px 28px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    transition: 'border-color 0.2s ease',
  },
  compTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  compDocName: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
  },
  compSavingsBadge: {
    fontSize: 13,
    fontFamily: fonts.mono,
    fontWeight: 700,
    color: D.green,
    padding: '2px 10px',
    borderRadius: 20,
    backgroundColor: D.greenDim,
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
  compLavern: {
    fontSize: 22,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: D.gold,
  },
  compHoursNote: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.textFaint,
    marginTop: 2,
  },
  compFirm: {
    fontSize: 22,
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
    color: D.green,
  },

  // -- Feature cards
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  card: {
    padding: '24px 24px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 10,
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
    padding: '36px 32px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 10,
  },
  clawEmoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  clawTitle: {
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
  },
  clawDesc: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.text,
    lineHeight: 1.7,
    maxWidth: 480,
    marginBottom: 8,
  },
  clawPrice: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 4,
  },
  clawNote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: D.textFaint,
    lineHeight: 1.5,
    maxWidth: 400,
  },

  // -- Waitlist CTA
  ctaSection: {
    textAlign: 'center' as const,
    padding: '56px 0 64px',
    marginBottom: 0,
  },
  ctaGoldLine: {
    width: 40,
    height: 2,
    backgroundColor: D.goldDim,
    margin: '0 auto 28px',
  },
  ctaTitle: {
    fontSize: 30,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    margin: '0 0 12px',
    letterSpacing: 0.3,
  },
  ctaSubtext: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textDim,
    margin: '0 0 28px',
  },
  ctaForm: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 460,
    margin: '0 auto',
  },
  ctaInput: {
    flex: 1,
    padding: '12px 18px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.white,
    backgroundColor: D.surfaceLight,
    border: `1px solid ${D.borderHover}`,
    borderRadius: radii.sm,
    outline: 'none',
  },
  ctaButton: {
    padding: '12px 28px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: D.bg,
    backgroundColor: D.gold,
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'opacity 0.25s ease',
    flexShrink: 0,
  },
  ctaDone: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: D.gold,
  },
  ctaDoneCheck: {
    color: D.green,
    fontStyle: 'normal' as const,
    fontWeight: 700,
  },
  ctaError: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: D.accent,
    marginTop: 12,
  },

  // -- Footer
  footer: {
    textAlign: 'center' as const,
    paddingTop: 32,
    paddingBottom: 40,
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
