/**
 * AgentDocsView — Interactive API documentation for agent clients.
 *
 * Fetches GET /api/capabilities and renders the machine-readable manifest
 * as a warm editorial documentation page. Includes:
 *   - Registration form (creates agent client, shows API key once)
 *   - Live code examples (curl, Python, JS)
 *   - Workflow catalog with cost estimates
 *   - Sync vs webhook mode explanation
 *
 * Styled in the Marble warm editorial design system.
 * v10: The agent-facing entry point — Act 2 of the Legal Singularity.
 */

import { useState, useEffect, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface Props {
  onBack: () => void;
}

// ── Types for capabilities response ─────────────────────────────────────

interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: number;
  agents: number;
  gates: number;
}

interface IntensityTier {
  level: string;
  label: string;
  description: string;
  estimatedCostUsd: number;
  estimatedMinutes: [number, number];
  teamSize: number;
  gates: string;
}

interface Capabilities {
  service: {
    name: string;
    tagline: string;
    version: string;
    description: string;
  };
  workflows: Workflow[];
  intensityTiers: IntensityTier[];
  jurisdictions: string[];
  quickstart: string[];
}

// ── Code example tabs ───────────────────────────────────────────────────

type CodeLang = 'curl' | 'python' | 'javascript';

function codeExamples(apiKey: string, baseUrl: string): Record<CodeLang, string> {
  const key = apiKey || '<your-api-key>';
  return {
    curl: `# Register as an agent
curl -X POST ${baseUrl}/api/clients \\
  -H 'Content-Type: application/json' \\
  -d '{"type": "agent", "name": "My Agent"}'

# Engage — synchronous mode
curl -X POST ${baseUrl}/api/engage \\
  -H 'Authorization: Bearer ${key}' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "task": "Review this NDA for risks and unusual clauses",
    "documents": [{
      "name": "nda-draft.txt",
      "content": "NON-DISCLOSURE AGREEMENT..."
    }],
    "constraints": {
      "intensity": "standard",
      "maxBudgetUsd": 10
    }
  }'`,

    python: `import requests

BASE = "${baseUrl}"

# Register
reg = requests.post(f"{BASE}/api/clients", json={
    "type": "agent",
    "name": "My Python Agent"
})
api_key = reg.json()["apiKey"]

# Engage
result = requests.post(
    f"{BASE}/api/engage",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "task": "What is the statute of limitations "
               "for breach of contract in California?",
        "constraints": {"intensity": "quick"}
    }
)

data = result.json()
print(data["deliverables"]["output"])
print(f"Cost: \${data['cost']['totalUsd']}")`,

    javascript: `const BASE = "${baseUrl}";

// Register
const reg = await fetch(\`\${BASE}/api/clients\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "agent", name: "My JS Agent" })
});
const { apiKey } = await reg.json();

// Engage
const res = await fetch(\`\${BASE}/api/engage\`, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${apiKey}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    task: "Analyze this SaaS agreement for data "
        + "processing compliance under GDPR",
    documents: [{
      name: "saas-agreement.txt",
      content: "SERVICE AGREEMENT..."
    }],
    context: { jurisdiction: "EU" },
    constraints: { intensity: "thorough" }
  })
});

const data = await res.json();
console.log(data.deliverables.output);
console.log(\`Quality: \${data.quality.confidence}\`);`,
  };
}

// ── Registration form ───────────────────────────────────────────────────

function RegistrationSection() {
  const [name, setName] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRegister = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        type: 'agent',
        name: name.trim() || undefined,
      };
      if (callbackUrl.trim()) {
        body.callbackUrl = callbackUrl.trim();
      }

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Registration failed (${res.status})`);
      }

      const data = await res.json();
      setApiKey(data.apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }, [name, callbackUrl]);

  const handleCopy = useCallback(() => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [apiKey]);

  if (apiKey) {
    return (
      <div style={styles.registrationCard}>
        <div style={styles.successBadge}>Registered</div>
        <p style={styles.keyWarning}>
          Store this API key securely. It will not be shown again.
        </p>
        <div style={styles.keyDisplay}>
          <code style={styles.keyCode}>{apiKey}</code>
          <button onClick={handleCopy} style={styles.copyBtn}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.registrationCard}>
      <h3 style={styles.sectionTitle}>Register Your Agent</h3>
      <div style={styles.formRow}>
        <label style={styles.label}>Agent Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Legal Agent"
          style={styles.input}
        />
      </div>
      <div style={styles.formRow}>
        <label style={styles.label}>
          Callback URL <span style={styles.optional}>(optional, for webhook mode)</span>
        </label>
        <input
          type="url"
          value={callbackUrl}
          onChange={e => setCallbackUrl(e.target.value)}
          placeholder="https://your-agent.example.com/webhook"
          style={styles.input}
        />
      </div>
      {error && <div style={styles.errorText}>{error}</div>}
      <button
        onClick={handleRegister}
        disabled={loading}
        style={{
          ...styles.registerBtn,
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? 'Registering...' : 'Register & Get API Key'}
      </button>
    </div>
  );
}

// ── Main View ───────────────────────────────────────────────────────────

export default function AgentDocsView({ onBack }: Props) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<CodeLang>('curl');

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://localhost:3000';

  useEffect(() => {
    fetch('/api/capabilities')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load capabilities (${res.status})`);
        return res.json();
      })
      .then(data => setCapabilities(data))
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const examples = codeExamples('', baseUrl);

  return (
    <div style={styles.container}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={styles.backBtn}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
      >
        {'\u2190'} Back
      </button>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          Marble <span style={{ fontStyle: 'italic' }}>for Agents</span>
        </h1>
        <p style={styles.subtitle}>
          Structured legal intelligence, delivered as JSON.
        </p>
        <p style={styles.description}>
          Same multi-agent orchestration engine that serves human clients.
          Send a task, receive structured results with deliverables, quality signals, and cost.
        </p>
      </div>

      {/* Quickstart */}
      {capabilities && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>Quickstart</h2>
          <div style={styles.quickstartList}>
            {capabilities.quickstart.map((step, i) => (
              <div key={i} style={styles.quickstartItem}>
                <code style={styles.quickstartCode}>{step}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registration */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>1. Register</h2>
        <RegistrationSection />
      </div>

      {/* Code Examples */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>2. Engage</h2>
        <p style={styles.bodyText}>
          Send a legal task and receive structured results. Choose sync mode for immediate responses
          or webhook mode for background processing.
        </p>

        {/* Language tabs */}
        <div style={styles.langTabs}>
          {(['curl', 'python', 'javascript'] as CodeLang[]).map(lang => (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              style={{
                ...styles.langTab,
                ...(activeLang === lang ? styles.langTabActive : {}),
              }}
            >
              {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'JavaScript'}
            </button>
          ))}
        </div>

        <pre style={styles.codeBlock}>
          <code>{examples[activeLang]}</code>
        </pre>
      </div>

      {/* Sync vs Webhook */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>3. Delivery Modes</h2>
        <div style={styles.modeGrid}>
          <div style={styles.modeCard}>
            <div style={styles.modeLabel}>Sync</div>
            <div style={styles.modeDescription}>
              Request blocks until the session completes. Returns the full structured response
              with deliverables, quality signals, and cost. Default mode. Timeout: 5 minutes.
            </div>
            <code style={styles.modeCode}>{"\"mode\": \"sync\""}</code>
          </div>
          <div style={styles.modeCard}>
            <div style={styles.modeLabel}>Webhook</div>
            <div style={styles.modeDescription}>
              Returns immediately with status URLs. Full results are POSTed to your callback URL
              when the session completes. Monitor progress via WebSocket events.
            </div>
            <code style={styles.modeCode}>{"\"mode\": \"webhook\", \"callbackUrl\": \"...\""}</code>
          </div>
        </div>
      </div>

      {/* Workflows */}
      {capabilities && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>4. Available Workflows</h2>
          <p style={styles.bodyText}>
            Tasks are automatically routed to the optimal workflow. You can also force a specific workflow.
          </p>
          <div style={styles.workflowGrid}>
            {capabilities.workflows.map(w => (
              <div key={w.id} style={styles.workflowCard}>
                <div style={styles.workflowName}>{w.name}</div>
                <div style={styles.workflowId}>{w.id}</div>
                <div style={styles.workflowDescription}>{w.description}</div>
                <div style={styles.workflowMeta}>
                  {w.steps} steps &middot; {w.agents} agents &middot; {w.gates} gates
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intensity Tiers */}
      {capabilities && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>5. Intensity & Pricing</h2>
          <p style={styles.bodyText}>
            Control the depth of analysis and cost with intensity levels.
            Budget is enforced as a hard cap — the session halts if exceeded.
          </p>
          <div style={styles.tierGrid}>
            {capabilities.intensityTiers.map(tier => (
              <div key={tier.level} style={styles.tierCard}>
                <div style={styles.tierLabel}>{tier.label}</div>
                <div style={styles.tierCost}>~${tier.estimatedCostUsd}</div>
                <div style={styles.tierDescription}>{tier.description}</div>
                <div style={styles.tierMeta}>
                  {tier.estimatedMinutes[0]}&ndash;{tier.estimatedMinutes[1]} min &middot;{' '}
                  {tier.teamSize} agents &middot; {tier.gates} gates
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response Structure */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>6. Response Structure</h2>
        <pre style={styles.codeBlock}>
          <code>{`{
  "engagementId": "shem-1234567890",
  "status": "completed",
  "deliverables": {
    "output": "Full synthesized analysis text...",
    "findings": [
      { "agent": "contract-reviewer", "text": "...", "category": "contract-risk" }
    ],
    "resolutions": [
      { "finding": "F-001", "resolution": "...", "decidedBy": "orchestrator" }
    ]
  },
  "quality": {
    "evaluatorScore": 85,
    "verificationPassRate": 0.92,
    "confidence": 0.88
  },
  "cost": {
    "totalUsd": 3.42,
    "budgetUsd": 10.00
  },
  "metadata": {
    "workflowUsed": "review",
    "teamRoles": ["contract-reviewer", "risk-pricer", "evaluator"],
    "durationMs": 45000,
    "eventCount": 128
  }
}`}</code>
        </pre>
      </div>

      {/* Jurisdictions */}
      {capabilities && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>7. Supported Jurisdictions</h2>
          <div style={styles.jurisdictionRow}>
            {capabilities.jurisdictions.map(j => (
              <span key={j} style={styles.jurisdictionBadge}>{j}</span>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div style={styles.errorBanner}>
          Could not load live capabilities: {loadError}.
          The examples above use static defaults. Start the server to see live data.
        </div>
      )}

      {/* Service info */}
      {capabilities && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            {capabilities.service.name} v{capabilities.service.version}
          </span>
          <span style={styles.footerDot}>&middot;</span>
          <span style={styles.footerText}>{capabilities.service.tagline}</span>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100vh',
    overflow: 'auto',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    maxWidth: 860,
    margin: '0 auto',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute' as const,
    left: 48,
    top: 48,
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: spacing.xxxl,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: 36,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.text,
    margin: 0,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    marginTop: 8,
    maxWidth: 540,
    margin: '8px auto 0',
    lineHeight: 1.6,
  },

  // Sections
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionHeading: {
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
    margin: '0 0 16px 0',
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.border}`,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
    margin: '0 0 16px 0',
  },
  bodyText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    marginBottom: 16,
  },

  // Quickstart
  quickstartList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  quickstartItem: {
    padding: '8px 12px',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
  },
  quickstartCode: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Registration
  registrationCard: {
    padding: spacing.xl,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  formRow: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  optional: {
    fontWeight: 400,
    textTransform: 'none' as const,
    color: colors.textMuted,
    letterSpacing: 0,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgInput,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.text,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  registerBtn: {
    padding: '10px 24px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    marginTop: 4,
    marginBottom: 8,
  },
  successBadge: {
    display: 'inline-block',
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.success,
    border: `1px solid ${colors.success}`,
    borderRadius: radii.pill,
    padding: '2px 10px',
    marginBottom: 12,
  },
  keyWarning: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.danger,
    fontWeight: 500,
    marginBottom: 12,
  },
  keyDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
  },
  keyCode: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.text,
    flex: 1,
    wordBreak: 'break-all' as const,
  },
  copyBtn: {
    padding: '4px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Code examples
  langTabs: {
    display: 'flex',
    gap: 0,
    marginBottom: 0,
    borderBottom: `1px solid ${colors.border}`,
  },
  langTab: {
    padding: '8px 20px',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
    cursor: 'pointer',
    transition: 'color 0.2s ease, border-color 0.2s ease',
  },
  langTabActive: {
    color: colors.text,
    borderBottomColor: colors.text,
  },
  codeBlock: {
    padding: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: `0 0 ${radii.md}px ${radii.md}px`,
    color: '#E0DED8',
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1.6,
    overflow: 'auto' as const,
    whiteSpace: 'pre' as const,
    margin: 0,
  },

  // Modes
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  modeCard: {
    padding: spacing.xl,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
  },
  modeLabel: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 8,
  },
  modeDescription: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  modeCode: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.bgPanel,
    padding: '2px 6px',
    borderRadius: radii.sm,
  },

  // Workflows
  workflowGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  workflowCard: {
    padding: 16,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  workflowName: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
  },
  workflowId: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textMuted,
    marginBottom: 6,
  },
  workflowDescription: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  workflowMeta: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },

  // Tiers
  tierGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
  },
  tierCard: {
    padding: 16,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    textAlign: 'center' as const,
  },
  tierLabel: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: colors.text,
  },
  tierCost: {
    fontSize: 22,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.accent,
    margin: '4px 0',
  },
  tierDescription: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  tierMeta: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },

  // Jurisdictions
  jurisdictionRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  jurisdictionBadge: {
    padding: '6px 16px',
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: 600,
    color: colors.textSecondary,
  },

  // Error
  errorBanner: {
    padding: '12px 16px',
    borderRadius: radii.md,
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    border: `1px solid ${colors.danger}`,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    marginTop: spacing.xl,
  },

  // Footer
  footer: {
    textAlign: 'center' as const,
    marginTop: spacing.xxxl,
    paddingTop: spacing.xl,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  footerDot: {
    fontSize: 12,
    color: colors.textDim,
  },
};
