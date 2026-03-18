/**
 * AgentDocsView — Lavern for Agents.
 *
 * Same dark marble aesthetic as the front door, but the content
 * is data-dense and machine-readable. Serif headlines, monospace
 * data blocks, warm cream on near-black.
 *
 * Still Lavern. Just the back office.
 */

import { useState, useEffect, useCallback } from 'react';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';

interface Props {
  onBack: () => void;
}

// ── Types ────────────────────────────────────────────────────────────

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

// ── Dark palette — Lavern at night ────────────────────────────────

const D = {
  bg: '#0A0A0F',
  surface: 'rgba(250, 249, 246, 0.03)',
  border: 'rgba(250, 249, 246, 0.08)',
  borderHover: 'rgba(250, 249, 246, 0.2)',
  accent: colors.accent,
  accentDim: 'rgba(196, 93, 62, 0.6)',
  text: 'rgba(250, 249, 246, 0.8)',
  textDim: 'rgba(250, 249, 246, 0.4)',
  textFaint: 'rgba(250, 249, 246, 0.15)',
  white: 'rgba(250, 249, 246, 0.92)',
};

// ── Code examples ────────────────────────────────────────────────────

type CodeLang = 'curl' | 'python' | 'javascript';

function getExamples(base: string): Record<CodeLang, string> {
  return {
    curl: `# Engage — synchronous mode
curl -X POST ${base}/api/engage \\
  -H "Authorization: Bearer <key>" \\
  -H "Content-Type: application/json" \\
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

res = requests.post(
    "${base}/api/engage",
    headers={"Authorization": "Bearer <key>"},
    json={
        "task": "Statute of limitations for breach "
               "of contract in California?",
        "constraints": {"intensity": "quick"}
    }
)

data = res.json()
print(data["deliverables"]["output"])
print(f"Cost: \${data['cost']['totalUsd']}")
print(f"Confidence: {data['quality']['confidence']}")`,

    javascript: `const res = await fetch("${base}/api/engage", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <key>",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    task: "Analyze SaaS agreement for GDPR compliance",
    documents: [{
      name: "saas-agreement.txt",
      content: "SERVICE AGREEMENT..."
    }],
    context: { jurisdiction: "EU" },
    constraints: { intensity: "thorough" }
  })
});

const { deliverables, quality, cost } = await res.json();`,
  };
}

// ── Response schema ──────────────────────────────────────────────────

const RESPONSE_SCHEMA = `{
  "engagementId": "shem-1234567890",
  "status": "completed",
  "deliverables": {
    "output": "Full synthesized analysis...",
    "findings": [
      {
        "agent": "contract-reviewer",
        "text": "Section 4.2(a) contains non-mutual indemnification...",
        "category": "contract-risk",
        "citation": "Section 4.2(a), lines 142-158"
      }
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
    "budgetUsd": 10.00,
    "breakdown": [
      { "agent": "contract-reviewer", "usd": 1.80 },
      { "agent": "risk-pricer", "usd": 0.95 },
      { "agent": "evaluator", "usd": 0.67 }
    ]
  },
  "metadata": {
    "workflowUsed": "review",
    "teamRoles": ["contract-reviewer", "risk-pricer", "evaluator"],
    "durationMs": 45000,
    "eventCount": 128
  }
}`;

// ── Section wrapper ──────────────────────────────────────────────────

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
        animation: `agentFadeIn 0.6s ease ${delay}s both`,
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

// ── Registration ─────────────────────────────────────────────────────

function RegisterBlock() {
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
      const body: Record<string, unknown> = { type: 'agent' };
      if (name.trim()) body.name = name.trim();
      if (callbackUrl.trim()) body.callbackUrl = callbackUrl.trim();

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Registration failed (${res.status})`);
      }

      const d = await res.json();
      setApiKey(d.apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }, [name, callbackUrl]);

  if (apiKey) {
    return (
      <div style={sty.card}>
        <div style={{ color: D.accent, fontWeight: 600, marginBottom: 12, fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1 }}>
          REGISTERED
        </div>
        <div style={{ color: D.accentDim, fontSize: 12, marginBottom: 12, fontFamily: fonts.sans }}>
          Store this key securely. It will not be shown again.
        </div>
        <div style={sty.keyRow}>
          <code style={sty.keyCode}>{apiKey}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(apiKey);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={sty.smallBtn}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={sty.card}>
      <div style={sty.formRow}>
        <label style={sty.formLabel}>Agent Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Legal Agent"
          style={sty.input}
        />
      </div>
      <div style={sty.formRow}>
        <label style={sty.formLabel}>
          Callback URL <span style={{ fontWeight: 400, color: D.textFaint }}>(optional)</span>
        </label>
        <input
          value={callbackUrl}
          onChange={e => setCallbackUrl(e.target.value)}
          placeholder="https://your-agent.com/webhook"
          style={sty.input}
        />
      </div>
      {error && (
        <div style={{ color: D.accent, fontSize: 12, fontFamily: fonts.sans, marginTop: 4 }}>
          {error}
        </div>
      )}
      <button
        onClick={handleRegister}
        disabled={loading}
        style={{ ...sty.primaryBtn, marginTop: 16, opacity: loading ? 0.5 : 1 }}
      >
        {loading ? 'Registering...' : 'Register & Get API Key'}
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

// ── Pricing / Reputation types ────────────────────────────────────

interface PricingTier {
  level: string;
  label: string;
  suggestedTeamSize: number;
  estimatedCostUsd: { min: number; max: number };
  estimatedMinutes: [number, number];
  gateFrequency: string;
}

interface TokenRate {
  model: string;
  tier: string;
  inputPerMillion: number;
  outputPerMillion: number;
}

interface PricingData {
  tiers: PricingTier[];
  tokenRates: TokenRate[];
  paymentMethods: Array<{ method: string; status: string; description: string }>;
}

interface ReputationData {
  metrics: {
    totalEngagements: number;
    successRate: number | null;
    avgVerificationPassRate: number | null;
    avgDeliveryTimeMs: number | null;
    avgCostUsd: number | null;
  };
  trust: {
    multiAgentVerification: boolean;
    humanGateEnforcement: boolean;
    auditTrailAvailable: boolean;
    citationRequired: boolean;
    description: string;
  };
}

export default function AgentDocsView({ onBack }: Props) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [activeLang, setActiveLang] = useState<CodeLang>('curl');
  const [backHover, setBackHover] = useState(false);
  const [clawHover, setClawHover] = useState(false);

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : '';

  // Fetch capabilities, pricing, reputation in parallel
  useEffect(() => {
    fetch('/api/capabilities', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCapabilities(d); })
      .catch(err => console.warn('[AgentDocs] Failed to load capabilities:', err));

    fetch('/api/pricing', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPricing(d); })
      .catch(err => console.warn('[AgentDocs] Failed to load pricing:', err));

    fetch('/api/reputation', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReputation(d); })
      .catch(err => console.warn('[AgentDocs] Failed to load reputation:', err));
  }, []);

  const examples = getExamples(baseUrl);

  return (
    <div style={sty.page}>
      {/* Subtle texture — barely visible */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={sty.heroBg}
      />
      <div style={sty.veil} />

      {/* Back */}
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


      <div style={sty.container}>
        {/* ── Header ─────────────────────────────────────── */}
        <div style={{ ...sty.header, animation: 'agentFadeIn 0.8s ease 0.1s both' }}>
          <h1 style={sty.title}>
            <LavernIlluminated color="rgba(250,249,246,0.55)" glow="rgba(250,249,246,0.95)" />
          </h1>
          <p style={sty.subtitle}>for Agents</p>
          <p style={sty.description}>
            Structured legal intelligence, delivered as JSON.
            Same multi-agent engine that serves human clients.
          </p>
        </div>

        {/* ── SIGNAL ──────────────────────────────────── */}
        <Section label="Why Lavern" delay={0.2}>
          <div style={sty.pitch}>
            You handle the reasoning.
            <br />
            We handle the law.
          </div>

          <div style={sty.metricGrid}>
            <MetricCard value="49" label="Specialist Agents" />
            <MetricCard value="40+" label="MCP Tools" />
            <MetricCard value="4" label="Workflows" />
            <MetricCard value="5" label="Jurisdictions" />
          </div>

          <div style={sty.bulletList}>
            <div style={sty.bullet}>Structured JSON deliverables {'\u2014'} no parsing required</div>
            <div style={sty.bullet}>Every finding cites source text as evidence</div>
            <div style={sty.bullet}>Every output cross-verified by evaluator agent</div>
            <div style={sty.bullet}>Hard budget enforcement {'\u2014'} you control spend</div>
            <div style={sty.bullet}>Human-gated quality at every decision point</div>
          </div>
        </Section>

        {/* ── REGISTER ────────────────────────────────── */}
        <Section label="Register" delay={0.25}>
          <RegisterBlock />
        </Section>

        {/* ── ENGAGE ──────────────────────────────────── */}
        <Section label="Engage" delay={0.3}>
          <div style={sty.endpoint}>
            <span style={{ color: D.accent }}>POST</span>{' '}
            <span style={{ color: D.white }}>/api/engage</span>
          </div>

          <div style={sty.langTabs}>
            {(['curl', 'python', 'javascript'] as CodeLang[]).map(lang => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                style={{
                  ...sty.langTab,
                  color: activeLang === lang ? D.white : D.textDim,
                  borderBottomColor: activeLang === lang ? D.accent : 'transparent',
                }}
              >
                {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'JavaScript'}
              </button>
            ))}
          </div>

          <pre style={sty.code}>{examples[activeLang]}</pre>
        </Section>

        {/* ── DELIVERY MODES ──────────────────────────── */}
        <Section label="Delivery Modes" delay={0.35}>
          <div style={sty.modeGrid}>
            <div style={sty.card}>
              <div style={sty.modeTitle}>Sync</div>
              <div style={sty.modeDesc}>
                Request blocks until complete. Full structured response returned.
                Timeout: 5 minutes.
              </div>
              <code style={sty.modeCode}>{'"mode": "sync"'}</code>
            </div>
            <div style={sty.card}>
              <div style={sty.modeTitle}>Webhook</div>
              <div style={sty.modeDesc}>
                Returns immediately with status URLs. Results POSTed to your callback.
                Monitor progress via WebSocket.
              </div>
              <code style={sty.modeCode}>{'"mode": "webhook"'}</code>
            </div>
          </div>
        </Section>

        {/* ── WORKFLOWS ───────────────────────────────── */}
        {capabilities && (
          <Section label="Workflows" delay={0.4}>
            <table style={sty.table}>
              <thead>
                <tr>
                  <th style={sty.th}>ID</th>
                  <th style={sty.th}>Agents</th>
                  <th style={sty.th}>Steps</th>
                  <th style={sty.th}>Gates</th>
                  <th style={sty.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.workflows.map(w => (
                  <tr key={w.id}>
                    <td style={{ ...sty.td, color: D.accent, fontFamily: fonts.mono }}>{w.id}</td>
                    <td style={sty.td}>{w.agents}</td>
                    <td style={sty.td}>{w.steps}</td>
                    <td style={sty.td}>{w.gates}</td>
                    <td style={{ ...sty.td, color: D.textDim }}>{w.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── PRICING ─────────────────────────────────── */}
        {capabilities && (
          <Section label="Intensity & Pricing" delay={0.45}>
            <table style={sty.table}>
              <thead>
                <tr>
                  <th style={sty.th}>Level</th>
                  <th style={sty.th}>Cost</th>
                  <th style={sty.th}>Time</th>
                  <th style={sty.th}>Team</th>
                  <th style={sty.th}>Oversight</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.intensityTiers.map(tier => (
                  <tr key={tier.level}>
                    <td style={{ ...sty.td, color: D.accent, fontFamily: fonts.mono }}>{tier.level}</td>
                    <td style={{ ...sty.td, color: D.white, fontWeight: 600, fontFamily: fonts.mono }}>
                      ~${tier.estimatedCostUsd}
                    </td>
                    <td style={{ ...sty.td, fontFamily: fonts.mono }}>
                      {tier.estimatedMinutes[0]}&ndash;{tier.estimatedMinutes[1]}m
                    </td>
                    <td style={sty.td}>{tier.teamSize} agents</td>
                    <td style={{ ...sty.td, color: D.textDim }}>{tier.gates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── RESPONSE ────────────────────────────────── */}
        <Section label="Response Structure" delay={0.5}>
          <pre style={sty.code}>{RESPONSE_SCHEMA}</pre>
        </Section>

        {/* ── JURISDICTIONS ────────────────────────────── */}
        {capabilities && (
          <Section label="Jurisdictions" delay={0.55}>
            <div style={sty.badgeRow}>
              {capabilities.jurisdictions.map(j => (
                <span key={j} style={sty.badge}>{j}</span>
              ))}
            </div>
          </Section>
        )}

        {/* ── COMPATIBILITY ────────────────────────────── */}
        <Section label="Compatibility" delay={0.6}>
          <p style={sty.bodyText}>
            Any agent framework. Any HTTP client. Any language.
          </p>
          <div style={sty.badgeRow}>
            {['LangChain', 'CrewAI', 'AutoGPT', 'Claude MCP', 'OpenAI Actions', 'Custom'].map(f => (
              <span key={f} style={sty.badge}>{f}</span>
            ))}
          </div>
        </Section>

        {/* ── DISCOVERY ────────────────────────────────── */}
        <Section label="Discovery" delay={0.65}>
          <p style={sty.bodyText}>
            Machine-readable endpoints for automated service discovery. No human docs needed.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { path: '/.well-known/agent.json', label: 'A2A Agent Card', desc: 'Google/DeepMind standard for agent-to-agent discovery' },
              { path: '/.well-known/ai-plugin.json', label: 'Plugin Manifest', desc: 'OpenAI plugin format for ChatGPT Actions' },
              { path: '/openapi.json', label: 'OpenAPI 3.0', desc: 'Machine-readable API specification' },
              { path: '/llms.txt', label: 'llms.txt', desc: 'AI crawler guidance (like robots.txt for LLMs)' },
              { path: '/api/capabilities', label: 'Capabilities', desc: 'Full service manifest with workflows and pricing' },
            ].map(ep => (
              <div key={ep.path} style={sty.discoveryRow}>
                <code style={{ color: D.accent, fontFamily: fonts.mono, fontSize: 12, minWidth: 260, flexShrink: 0 }}>
                  GET {ep.path}
                </code>
                <span style={{ color: D.textDim, fontSize: 12, fontFamily: fonts.sans }}>
                  {ep.desc}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── TRUST & REPUTATION ──────────────────────── */}
        <Section label="Trust & Reputation" delay={0.7}>
          <p style={sty.bodyText}>
            Live metrics from the session archive. Cold-start safe.
          </p>
          <div style={{ ...sty.endpoint, marginBottom: 16 }}>
            <span style={{ color: D.accent }}>GET</span>{' '}
            <span style={{ color: D.white }}>/api/reputation</span>
          </div>
          {reputation && (
            <div style={sty.metricGrid}>
              <MetricCard
                value={String(reputation.metrics.totalEngagements)}
                label="Engagements"
              />
              <MetricCard
                value={reputation.metrics.successRate !== null ? `${Math.round(reputation.metrics.successRate * 100)}%` : '\u2014'}
                label="Success Rate"
              />
              <MetricCard
                value={reputation.metrics.avgVerificationPassRate !== null ? `${Math.round(reputation.metrics.avgVerificationPassRate * 100)}%` : '\u2014'}
                label="Verification"
              />
              <MetricCard
                value={reputation.metrics.avgCostUsd !== null ? `$${reputation.metrics.avgCostUsd.toFixed(2)}` : '\u2014'}
                label="Avg Cost"
              />
            </div>
          )}
          {reputation?.trust && (
            <div style={sty.bulletList}>
              {reputation.trust.multiAgentVerification && <div style={sty.bullet}>Multi-agent debate and cross-verification</div>}
              {reputation.trust.humanGateEnforcement && <div style={sty.bullet}>Human gate enforcement at decision points</div>}
              {reputation.trust.auditTrailAvailable && <div style={sty.bullet}>Full audit trail for every engagement</div>}
              {reputation.trust.citationRequired && <div style={sty.bullet}>Every finding must cite source text</div>}
            </div>
          )}
        </Section>

        {/* ── LIVE PRICING ─────────────────────────────── */}
        {pricing && (
          <Section label="Live Pricing" delay={0.75}>
            <div style={{ ...sty.endpoint, marginBottom: 16 }}>
              <span style={{ color: D.accent }}>GET</span>{' '}
              <span style={{ color: D.white }}>/api/pricing</span>
            </div>
            <table style={sty.table}>
              <thead>
                <tr>
                  <th style={sty.th}>Tier</th>
                  <th style={sty.th}>Cost Range</th>
                  <th style={sty.th}>Time</th>
                  <th style={sty.th}>Team</th>
                  <th style={sty.th}>Gates</th>
                </tr>
              </thead>
              <tbody>
                {pricing.tiers.map(t => (
                  <tr key={t.level}>
                    <td style={{ ...sty.td, color: D.accent, fontFamily: fonts.mono }}>{t.level}</td>
                    <td style={{ ...sty.td, color: D.white, fontWeight: 600, fontFamily: fonts.mono }}>
                      ${t.estimatedCostUsd.min}&ndash;${t.estimatedCostUsd.max}
                    </td>
                    <td style={{ ...sty.td, fontFamily: fonts.mono }}>
                      {t.estimatedMinutes[0]}&ndash;{t.estimatedMinutes[1]}m
                    </td>
                    <td style={sty.td}>{t.suggestedTeamSize} agents</td>
                    <td style={{ ...sty.td, color: D.textDim }}>{t.gateFrequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Token rates */}
            <div style={{ marginTop: 24 }}>
              <div style={{ ...sty.sectionLabel, marginBottom: 12 }}>Token Rates (per 1M tokens)</div>
              <table style={sty.table}>
                <thead>
                  <tr>
                    <th style={sty.th}>Model</th>
                    <th style={sty.th}>Tier</th>
                    <th style={sty.th}>Input</th>
                    <th style={sty.th}>Output</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.tokenRates.map(r => (
                    <tr key={r.model}>
                      <td style={{ ...sty.td, color: D.accent, fontFamily: fonts.mono, fontSize: 11 }}>{r.model}</td>
                      <td style={{ ...sty.td, color: D.textDim }}>{r.tier}</td>
                      <td style={{ ...sty.td, fontFamily: fonts.mono }}>${r.inputPerMillion}</td>
                      <td style={{ ...sty.td, fontFamily: fonts.mono }}>${r.outputPerMillion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── PAYMENT ─────────────────────────────────── */}
        <Section label="Payment" delay={0.8}>
          <div style={sty.modeGrid}>
            <div style={sty.card}>
              <div style={sty.modeTitle}>API Key (Fiat)</div>
              <div style={sty.modeDesc}>
                Register at POST /api/clients. Usage tracked per engagement.
                Budget cap enforced per session. Unused budget is not charged.
              </div>
              <div style={{ ...sty.badgeRow, marginTop: 8 }}>
                <span style={{ ...sty.badge, borderColor: D.accent, color: D.accent }}>Active</span>
              </div>
            </div>
            <div style={sty.card}>
              <div style={sty.modeTitle}>x402 (USDC on Base)</div>
              <div style={sty.modeDesc}>
                Pay per request with USDC via x402 protocol.
                No account needed {'\u2014'} include X-PAYMENT header.
                Agent-native micropayments.
              </div>
              <div style={{ ...sty.badgeRow, marginTop: 8 }}>
                <span style={{ ...sty.badge, borderColor: D.textDim }}>{'\u2022'} Coming Soon</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Claw Mode — the secret door ────────────── */}
        <div
          style={{
            marginTop: 80,
            paddingTop: 48,
            borderTop: `1px solid ${D.border}`,
            textAlign: 'center',
            animation: 'agentFadeIn 0.8s ease 2.5s both',
          }}
        >
          <div style={{
            fontSize: 11,
            fontFamily: fonts.sans,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: 'uppercase' as const,
            color: D.textDim,
            marginBottom: 20,
            opacity: 0.5,
          }}>
            {'\u00b7 \u00b7 \u00b7'}
          </div>
          <button
            onClick={() => { window.location.hash = '#/claw'; }}
            onMouseEnter={() => setClawHover(true)}
            onMouseLeave={() => setClawHover(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: '16px 32px',
              cursor: 'pointer',
              transition: 'all 0.5s ease',
              opacity: clawHover ? 1 : 0.3,
            }}
          >
            <div style={{
              fontSize: 32,
              marginBottom: 8,
              transition: 'transform 0.5s ease',
              transform: clawHover ? 'scale(1.2) rotate(-10deg)' : 'scale(1)',
            }}>
              {'\uD83E\uDD80'}
            </div>
            <div style={{
              fontFamily: fonts.serif,
              fontStyle: 'italic',
              fontSize: 14,
              color: clawHover ? 'rgba(250, 249, 246, 0.7)' : D.textDim,
              letterSpacing: 1,
              transition: 'color 0.5s ease',
            }}>
              Let it watch. Let it work.
            </div>
          </button>
        </div>

        {/* ── Footer ──────────────────────────────────── */}
        <div style={sty.footer}>
          <LavernIlluminated color="rgba(250,249,246,0.15)" glow="rgba(250,249,246,0.4)" />
          {capabilities && (
            <>
              <span style={sty.footerDot}>{'\u00b7'}</span>
              <span>v{capabilities.service.version}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const sty: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    backgroundColor: D.bg,
    overflow: 'auto',
    color: D.text,
  },

  // ── Background — barely visible ────────────────────────────────────
  heroBg: {
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    filter: 'brightness(0.1) contrast(1.1) saturate(0.15)',
    opacity: 0.5,
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  veil: {
    position: 'fixed',
    inset: 0,
    background: 'radial-gradient(ellipse 80% 60% at center top, transparent 0%, rgba(10, 10, 15, 0.7) 100%)',
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
    color: D.textDim,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'color 0.25s ease, border-color 0.25s ease',
  },

  // ── Header ─────────────────────────────────────────────────────────
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
  subtitle: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    fontWeight: 300,
    color: D.textDim,
    marginTop: 8,
    letterSpacing: 1,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textDim,
    marginTop: 20,
    lineHeight: 1.7,
    maxWidth: 480,
    margin: '20px auto 0',
  },

  // ── Section ────────────────────────────────────────────────────────
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

  // ── Signal ─────────────────────────────────────────────────────────
  pitch: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: D.white,
    lineHeight: 1.4,
    marginBottom: 32,
    letterSpacing: 0.3,
  },
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
    color: D.white,
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
    borderLeft: `2px solid ${D.border}`,
  },

  // ── Cards ──────────────────────────────────────────────────────────
  card: {
    padding: 24,
    border: `1px solid ${D.border}`,
    borderRadius: radii.md,
    backgroundColor: D.surface,
  },
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
  smallBtn: {
    padding: '4px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${D.border}`,
    backgroundColor: 'transparent',
    color: D.textDim,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  keyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    border: `1px solid ${D.border}`,
    borderRadius: radii.sm,
  },
  keyCode: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.mono,
    color: D.white,
    wordBreak: 'break-all' as const,
  },

  // ── Code ───────────────────────────────────────────────────────────
  endpoint: {
    fontSize: 14,
    fontFamily: fonts.mono,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  langTabs: {
    display: 'flex',
    gap: 0,
    borderBottom: `1px solid ${D.border}`,
  },
  langTab: {
    padding: '6px 18px',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'color 0.2s ease, border-color 0.2s ease',
  },
  code: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: `0 0 ${radii.md}px ${radii.md}px`,
    border: `1px solid ${D.border}`,
    borderTop: 'none',
    color: D.text,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1.7,
    overflow: 'auto' as const,
    whiteSpace: 'pre' as const,
    margin: 0,
  },

  // ── Modes ──────────────────────────────────────────────────────────
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  modeTitle: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 600,
    color: D.white,
    marginBottom: 8,
  },
  modeDesc: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  modeCode: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: D.accentDim,
  },

  // ── Tables ─────────────────────────────────────────────────────────
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    fontFamily: fonts.sans,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderBottom: `1px solid ${D.border}`,
    color: D.textDim,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    fontFamily: fonts.sans,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid rgba(250, 249, 246, 0.04)`,
    color: D.text,
    fontSize: 13,
  },

  // ── Badges ─────────────────────────────────────────────────────────
  badgeRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  badge: {
    padding: '6px 16px',
    border: `1px solid ${D.border}`,
    borderRadius: radii.pill,
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: D.textDim,
    letterSpacing: 0.3,
  },

  bodyText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: D.textDim,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  discoveryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${D.border}`,
    backgroundColor: D.surface,
  },

  // ── Footer ─────────────────────────────────────────────────────────
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
