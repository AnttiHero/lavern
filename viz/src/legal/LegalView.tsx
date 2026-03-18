/**
 * LegalView — Terms of Service & Privacy Policy placeholder pages.
 *
 * Renders placeholder legal text. Will be replaced with real legal
 * documents before public launch.
 */

interface Props {
  page: 'terms' | 'privacy';
  onBack?: () => void;
}

export default function LegalView({ page, onBack }: Props) {
  const isTerms = page === 'terms';

  return (
    <div style={styles.page}>
      {onBack && (
        <button onClick={onBack} style={styles.backBtn}>
          {'\u2190'} Back
        </button>
      )}

      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.wordmark}>LAVERN</span>
          <div style={styles.rule} />
          <h1 style={styles.title}>
            {isTerms ? 'Terms of Service' : 'Privacy Policy'}
          </h1>
          <p style={styles.date}>Last updated: March 2026</p>
        </div>

        <div style={styles.content}>
          {isTerms ? <TermsContent /> : <PrivacyContent />}
        </div>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Questions? Contact us at{' '}
            <a href="mailto:legal@lavern.legal" style={styles.link}>legal@lavern.legal</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <Section title="1. Service Description">
        Lavern is an AI-powered legal document analysis platform. Lavern does not provide legal advice.
        All outputs should be reviewed by qualified legal professionals before reliance.
      </Section>

      <Section title="2. Eligibility">
        You must be at least 18 years old and have legal capacity to enter into agreements.
        Access is currently by invitation only during our early access period.
      </Section>

      <Section title="3. Your Account">
        You are responsible for maintaining the confidentiality of your account credentials.
        You agree to provide accurate information and to notify us of any unauthorized use.
      </Section>

      <Section title="4. Billable Hours & Payments">
        Lavern uses a credit system measured in "billable hours." Purchased hours never expire.
        All payments are processed securely through Stripe. Refunds are handled on a case-by-case basis.
      </Section>

      <Section title="5. Your Data">
        Documents you upload are processed for the purpose of providing analysis.
        We do not use your documents to train AI models. See our Privacy Policy for details.
      </Section>

      <Section title="6. Acceptable Use">
        You agree not to use Lavern for any unlawful purpose, to attempt to circumvent security measures,
        or to reverse-engineer the service.
      </Section>

      <Section title="7. Limitation of Liability">
        Lavern is provided "as is." We make no warranties regarding the accuracy or completeness
        of any analysis. Our total liability is limited to the amount you have paid us in the
        preceding 12 months.
      </Section>

      <Section title="8. Disclaimer">
        Lavern is a legal technology tool, not a law firm. No attorney-client relationship is created
        by using our service. Always consult a qualified legal professional for legal advice.
      </Section>

      <Section title="9. Changes">
        We may update these terms from time to time. Continued use of the service after changes
        constitutes acceptance. We will notify you of material changes via email.
      </Section>

      <div style={styles.placeholder}>
        <p style={styles.placeholderText}>
          Complete terms of service are being finalized with our legal counsel.
          This is a preliminary version for the early access period.
        </p>
      </div>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <Section title="1. What We Collect">
        We collect your email address, display name, and firm name when you create an account.
        We process documents you upload solely to provide our analysis service.
      </Section>

      <Section title="2. How We Use Your Data">
        Your data is used exclusively to provide the Lavern service.
        We do not sell your personal data. We do not use your documents to train AI models.
      </Section>

      <Section title="3. Data Processing">
        Document analysis is performed using third-party AI models (Anthropic Claude, Mistral AI).
        Documents are transmitted securely and are not retained by these providers after processing.
        When EU Sovereign mode is selected, processing occurs exclusively within the EU.
      </Section>

      <Section title="4. Data Storage">
        Account data and session metadata are stored in our database.
        Uploaded documents are processed in-memory and are not permanently stored on our servers
        after your session completes.
      </Section>

      <Section title="5. Your Rights (GDPR)">
        If you are in the EU/EEA, you have the right to: access your data, correct inaccuracies,
        request deletion, export your data, and object to processing. Use the account settings
        page or contact us to exercise these rights.
      </Section>

      <Section title="6. Data Export & Deletion">
        You can export all your data at any time from your account settings (GET /api/auth/export).
        You can delete your account, which anonymizes your personal data while retaining
        anonymized analytics data.
      </Section>

      <Section title="7. Cookies">
        We use a single HttpOnly authentication cookie (lavern_token) for session management.
        We do not use tracking cookies or third-party analytics.
      </Section>

      <Section title="8. Security">
        Passwords are hashed using scrypt. All connections are encrypted with TLS.
        We implement rate limiting, CSRF protection, and regular security audits.
      </Section>

      <Section title="9. Contact">
        For privacy-related inquiries, contact us at legal@lavern.legal.
      </Section>

      <div style={styles.placeholder}>
        <p style={styles.placeholderText}>
          Complete privacy policy is being finalized with our legal counsel.
          This is a preliminary version for the early access period.
        </p>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <p style={styles.sectionText}>{children}</p>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: '#0A0A0F',
    color: '#FAF9F6',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 24px',
    boxSizing: 'border-box',
  },

  backBtn: {
    position: 'fixed',
    top: 28,
    left: 36,
    zIndex: 10,
    padding: '6px 14px',
    borderRadius: 4,
    border: '1.5px solid rgba(250, 249, 246, 0.3)',
    backgroundColor: 'transparent',
    color: 'rgba(250, 249, 246, 0.7)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },

  container: {
    maxWidth: 680,
    width: '100%',
  },

  header: {
    textAlign: 'center' as const,
    marginBottom: 48,
  },

  wordmark: {
    fontSize: 18,
    fontWeight: 300,
    letterSpacing: 8,
    fontFamily: "Georgia, 'Times New Roman', serif",
    opacity: 0.5,
  },

  rule: {
    width: 48,
    height: 1.5,
    backgroundColor: 'rgba(250, 249, 246, 0.15)',
    margin: '24px auto',
  },

  title: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 36,
    fontWeight: 300,
    margin: 0,
    letterSpacing: -0.5,
  },

  date: {
    fontSize: 12,
    opacity: 0.4,
    marginTop: 12,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },

  content: {
    lineHeight: 1.8,
  },

  section: {
    marginBottom: 32,
  },

  sectionTitle: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 20,
    fontWeight: 400,
    margin: '0 0 8px',
    color: '#C9A227',
  },

  sectionText: {
    fontSize: 14,
    lineHeight: 1.8,
    opacity: 0.7,
    margin: 0,
  },

  placeholder: {
    marginTop: 48,
    padding: '24px 28px',
    backgroundColor: 'rgba(201, 162, 39, 0.06)',
    border: '1px solid rgba(201, 162, 39, 0.2)',
    borderRadius: 8,
  },

  placeholderText: {
    fontSize: 13,
    fontStyle: 'italic',
    opacity: 0.6,
    margin: 0,
    textAlign: 'center' as const,
    lineHeight: 1.7,
  },

  footer: {
    marginTop: 64,
    paddingTop: 24,
    borderTop: '1px solid rgba(250, 249, 246, 0.08)',
    textAlign: 'center' as const,
  },

  footerText: {
    fontSize: 12,
    opacity: 0.4,
  },

  link: {
    color: '#C9A227',
    textDecoration: 'none',
  },
};
