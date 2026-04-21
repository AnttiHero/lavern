/**
 * ClawLiveView — Full-screen Clawern daemon mission control.
 * Route: /#/claw-live
 *
 * Self-contained, no API required. Runs a dense ~90s choreographed demo
 * script then loops. Three-column layout optimised for video recording.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Design tokens (dark cinematic, matching Claw theme) ──────────────

const BG       = '#080808';
const SURFACE  = 'rgba(250,249,246,0.03)';
const BORDER   = 'rgba(250,249,246,0.07)';
const TEXT      = '#FAF9F6';
const DIM       = 'rgba(250,249,246,0.38)';
const ACCENT    = '#E8845C';
const AMBER     = '#C9A84C';
const GREEN     = '#5C9E6E';
const RED       = '#C45D3E';
const MONO      = "'SF Mono','Fira Code',Menlo,monospace";
const SERIF     = "'Cormorant Garamond',Georgia,serif";
const SANS      = "'Inter',-apple-system,sans-serif";

// ── Types ─────────────────────────────────────────────────────────────

type Severity = 'critical' | 'major' | 'minor';
type EntryType = 'system' | 'agent' | 'finding' | 'debate' | 'precedent' | 'complete' | 'delivery';
type DocStatus = 'queued' | 'processing' | 'reviewing' | 'flagged' | 'complete' | 'local';

interface LogEntry {
  id: string;
  type: EntryType;
  icon: string;
  agent?: string;
  message: string;
  detail?: string;
  severity?: Severity;
  evidence?: string;
  debatePhase?: 'challenge' | 'response' | 'resolution';
}

interface Doc {
  id: string;
  name: string;
  ext: string;
  status: DocStatus;
  progress: number;
  findings: number;
  cost: string;
  confidential?: boolean;
}

interface Delivery {
  id: string;
  docName: string;
  findings: number;
  severity: Severity;
  elapsed: string;
}

interface State {
  docs: Doc[];
  deliveries: Delivery[];
  log: LogEntry[];
  findingsCritical: number;
  findingsMajor: number;
  findingsMinor: number;
  agentsActive: number;
  budgetUsed: number;
  budgetTotal: number;
  runtime: number;
}

type SetState = React.Dispatch<React.SetStateAction<State>>;

// ── Initial state ─────────────────────────────────────────────────────

const INIT: State = {
  docs: [],
  deliveries: [],
  log: [],
  findingsCritical: 0,
  findingsMajor: 0,
  findingsMinor: 0,
  agentsActive: 0,
  budgetUsed: 0,
  budgetTotal: 5.00,
  runtime: 0,
};

// ── Demo script ───────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

type Step = { delay: number; fn: (set: SetState) => void };

function buildScript(): Step[] {
  const steps: Step[] = [];
  let t = 0;
  const add = (ms: number, fn: (set: SetState) => void) => { t += ms; steps.push({ delay: t, fn }); };

  // Boot
  add(0,   set => set(() => ({ ...INIT })));
  add(500, set => set(s => log(s, { type: 'system', icon: '⬡', message: 'LAVERN · CLAW daemon initialised', detail: 'PID 58241 · watch path ~/Documents/Lavern · budget $5.00' })));
  add(500, set => set(s => log(s, { type: 'system', icon: '◈', message: 'Anthropic API connected', detail: 'claude-sonnet-4-5 · latency 82ms' })));
  add(400, set => set(s => log(s, { type: 'system', icon: '✓', message: 'Precedent board loaded', detail: '24 institutional patterns · last updated 2h ago' })));

  // Doc 1 — Venture NDA
  add(600, set => set(s => addDoc(log(s, { type: 'system', icon: '⊕', message: 'Document detected', detail: 'venture-nda-2025.pdf · 18 pages · 24 KB' }),
    { id: 'd1', name: 'venture-nda-2025', ext: 'PDF', status: 'queued', progress: 0, findings: 0, cost: '—' })));
  add(500, set => set(s => ({ ...prog(log(s, { type: 'agent', icon: '▶', agent: 'Contract Analyst', message: 'Beginning clause-by-clause NDA review', detail: '8 material clauses identified' }), 'd1', 'processing', 14), agentsActive: 3 })));
  add(400, set => set(s => prog(s, 'd1', 'processing', 29)));
  add(500, set => set(s => prog(log(s, { type: 'agent', icon: '◉', agent: 'Risk Assessor', message: 'Evaluating mutual disclosure scope', detail: 'Residuals clause analysis in progress' }), 'd1', 'processing', 47)));
  add(400, set => set(s => prog(s, 'd1', 'processing', 61)));

  // Doc 1 finding
  add(600, set => set(s => finding(prog(s, 'd1', 'processing', 72), 'd1', 'major', {
    agent: 'Contract Analyst', message: 'Residuals clause — unrestricted knowledge retention',
    evidence: '"each party may use Residual Knowledge for any purpose, including development of competing products"',
    detail: '§4.3 · high risk for the disclosing party',
  })));
  add(400, set => set(s => prog(s, 'd1', 'processing', 86)));
  add(400, set => set(s => finding(prog(s, 'd1', 'processing', 93), 'd1', 'minor', {
    agent: 'Risk Assessor', message: 'Notice period undefined for material breach',
    evidence: '"…shall notify the other party within a reasonable time…"',
    detail: '§7.1 · recommend minimum 5 business days',
  })));

  // Doc 2 detected while Doc 1 wraps
  add(300, set => set(s => addDoc(log(s, { type: 'system', icon: '⊕', message: 'Document detected', detail: 'cloud-services-msa.pdf · 42 pages · 156 KB' }),
    { id: 'd2', name: 'cloud-services-msa', ext: 'PDF', status: 'queued', progress: 0, findings: 0, cost: '—' })));

  // Doc 1 complete + delivery
  add(500, set => set(s => deliver(complete(s, 'd1', '$0.84', 0.84, '00:08'),
    { id: 'del1', docName: 'venture-nda-2025.pdf', findings: 2, severity: 'major', elapsed: '00:08' },
    'venture-nda-2025.pdf reviewed — 2 findings · $0.84 · 00:08',
    'venture-nda-review.md saved to ~/Documents/Lavern/deliveries/')));

  // Doc 2 processing
  add(500, set => set(s => ({ ...prog(log(s, { type: 'agent', icon: '▶', agent: 'Commercial Counsel', message: 'MSA analysis initiated — SaaS contract', detail: '42 pages · cross-border clauses · 3 liability sections' }), 'd2', 'processing', 11), agentsActive: 4 })));
  add(400, set => set(s => prog(s, 'd2', 'processing', 23)));

  // Doc 3 detected
  add(400, set => set(s => addDoc(log(s, { type: 'system', icon: '⊕', message: 'Document detected', detail: 'employment-agreement.docx · 11 pages · 48 KB' }),
    { id: 'd3', name: 'employment-agreement', ext: 'DOCX', status: 'queued', progress: 0, findings: 0, cost: '—' })));

  add(400, set => set(s => prog(s, 'd2', 'processing', 36)));

  // MSA critical finding 1
  add(500, set => set(s => finding(prog(s, 'd2', 'processing', 44), 'd2', 'critical', {
    agent: 'Liability Specialist', message: 'Unlimited liability exposure — no cap defined',
    evidence: '"Provider\'s liability shall not be limited with respect to any claims arising from gross negligence or wilful misconduct"',
    detail: '§11.2 · unacceptable for SaaS vendor — recommend 12-month ARR cap',
  })));

  add(400, set => set(s => prog(s, 'd2', 'processing', 55)));

  // MSA critical finding 2
  add(500, set => set(s => finding(prog(s, 'd2', 'processing', 62), 'd2', 'critical', {
    agent: 'Commercial Counsel', message: 'Indemnity trigger — any third-party claim, no carve-outs',
    evidence: '"Customer shall indemnify Provider against any and all third-party claims, damages, losses, and expenses…"',
    detail: '§14.1 · scope not limited to IP infringement — bilateral indemnity required',
  })));

  // Debate
  add(400, set => set(s => ({ ...log(s, { type: 'debate', icon: '⚔', agent: 'Risk Pricer', message: 'Challenge: 12-month ARR cap is SaaS standard', detail: '68% of enterprise SaaS use ARR-based cap · protects both parties', debatePhase: 'challenge' }), agentsActive: 5 })));
  add(700, set => set(s => log(s, { type: 'debate', icon: '◀', agent: 'Liability Specialist', message: 'Counter: data sensitivity warrants 24 months', detail: 'Healthcare-adjacent data · precedent shows 18–24mo for sensitive SaaS', debatePhase: 'response' })));
  add(600, set => set(s => log(s, { type: 'debate', icon: '✓', agent: 'Synthesis Editor', message: 'Resolved: 12-month cap with carve-outs for gross negligence and data breach', detail: 'Redline prepared for §11.2 · both parties protected', debatePhase: 'resolution' })));

  add(400, set => set(s => prog(s, 'd2', 'processing', 74)));

  // Doc 3 starts
  add(400, set => set(s => prog(log(s, { type: 'agent', icon: '▶', agent: 'Employment Counsel', message: 'Employment agreement under review', detail: 'Finnish law jurisdiction · non-compete analysis' }), 'd3', 'processing', 18)));

  // MSA finding 3
  add(500, set => set(s => finding(prog(s, 'd2', 'processing', 83), 'd2', 'major', {
    agent: 'Commercial Counsel', message: 'SLA termination — no cure period',
    evidence: '"Customer may terminate immediately upon 3 consecutive months of SLA failure"',
    detail: '§9.4 · recommend 30-day cure notice before termination right activates',
  })));

  // Doc 4 detected (confidential)
  add(400, set => set(s => addDoc(log(s, { type: 'system', icon: '🔒', message: 'Confidential document detected — routing to local model', detail: 'merger-agreement-draft.docx · sensitivity: PRIVILEGED MERGER · $0.00' }),
    { id: 'd4', name: 'merger-agreement-draft', ext: 'DOCX', status: 'queued', progress: 0, findings: 0, cost: '—', confidential: true })));

  add(400, set => set(s => prog(s, 'd2', 'processing', 94)));
  add(300, set => set(s => prog(s, 'd3', 'processing', 35)));

  // Doc 2 complete
  add(500, set => set(s => deliver(complete(s, 'd2', '$3.20', 3.20, '00:22'),
    { id: 'del2', docName: 'cloud-services-msa.pdf', findings: 3, severity: 'critical', elapsed: '00:22' },
    'cloud-services-msa.pdf flagged — 3 findings (2 critical) · $3.20',
    'cloud-msa-negotiation.md · redlines for §11.2, §14.1, §9.4 included')));

  // Precedent indexed
  add(400, set => set(s => log(s, { type: 'precedent', icon: '◈', message: 'Precedent indexed: Unlimited Liability — SaaS (MSA)', detail: 'Effectiveness 0.87 · 4 prior matches · pattern reinforced' })));

  add(400, set => set(s => prog(s, 'd3', 'processing', 52)));

  // Doc 4 starts (local)
  add(500, set => set(s => prog(log(s, { type: 'agent', icon: '🔒', agent: 'Local Model (Ollama)', message: 'Processing merger agreement on-device', detail: 'llama3.2 · no data leaves device · $0.00 · 94 tok/s' }), 'd4', 'local', 27)));

  // Doc 3 finding
  add(500, set => set(s => finding(prog(s, 'd3', 'processing', 66), 'd3', 'major', {
    agent: 'Employment Counsel', message: 'Non-compete — overbroad geographic scope',
    evidence: '"Employee shall not engage in competing activities anywhere in the European Union for 24 months"',
    detail: '§12.1 · Finnish law: non-competes capped at 6 months and require compensation',
  })));

  add(400, set => set(s => prog(s, 'd4', 'local', 48)));
  add(400, set => set(s => prog(s, 'd3', 'processing', 80)));

  // Doc 3 finding 2
  add(500, set => set(s => finding(prog(s, 'd3', 'processing', 91), 'd3', 'minor', {
    agent: 'Employment Counsel', message: 'Garden leave clause missing for senior role',
    evidence: '"…employment terminates immediately upon written resignation"',
    detail: '§8.2 · recommend 30-day garden leave provision',
  })));

  add(400, set => set(s => prog(s, 'd4', 'local', 63)));

  // Doc 3 complete
  add(400, set => set(s => deliver(complete(s, 'd3', '$0.61', 0.61, '00:28'),
    { id: 'del3', docName: 'employment-agreement.docx', findings: 2, severity: 'major', elapsed: '00:28' },
    'employment-agreement.docx flagged — 2 findings · $0.61',
    'employment-review.md · Finnish law annotations included')));

  add(400, set => set(s => prog(s, 'd4', 'local', 77)));

  // Doc 4 critical finding
  add(600, set => set(s => finding(prog(s, 'd4', 'local', 85), 'd4', 'critical', {
    agent: 'Local Model (Ollama)', message: 'MAC clause — no floor on purchase price reduction',
    evidence: '"…purchase price shall be adjusted to reflect any material adverse change in the target\'s financial position…"',
    detail: '§6.2 · recommend MAC definition with 15% floor · analysed locally at $0.00',
  })));

  // Precedent match
  add(500, set => set(s => log(s, { type: 'precedent', icon: '◈', message: 'Precedent match: Merger MAC Clause (relevance 0.91)', detail: 'Prior finding: Acme/Corp merger 2024 · resolution: explicit 15% floor · same construct' })));

  add(400, set => set(s => prog(s, 'd4', 'local', 95)));

  // Doc 4 complete
  add(600, set => set(s => deliver({ ...complete(s, 'd4', '$0.00', 0, '00:35'), agentsActive: 0 },
    { id: 'del4', docName: 'merger-agreement-draft.docx', findings: 4, severity: 'critical', elapsed: '00:35' },
    'merger-agreement-draft.docx processed locally — 4 findings · $0.00 · never left device',
    'merger-analysis.md · saved locally only · no cloud upload')));

  // Summary
  add(700, set => set(s => log(s, { type: 'system', icon: '✓', message: 'Night shift complete — 4 documents · 12 findings · 4 deliveries', detail: `Budget used: $4.65 of $5.00 · runtime 00:35 · 2 precedents indexed` })));

  return steps;
}

// ── State helpers ─────────────────────────────────────────────────────

function log(s: State, entry: Omit<LogEntry, 'id'>): State {
  const newEntry = { ...entry, id: uid() };
  const newLog = [...s.log, newEntry].slice(-30); // keep last 30
  return { ...s, log: newLog };
}

function addDoc(s: State, doc: Doc): State {
  return { ...s, docs: [...s.docs, doc] };
}

function prog(s: State, id: string, status: DocStatus, progress: number): State {
  return { ...s, docs: s.docs.map(d => d.id === id ? { ...d, status, progress } : d) };
}

function finding(s: State, docId: string, severity: Severity, entry: Omit<LogEntry, 'id' | 'type' | 'icon' | 'severity'>): State {
  const icon = severity === 'critical' ? '⚑' : severity === 'major' ? '⚑' : '⚐';
  const s1 = log(s, { type: 'finding', icon, severity, ...entry });
  const s2 = { ...s1, docs: s1.docs.map(d => d.id === docId ? { ...d, findings: d.findings + 1 } : d) };
  return {
    ...s2,
    findingsCritical: s2.findingsCritical + (severity === 'critical' ? 1 : 0),
    findingsMajor:    s2.findingsMajor    + (severity === 'major'    ? 1 : 0),
    findingsMinor:    s2.findingsMinor    + (severity === 'minor'    ? 1 : 0),
  };
}

function complete(s: State, docId: string, cost: string, costNum: number, elapsed: string): State {
  const doc = s.docs.find(d => d.id === docId);
  const hasFindings = (doc?.findings ?? 0) > 0;
  const status: DocStatus = hasFindings ? 'flagged' : 'complete';
  const s1 = { ...s, docs: s.docs.map(d => d.id === docId ? { ...d, status, progress: 100, cost } : d) };
  const s2 = { ...s1, docsProcessed: (s1 as any).docsProcessed, budgetUsed: s1.budgetUsed + costNum };
  const completedCount = s2.docs.filter(d => d.status === 'flagged' || d.status === 'complete').length;
  return log({ ...s2 }, {
    type: 'complete', icon: hasFindings ? '⚑' : '✓',
    message: `${doc?.name}.${doc?.ext.toLowerCase()} ${hasFindings ? 'flagged for review' : 'reviewed'}`,
    detail: `${doc?.findings} findings · ${cost} · ${elapsed}`,
  });
}

function deliver(s: State, delivery: Delivery, msg: string, detail: string): State {
  return log({ ...s, deliveries: [...s.deliveries, delivery] }, { type: 'delivery', icon: '↓', message: msg, detail });
}

// ── Severity colours ──────────────────────────────────────────────────

const sevColor = (sev?: Severity) =>
  sev === 'critical' ? RED : sev === 'major' ? AMBER : sev === 'minor' ? GREEN : DIM;

const statusColor = (st: DocStatus) => {
  if (st === 'flagged')  return RED;
  if (st === 'complete') return GREEN;
  if (st === 'processing' || st === 'local') return ACCENT;
  if (st === 'reviewing') return AMBER;
  return DIM;
};

const statusLabel = (st: DocStatus) => {
  if (st === 'queued')     return 'QUEUED';
  if (st === 'processing') return 'PROCESSING';
  if (st === 'reviewing')  return 'REVIEWING';
  if (st === 'local')      return 'LOCAL';
  if (st === 'flagged')    return 'FLAGGED';
  if (st === 'complete')   return 'COMPLETE';
  return (st as string).toUpperCase();
};

// ── Main component ────────────────────────────────────────────────────

export default function ClawLiveView() {
  const [state, setState] = useState<State>(INIT);
  const [runtime, setRuntime] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startTimeRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const runScript = useCallback(() => {
    clearTimers();
    setRuntime(0);
    startTimeRef.current = Date.now();
    const script = buildScript();
    const LOOP_DELAY = 4000;
    const totalDuration = script[script.length - 1].delay + LOOP_DELAY;

    script.forEach(({ delay, fn }) => {
      const t = setTimeout(() => fn(setState), delay);
      timersRef.current.push(t);
    });

    // Loop
    const loopT = setTimeout(() => runScript(), totalDuration);
    timersRef.current.push(loopT);
  }, [clearTimers]);

  // Runtime counter
  useEffect(() => {
    const iv = setInterval(() => setRuntime(r => r + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { runScript(); return () => clearTimers(); }, [runScript, clearTimers]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [state.log]);

  const fmt = (n: number) => {
    const m = Math.floor(n / 60).toString().padStart(2, '0');
    const s = (n % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const budgetPct = Math.min(100, (state.budgetUsed / state.budgetTotal) * 100);
  const totalFindings = state.findingsCritical + state.findingsMajor + state.findingsMinor;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG, color: TEXT,
      fontFamily: SANS, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Background photo */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(/mac-mini-glow.jpg)',
        backgroundSize: 'cover', backgroundPosition: 'center 40%',
        opacity: 0.18,
        pointerEvents: 'none',
      }}/>
      {/* Vignette over photo */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(8,8,8,0.3) 0%, rgba(8,8,8,0.85) 70%)',
      }}/>

      {/* Film grain */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.18, mixBlendMode: 'overlay', zIndex: 100 }} aria-hidden>
        <filter id='grain'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter>
        <rect width='100%' height='100%' filter='url(#grain)'/>
      </svg>

      {/* All content above background */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 300, letterSpacing: 3, color: TEXT }}>Clawern</span>
          <span style={{ color: BORDER, fontSize: 16 }}>·</span>
          <span style={{ fontSize: 10, letterSpacing: 4, color: DIM, fontWeight: 400 }}>LAW FIRM ON RETAINER</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, boxShadow: `0 0 8px ${GREEN}`, animation: 'pulse 2s infinite' }}/>
            <span style={{ fontSize: 10, letterSpacing: 3, color: GREEN, fontWeight: 500 }}>DAEMON ACTIVE</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: DIM }}>RUNTIME</div>
            <div style={{ fontFamily: MONO, fontSize: 16, color: TEXT, letterSpacing: 2 }}>{fmt(runtime)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: DIM }}>FINDINGS</div>
            <div style={{ fontFamily: MONO, fontSize: 16, color: totalFindings > 0 ? AMBER : DIM }}>{totalFindings}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: DIM }}>BUDGET</div>
            <div style={{ fontFamily: MONO, fontSize: 16, color: budgetPct > 80 ? AMBER : TEXT }}>${state.budgetUsed.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Body — 3 columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: Documents + Deliveries */}
        <div style={{ width: 280, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 10, letterSpacing: 3, color: DIM }}>DOCUMENTS</span>
            <span style={{ float: 'right', fontSize: 10, fontFamily: MONO, color: DIM }}>
              {state.docs.filter(d => d.status === 'flagged' || d.status === 'complete').length}/{state.docs.length}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {state.docs.map(doc => (
              <div key={doc.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 9, fontFamily: MONO, color: doc.confidential ? AMBER : DIM,
                    background: doc.confidential ? 'rgba(201,168,76,0.12)' : SURFACE,
                    padding: '2px 5px', borderRadius: 2 }}>
                    {doc.confidential ? '🔒' : ''}{doc.ext}
                  </span>
                  <span style={{ fontSize: 12, color: TEXT, fontWeight: 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 3, background: 'rgba(250,249,246,0.08)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${doc.progress}%`, background: statusColor(doc.status), borderRadius: 2, transition: 'width 0.6s ease' }}/>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, letterSpacing: 2, color: statusColor(doc.status) }}>{statusLabel(doc.status)}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {doc.findings > 0 && <span style={{ fontSize: 9, fontFamily: MONO, color: AMBER }}>{doc.findings} findings</span>}
                    <span style={{ fontSize: 9, fontFamily: MONO, color: DIM }}>{doc.cost}</span>
                  </div>
                </div>
              </div>
            ))}
            {state.docs.length === 0 && (
              <div style={{ padding: '20px 18px', color: DIM, fontSize: 12 }}>Watching for documents…</div>
            )}
          </div>

          {/* Deliveries */}
          <div style={{ borderTop: `1px solid ${BORDER}` }}>
            <div style={{ padding: '12px 18px 8px' }}>
              <span style={{ fontSize: 10, letterSpacing: 3, color: DIM }}>DELIVERIES</span>
              <span style={{ float: 'right', fontSize: 10, fontFamily: MONO, color: DIM }}>{state.deliveries.length}</span>
            </div>
            {state.deliveries.slice(-4).map(del => (
              <div key={del.id} style={{ padding: '8px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: sevColor(del.severity) }}>↓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{del.docName}</div>
                  <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>{del.findings} findings · {del.elapsed}</div>
                </div>
              </div>
            ))}
            {state.deliveries.length === 0 && (
              <div style={{ padding: '8px 18px 12px', color: DIM, fontSize: 11 }}>Awaiting first delivery…</div>
            )}
          </div>
        </div>

        {/* Center: Live activity feed */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '14px 24px 10px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: 3, color: DIM }}>LIVE ACTIVITY</span>
            {state.agentsActive > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, animation: 'pulse 1.5s infinite' }}/>
                <span style={{ fontSize: 10, color: ACCENT }}>{state.agentsActive} agents active</span>
              </div>
            )}
          </div>
          <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
            {state.log.map((entry, i) => (
              <FeedEntry key={entry.id} entry={entry} fresh={i === state.log.length - 1} />
            ))}
          </div>
        </div>

        {/* Right: Findings + Budget + Precedents */}
        <div style={{ width: 240, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Findings */}
          <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 10, letterSpacing: 3, color: DIM }}>FINDINGS</span>
          </div>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
            {(['critical', 'major', 'minor'] as Severity[]).map(sev => {
              const count = sev === 'critical' ? state.findingsCritical : sev === 'major' ? state.findingsMajor : state.findingsMinor;
              return (
                <div key={sev} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sevColor(sev) }}/>
                    <span style={{ fontSize: 10, letterSpacing: 2, color: DIM }}>{sev.toUpperCase()}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 20, color: count > 0 ? sevColor(sev) : 'rgba(250,249,246,0.12)', fontWeight: 300 }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Budget gauge */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: DIM, marginBottom: 10 }}>BUDGET</div>
            <div style={{ height: 4, background: 'rgba(250,249,246,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetPct > 80 ? AMBER : ACCENT, borderRadius: 2, transition: 'width 0.8s ease' }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: budgetPct > 80 ? AMBER : TEXT }}>${state.budgetUsed.toFixed(2)}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: DIM }}>${state.budgetTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Precedents */}
          <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 10, letterSpacing: 3, color: DIM }}>PRECEDENTS INDEXED</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {state.log.filter(e => e.type === 'precedent').map(e => (
              <div key={e.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 10, color: ACCENT, letterSpacing: 1, marginBottom: 3 }}>◈ PATTERN</div>
                <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.4 }}>{e.message.replace('Precedent indexed: ', '').replace(/\s*\(.*\)/, '')}</div>
                <div style={{ fontSize: 10, color: DIM, marginTop: 3 }}>{e.detail?.split('·')[0]}</div>
              </div>
            ))}
            {state.log.filter(e => e.type === 'precedent').length === 0 && (
              <div style={{ padding: '14px 18px', color: DIM, fontSize: 11 }}>No patterns indexed yet</div>
            )}
          </div>

          {/* Footer tag */}
          <div style={{ padding: '10px 18px', borderTop: `1px solid ${BORDER}`, textAlign: 'center' }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: 'rgba(250,249,246,0.18)' }}>IT WORKS WHILE YOU SLEEP</span>
          </div>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(250,249,246,0.12);border-radius:2px}
      `}</style>
      </div>{/* end content wrapper */}
    </div>
  );
}

// ── Feed entry component ──────────────────────────────────────────────

function FeedEntry({ entry, fresh }: { entry: LogEntry; fresh: boolean }) {
  const isDebate = entry.type === 'debate';
  const isComplete = entry.type === 'complete';
  const isFinding = entry.type === 'finding';
  const isDelivery = entry.type === 'delivery';
  const isPrecedent = entry.type === 'precedent';

  const borderColor = isFinding ? sevColor(entry.severity) : isDebate ? ACCENT : 'transparent';
  const msgColor = isComplete ? GREEN : isDelivery ? ACCENT : isPrecedent ? ACCENT : isFinding ? sevColor(entry.severity) : TEXT;
  const iconColor = isComplete ? GREEN : isDelivery ? ACCENT : isPrecedent ? ACCENT : isFinding ? sevColor(entry.severity) : DIM;

  return (
    <div style={{
      padding: `9px 24px 9px ${isDebate ? 36 : 24}px`,
      borderLeft: `2px solid ${borderColor}`,
      marginLeft: isDebate ? 24 : 0,
      marginBottom: 2,
      animation: fresh ? 'fadeSlideIn 0.35s ease-out' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 13, color: iconColor, flexShrink: 0, marginTop: 1 }}>{entry.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {entry.agent && <span style={{ fontSize: 10, color: ACCENT, letterSpacing: 1, fontWeight: 500 }}>{entry.agent}</span>}
            {entry.severity && (
              <span style={{ fontSize: 8, letterSpacing: 2, color: sevColor(entry.severity), background: `${sevColor(entry.severity)}18`, padding: '1px 5px', borderRadius: 2 }}>
                {entry.severity.toUpperCase()}
              </span>
            )}
            {entry.debatePhase && (
              <span style={{ fontSize: 8, letterSpacing: 2, color: DIM }}>{entry.debatePhase.toUpperCase()}</span>
            )}
            {isPrecedent && <span style={{ fontSize: 8, letterSpacing: 2, color: ACCENT, background: 'rgba(232,132,92,0.12)', padding: '1px 5px', borderRadius: 2 }}>INSTITUTIONAL MEMORY</span>}
          </div>
          <div style={{ fontSize: 13, color: msgColor, lineHeight: 1.45, marginTop: entry.agent ? 3 : 0 }}>{entry.message}</div>
          {entry.evidence && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: DIM, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '5px 9px', marginTop: 5, lineHeight: 1.5 }}>
              {entry.evidence}
            </div>
          )}
          {entry.detail && <div style={{ fontSize: 11, color: DIM, marginTop: 3, lineHeight: 1.4 }}>{entry.detail}</div>}
        </div>
      </div>
    </div>
  );
}
