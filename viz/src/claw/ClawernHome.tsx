/**
 * ClawernHome — The night-shift entry experience.
 *
 * Where the user arrives when they click the crab. Replaces the old
 * "dump them into a dashboard" first impression with a narrative,
 * state-aware home that explains what Clawern is, shows what's
 * happening right now, and offers the right next action for the state.
 *
 * Three states it can render:
 *   1. Demo  — no real daemon. Show the explainer + CLI setup steps,
 *              with the demo data peeking through as preview.
 *   2. Configured & running — live status, budget, recent findings,
 *              pause/scan/full-dashboard controls.
 *   3. Configured & paused — same as running but with a Resume CTA.
 *
 * Detailed tabs (Documents, Deliveries, Precedents, Config) remain
 * available behind "Full dashboard →".
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { CLAW } from './theme.js';
import { BudgetGauge } from './components/BudgetGauge.js';
import type { ClawStatus, ClawDocument, ClawDelivery } from './hooks/useClawData.js';

interface Props {
  status: ClawStatus;
  documents: ClawDocument[];
  deliveries: ClawDelivery[];
  demoMode: boolean;
  scanning: boolean;
  paused: boolean;
  onScan: () => void;
  onTogglePause: () => void;
  onOpenDashboard: () => void;
  onPlayDemo: () => void;
  demoPlaying: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} hours ago`;
  const days = Math.round(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── Component ───────────────────────────────────────────────────────────

export function ClawernHome({
  status,
  documents,
  deliveries,
  demoMode,
  scanning,
  paused,
  onScan,
  onTogglePause,
  onOpenDashboard,
  onPlayDemo,
  demoPlaying,
}: Props) {
  const [copied, setCopied] = useState(false);

  const recent = useMemo(() => {
    return deliveries.slice(0, 5);
  }, [deliveries]);

  const stateLabel = demoMode
    ? 'Demo mode'
    : paused
      ? 'Paused'
      : 'Watching';

  const stateColor = demoMode
    ? CLAW.textMuted
    : paused
      ? CLAW.amber
      : CLAW.success;

  const copyCommand = () => {
    navigator.clipboard?.writeText('lavern claw init');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={styles.root}>
      {/* ═══ HERO ═══════════════════════════════════════════════════════ */}
      <section style={styles.hero}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{
            opacity: 1,
            y: [0, -3, 0],
          }}
          transition={{
            opacity: { duration: 0.7, ease: [0.28, 0.11, 0.32, 1] },
            y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.7 },
          }}
          style={styles.crab}
          aria-hidden
        >
          {'🦀'}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.28, 0.11, 0.32, 1], delay: 0.05 }}
          style={styles.wordmark}
        >
          Clawern
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.28, 0.11, 0.32, 1], delay: 0.12 }}
          style={styles.tagline}
        >
          The night shift law firm.<br />
          <span style={{ color: CLAW.textMuted }}>Drop documents. Wake up to findings.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          style={styles.statePill}
        >
          <span style={{ ...styles.stateDot, backgroundColor: stateColor, boxShadow: `0 0 12px ${stateColor}` }} />
          <span style={{ color: CLAW.text, fontWeight: 500 }}>{stateLabel}</span>
          {!demoMode && status.profile.company && (
            <span style={styles.stateDetail}>
              <span style={styles.stateSeparator}>·</span>
              {status.profile.company}
            </span>
          )}
        </motion.div>
      </section>

      {/* ═══ STATE-AWARE MAIN ═══════════════════════════════════════════ */}

      {demoMode ? (
        <>
          {/* "How it works" — the user-facing story */}
          <section style={styles.section}>
            <div style={styles.sectionEyebrow}>How it works</div>
            <div style={styles.steps}>
              <Step
                num="01"
                title="Designate a folder"
                body="A folder Clawern watches. Could be ~/Documents/Contracts or any directory you keep work in."
              />
              <Step
                num="02"
                title="Drop documents in"
                body="PDFs, Word docs, plain text. Clawern picks them up, reads them carefully, applies the same playbooks as the day shift."
              />
              <Step
                num="03"
                title="Wake up to findings"
                body="A morning briefing — what was reviewed, what's flagged, what to look at first. Telegram or email if you want a nudge."
              />
            </div>
          </section>

          {/* The Pipeline — what happens inside, stage by stage */}
          <PipelineSection />

          {/* Three Modes — Local / Hybrid / Frontier */}
          <ModesSection />

          {/* Setup */}
          <section style={styles.section}>
            <div style={styles.sectionEyebrow}>Set it up</div>

            <div style={styles.setupCard}>
              <div style={styles.setupHeader}>
                <span style={styles.setupKicker}>Run once, on your Mac</span>
                <button
                  onClick={copyCommand}
                  style={styles.copyBtn}
                  aria-label="Copy command"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre style={styles.code}>
                <span style={styles.prompt}>$</span> lavern claw init
              </pre>
              <p style={styles.setupHint}>
                Walks you through folder, budget, and notifications.
                Takes about two minutes. Clawern runs as a LaunchAgent
                from there on — survives reboots, no terminal needed.
              </p>
            </div>

            <div style={styles.demoPeek}>
              <button
                onClick={onPlayDemo}
                disabled={demoPlaying}
                style={{
                  ...styles.demoBtn,
                  opacity: demoPlaying ? 0.6 : 1,
                  cursor: demoPlaying ? 'default' : 'pointer',
                }}
              >
                {demoPlaying ? 'Demo running…' : 'Play through a demo'}
                <span style={{ marginLeft: 6 }}>{'→'}</span>
              </button>
              <button
                onClick={onOpenDashboard}
                style={styles.demoPeekLink}
              >
                or open the dashboard {'→'}
              </button>
            </div>
            <div style={styles.demoHint}>
              See what an overnight pass looks like — fake docs, real interface
            </div>
          </section>

          {/* What you'd see — preview */}
          <section style={styles.section}>
            <div style={styles.sectionEyebrow}>What you'd see, every morning</div>
            <PreviewActivity recent={recent} demoMode={demoMode} />
          </section>
        </>
      ) : (
        <>
          {/* Live status panel */}
          <section style={styles.section}>
            <div style={styles.statusGrid}>
              {/* Watching folder */}
              <div style={styles.statusCard}>
                <div style={styles.statusLabel}>Watching</div>
                <div style={styles.watchPath}>
                  {status.watchPaths[0] ?? '~/Documents'}
                </div>
                {status.watchPaths.length > 1 && (
                  <div style={styles.watchExtra}>
                    + {status.watchPaths.length - 1} more
                  </div>
                )}
                <div style={styles.statusFooter}>
                  Last scanned {formatRelative(status.lastScan)}
                </div>
              </div>

              {/* Budget */}
              <div style={{ ...styles.statusCard, padding: 0, border: 'none', backgroundColor: 'transparent' }}>
                <BudgetGauge
                  spent={status.budget.spentUsd}
                  total={status.budget.totalUsd}
                  exhausted={status.budget.exhausted}
                />
              </div>

              {/* Document counts */}
              <div style={styles.statusCard}>
                <div style={styles.statusLabel}>Today</div>
                <div style={styles.bigNum}>
                  {/* "Processed" = reviewed (clean) + flagged (critical). Showing just
                      reviewed hid all flagged work and read as "nothing got reviewed". */}
                  {status.documents.reviewed + status.documents.flagged}
                  <span style={styles.bigNumUnit}>processed</span>
                </div>
                <div style={styles.docPills}>
                  {status.documents.flagged > 0 && (
                    <span style={{ ...styles.pillDanger }}>
                      {status.documents.flagged} flagged
                    </span>
                  )}
                  {status.documents.pending > 0 && (
                    <span style={{ ...styles.pillAmber }}>
                      {status.documents.pending} pending
                    </span>
                  )}
                  {status.documents.errors > 0 && (
                    <span style={{ ...styles.pillDanger }}>
                      {status.documents.errors} error{status.documents.errors === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick controls */}
            <div style={styles.controls}>
              <button
                onClick={onTogglePause}
                style={{
                  ...styles.controlBtn,
                  ...(paused ? styles.controlBtnPrimary : {}),
                }}
              >
                {paused ? '▶ Resume watching' : '❚❚ Pause'}
              </button>
              <button
                onClick={onScan}
                disabled={scanning || paused}
                style={{
                  ...styles.controlBtn,
                  opacity: scanning || paused ? 0.45 : 1,
                  cursor: scanning || paused ? 'default' : 'pointer',
                }}
              >
                {scanning ? 'Scanning…' : 'Scan now'}
              </button>
              <button
                onClick={onOpenDashboard}
                style={{ ...styles.controlBtn, marginLeft: 'auto' }}
              >
                Full dashboard {'→'}
              </button>
            </div>
          </section>

          {/* Recent activity */}
          <section style={styles.section}>
            <div style={styles.sectionEyebrow}>Recent activity</div>
            <PreviewActivity recent={recent} demoMode={demoMode} />
          </section>
        </>
      )}

      {/* ═══ Always-on: explain mode toggles ═══════════════════════════ */}
      {!demoMode && (
        <section style={styles.section}>
          <div style={styles.modeRow}>
            <div style={styles.modeText}>
              <div style={styles.modeTitle}>Ethical mode</div>
              <div style={styles.modeSub}>
                {status.ethicalMode
                  ? 'On — EU-only models, every document treated as confidential.'
                  : 'Off — hybrid local/frontier processing for speed.'}
              </div>
            </div>
            <button
              onClick={onOpenDashboard}
              style={styles.modeBtn}
            >
              Configure {'→'}
            </button>
          </div>
        </section>
      )}

      <footer style={styles.footer}>
        It works while you sleep.
      </footer>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────

// ── Architecture: the 6-stage pipeline ─────────────────────────────────

// The Lighthouse architecture — three on-device personas (Watchman / Reader /
// Curator) plus a grounding pass and an optional frontier escalation. This is
// what runs on every document in local + hybrid modes (frontier mode swaps the
// Reader for the day-shift agent firm). Names match the modules in src/claw/.
const PIPELINE = [
  {
    name: 'Watch',
    body: 'A filesystem watcher debounces changes and protects against symlink escapes. Sees PDFs, Word, Markdown, plain text.',
    detail: 'watcher.ts',
  },
  {
    name: 'Watchman',
    persona: true,
    body: 'First persona. Reads the filename + first ~1500 chars and decides what the document is, what jurisdiction, how urgent, and whether to skip / quick-scan / deep-read. Picks the Reader template.',
    detail: 'watchman.ts',
  },
  {
    name: 'Reader',
    persona: true,
    body: 'Second persona. Goes through the document clause by clause using a template matched to the doc type — JV, NDA, SaaS, lease, employment, privacy. Tags each clause minor / major / critical.',
    detail: 'local-analysis.ts · reader-templates.ts',
  },
  {
    name: 'Grounding',
    body: 'Verifies every finding cites text that actually appears in the document. Anything the Reader hallucinated gets stripped before it ever reaches you.',
    detail: 'local-analysis.ts (Phase 2)',
  },
  {
    name: 'Curator',
    persona: true,
    body: 'Third persona. Looks across documents — recurring patterns, precedents to reinforce, things worth surfacing. Decides whether to ping you and what to say.',
    detail: 'curator.ts · precedent-board.ts',
  },
  {
    name: 'Escalate',
    body: 'Hybrid mode only. Major + critical clauses get anonymized and sent to Opus 5 as a single focused call — not the full agent firm. Frontier mode dispatches the day-shift firm instead.',
    detail: 'anonymize.ts · hybrid-analysis.ts',
  },
  {
    name: 'Deliver',
    body: 'A bundle written to the delivery folder — DOCX, HTML, manifest. Telegram, email, or macOS push if you want a nudge.',
    detail: 'delivery.ts · notify.ts',
  },
];

function PipelineSection() {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionEyebrow}>The pipeline · lighthouse architecture</div>
        <div style={styles.sectionLede}>
          Every document passes through three on-device personas — the{' '}
          <span style={styles.personaInline}>Watchman</span>, the{' '}
          <span style={styles.personaInline}>Reader</span>, the{' '}
          <span style={styles.personaInline}>Curator</span> — plus a grounding
          pass that strips anything the Reader can't actually cite. Frontier
          escalation is optional and surgical.
        </div>
      </div>

      <div style={styles.pipelineRail}>
        {PIPELINE.map((stage, i) => (
          <motion.div
            key={stage.name}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.05, ease: [0.28, 0.11, 0.32, 1] }}
            style={{
              ...styles.pipelineCard,
              ...(stage.persona ? styles.pipelineCardPersona : {}),
            }}
          >
            <div style={styles.pipelineCardHeader}>
              <div style={styles.pipelineNum}>{String(i + 1).padStart(2, '0')}</div>
              {stage.persona && <div style={styles.personaBadge}>Persona</div>}
            </div>
            <div style={styles.pipelineName}>{stage.name}</div>
            <div style={styles.pipelineBody}>{stage.body}</div>
            <div style={styles.pipelineDetail}>{stage.detail}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Architecture: the three modes ──────────────────────────────────────

const MODES = [
  {
    badge: 'Default',
    badgeTone: 'muted' as const,
    name: 'Local',
    body:
      'Pure on-device Ollama. Nothing leaves the machine. No cloud bill, slower triage, narrower model — but a sealed surface.',
    suits: 'Suits: high-sensitivity work, privacy-strict practices.',
  },
  {
    badge: 'Most common',
    badgeTone: 'accent' as const,
    name: 'Hybrid',
    body:
      'Local model triages every clause for severity. Only major + critical clauses get anonymized and sent to Opus 5 as a single focused call — not the full agent firm. Cost-capped per document.',
    suits: 'Suits: routine contract intake where you want a senior eye on the few flags that matter.',
  },
  {
    badge: 'Full firm',
    badgeTone: 'amber' as const,
    name: 'Frontier',
    body:
      'The same dispatch → router → agents → debate → verify → assemble pipeline as the day shift. Confidential docs still stay local.',
    suits: 'Suits: high-stakes work where you want the day-shift treatment overnight.',
  },
];

function ModesSection() {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionEyebrow}>Three modes</div>
        <div style={styles.sectionLede}>
          Picked when you run <code style={styles.inlineCode}>lavern claw init</code>.
          Tunes how much of the day-shift firm comes along for the night.
        </div>
      </div>

      <div style={styles.modesGrid}>
        {MODES.map((m, i) => (
          <motion.div
            key={m.name}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: [0.28, 0.11, 0.32, 1] }}
            style={styles.modeCard}
          >
            <div
              style={{
                ...styles.modeBadge,
                color:
                  m.badgeTone === 'accent'
                    ? CLAW.accent
                    : m.badgeTone === 'amber'
                      ? CLAW.amber
                      : CLAW.textMuted,
                borderColor:
                  m.badgeTone === 'accent'
                    ? CLAW.accentBorder
                    : m.badgeTone === 'amber'
                      ? CLAW.amberBorder
                      : CLAW.border,
                backgroundColor:
                  m.badgeTone === 'accent'
                    ? CLAW.accentBg
                    : m.badgeTone === 'amber'
                      ? CLAW.amberBg
                      : 'transparent',
              }}
            >
              {m.badge}
            </div>
            <div style={styles.modeName}>{m.name}</div>
            <div style={styles.modeBody}>{m.body}</div>
            <div style={styles.modeSuits}>{m.suits}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.28, 0.11, 0.32, 1] }}
      style={styles.step}
    >
      <div style={styles.stepNum}>{num}</div>
      <div style={styles.stepTitle}>{title}</div>
      <div style={styles.stepBody}>{body}</div>
    </motion.div>
  );
}

function PreviewActivity({ recent, demoMode }: { recent: ClawDelivery[]; demoMode: boolean }) {
  if (recent.length === 0) {
    return (
      <div style={styles.emptyActivity}>
        {demoMode
          ? 'When configured, this is where your last few overnight findings will appear.'
          : 'No activity yet — Clawern will report here after the first scan.'}
      </div>
    );
  }

  return (
    <div style={styles.activityList}>
      {recent.map(d => {
        const isCritical = d.findings.criticalCount > 0;
        const accentColor = isCritical ? CLAW.danger : d.findings.majorCount > 0 ? CLAW.amber : CLAW.success;
        return (
          <div key={d.sessionId} style={styles.activityItem}>
            <div style={{ ...styles.activityDot, backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}66` }} />
            <div style={styles.activityBody}>
              <div style={styles.activityRow}>
                <span style={styles.activityFile}>{d.filename}</span>
                <span style={styles.activityTime}>{clockTime(d.completedAt)}</span>
              </div>
              <div style={styles.activityMeta}>
                {d.findings.findingsCount} finding{d.findings.findingsCount === 1 ? '' : 's'}
                {isCritical && <span style={{ color: CLAW.danger, marginLeft: 8 }}>· {d.findings.criticalCount} critical</span>}
                {d.findings.majorCount > 0 && !isCritical && <span style={{ color: CLAW.amber, marginLeft: 8 }}>· {d.findings.majorCount} major</span>}
                <span style={{ color: CLAW.textDim, marginLeft: 'auto', fontFamily: fonts.mono, fontSize: 11 }}>
                  ${d.costUsd.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxl,
    color: CLAW.text,
    fontFamily: fonts.sans,
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: `${spacing.xxxl}px ${spacing.lg}px ${spacing.xxl}px`,
    gap: spacing.md,
  },
  crab: {
    fontSize: 64,
    filter: 'drop-shadow(0 8px 24px rgba(232,132,92,0.25))',
    lineHeight: 1,
  },
  wordmark: {
    fontSize: 'clamp(40px, 7vw, 64px)',
    fontFamily: fonts.serif,
    fontWeight: 300,
    letterSpacing: -1,
    color: CLAW.text,
    margin: 0,
    lineHeight: 1,
  },
  tagline: {
    fontSize: 16,
    fontFamily: fonts.serif,
    color: CLAW.text,
    margin: 0,
    lineHeight: 1.55,
    maxWidth: 480,
  },
  statePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    borderRadius: radii.pill,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textSecondary,
    marginTop: spacing.sm,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  stateDetail: {
    color: CLAW.textSecondary,
  },
  stateSeparator: {
    marginRight: 8,
    color: CLAW.textDim,
  },

  section: {
    padding: `0 ${spacing.xl}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  sectionHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: CLAW.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionLede: {
    fontSize: 14,
    fontFamily: fonts.serif,
    color: CLAW.textSecondary,
    lineHeight: 1.55,
    maxWidth: 640,
  },

  // ── Pipeline ──
  pipelineRail: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: spacing.md,
    position: 'relative',
  },
  pipelineCard: {
    position: 'relative',
    padding: spacing.lg,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  pipelineCardPersona: {
    backgroundColor: CLAW.accentBg,
    border: `1px solid ${CLAW.accentBorder}`,
  },
  pipelineCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pipelineNum: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: CLAW.accent,
    letterSpacing: 2,
    fontWeight: 600,
  },
  personaBadge: {
    fontSize: 9.5,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: CLAW.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    padding: '2px 7px',
    borderRadius: radii.pill,
    border: `1px solid ${CLAW.accentBorder}`,
    backgroundColor: 'rgba(232,132,92,0.04)',
  },
  personaInline: {
    color: CLAW.accent,
    fontWeight: 500,
  },
  pipelineName: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: CLAW.text,
    letterSpacing: -0.2,
  },
  pipelineBody: {
    fontSize: 12.5,
    color: CLAW.textSecondary,
    lineHeight: 1.5,
    marginTop: 2,
  },
  pipelineDetail: {
    fontSize: 10.5,
    fontFamily: fonts.mono,
    color: CLAW.textDim,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  pipelineConnector: {
    position: 'absolute',
    right: -18,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 14,
    color: CLAW.textDim,
    zIndex: 1,
    pointerEvents: 'none',
    display: 'none', // hidden by default (column-stack on small grids); kept for narrative
  },

  // ── Modes ──
  inlineCode: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    border: `1px solid ${CLAW.border}`,
    color: CLAW.text,
    padding: '1px 6px',
    borderRadius: 3,
  },
  modesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: spacing.md,
  },
  modeCard: {
    padding: spacing.lg,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    padding: '3px 9px',
    borderRadius: radii.pill,
    border: '1px solid',
  },
  modeName: {
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: CLAW.text,
    letterSpacing: -0.3,
    lineHeight: 1.1,
    marginTop: 4,
  },
  modeBody: {
    fontSize: 13,
    color: CLAW.textSecondary,
    lineHeight: 1.55,
    marginTop: 2,
  },
  modeSuits: {
    fontSize: 12,
    fontFamily: fonts.serif,
    color: CLAW.textMuted,
    lineHeight: 1.5,
    marginTop: 6,
    paddingTop: 10,
    borderTop: `1px solid ${CLAW.border}`,
  },

  // ── How it works ──
  steps: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: spacing.lg,
  },
  step: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  stepNum: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.accent,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: CLAW.text,
    letterSpacing: -0.2,
  },
  stepBody: {
    fontSize: 13.5,
    color: CLAW.textSecondary,
    lineHeight: 1.55,
  },

  // ── Setup card ──
  setupCard: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 16px 40px rgba(0,0,0,0.2)',
  },
  setupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  setupKicker: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  copyBtn: {
    backgroundColor: 'transparent',
    border: `1px solid ${CLAW.border}`,
    color: CLAW.textSecondary,
    padding: '4px 10px',
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.5,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.28,0.11,0.32,1)',
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: 15,
    color: CLAW.text,
    margin: 0,
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radii.md,
    border: `1px solid ${CLAW.border}`,
  },
  prompt: {
    color: CLAW.accent,
    marginRight: 10,
    userSelect: 'none',
  },
  setupHint: {
    fontSize: 13,
    color: CLAW.textSecondary,
    margin: `${spacing.md}px 0 0`,
    lineHeight: 1.55,
  },
  demoPeek: {
    marginTop: spacing.md,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  demoBtn: {
    background: 'transparent',
    border: `1px solid ${CLAW.accentBorder}`,
    color: CLAW.accent,
    padding: '10px 18px',
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderRadius: radii.pill,
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.28,0.11,0.32,1)',
  },
  demoHint: {
    fontSize: 12,
    color: CLAW.textMuted,
    fontFamily: fonts.serif,
    fontStyle: 'normal',
    marginTop: spacing.sm,
  },
  demoPeekLink: {
    background: 'transparent',
    border: 'none',
    color: CLAW.textSecondary,
    fontSize: 12,
    fontFamily: fonts.sans,
    letterSpacing: 0.5,
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.25s cubic-bezier(0.28,0.11,0.32,1)',
  },

  // ── Live status ──
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: spacing.lg,
  },
  statusCard: {
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: CLAW.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  watchPath: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: CLAW.text,
    wordBreak: 'break-all',
  },
  watchExtra: {
    fontSize: 11,
    color: CLAW.textMuted,
  },
  statusFooter: {
    fontSize: 11,
    color: CLAW.textMuted,
    marginTop: 'auto',
    paddingTop: spacing.sm,
  },
  bigNum: {
    fontSize: 32,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: CLAW.text,
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    lineHeight: 1,
  },
  bigNumUnit: {
    fontSize: 12,
    color: CLAW.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 400,
    letterSpacing: 0.5,
  },
  docPills: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  pillDanger: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.pill,
    backgroundColor: CLAW.dangerBg,
    color: CLAW.danger,
    border: `1px solid ${CLAW.dangerBorder}`,
  },
  pillAmber: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.pill,
    backgroundColor: CLAW.amberBg,
    color: CLAW.amber,
    border: `1px solid ${CLAW.amberBorder}`,
  },

  // ── Controls ──
  controls: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  controlBtn: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    color: CLAW.text,
    padding: '10px 18px',
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    borderRadius: radii.pill,
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.28,0.11,0.32,1)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  controlBtnPrimary: {
    backgroundColor: CLAW.accent,
    borderColor: CLAW.accent,
    color: '#1A0B05',
    boxShadow: '0 4px 16px rgba(232,132,92,0.35), 0 12px 32px rgba(232,132,92,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
  },

  // ── Activity list ──
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  activityItem: {
    display: 'flex',
    gap: spacing.md,
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderBottom: `1px solid ${CLAW.border}`,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginTop: 8,
    flexShrink: 0,
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
  },
  activityRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    marginBottom: 4,
  },
  activityFile: {
    fontSize: 14,
    fontFamily: fonts.serif,
    color: CLAW.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  activityTime: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.textMuted,
    flexShrink: 0,
  },
  activityMeta: {
    fontSize: 12,
    color: CLAW.textSecondary,
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  emptyActivity: {
    padding: spacing.xxl,
    backgroundColor: CLAW.surface,
    border: `1px dashed ${CLAW.border}`,
    borderRadius: radii.lg,
    fontSize: 13,
    color: CLAW.textMuted,
    textAlign: 'center',
    fontFamily: fonts.serif,
    lineHeight: 1.6,
  },

  // ── Mode row ──
  modeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    flexWrap: 'wrap',
  },
  modeText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: '1 1 240px',
    minWidth: 0,
  },
  modeTitle: {
    fontSize: 14,
    fontFamily: fonts.serif,
    color: CLAW.text,
    fontWeight: 400,
  },
  modeSub: {
    fontSize: 12,
    color: CLAW.textMuted,
  },
  modeBtn: {
    backgroundColor: 'transparent',
    border: `1px solid ${CLAW.border}`,
    color: CLAW.textSecondary,
    padding: '6px 14px',
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    borderRadius: radii.pill,
    cursor: 'pointer',
    flexShrink: 0,
  },

  footer: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: fonts.serif,
    color: CLAW.textMuted,
    padding: `${spacing.xxl}px 0 ${spacing.xl}px`,
    letterSpacing: 0.3,
  },
};

// Suppress unused-import warning for AnimatePresence (kept for future page transitions)
export const _AnimatePresence = AnimatePresence;
