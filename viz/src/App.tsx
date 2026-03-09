/**
 * App — Main application shell.
 *
 * Law firm engagement flow:
 *   (default)    → Cinematic landing page (dark, bold, mysterious)
 *   #/quickstart → Quick Start: drop docs + type question + go
 *   #/dashboard  → Hero: begin engagement + YOLO
 *   #/intake     → Client intake / reception
 *   #/briefing   → Context capture / document upload / Q&A
 *   #/strategy   → Choose approach, depth, team leader
 *   #/instruct   → (legacy redirect → team)
 *   #/team       → Browse & select agents
 *   #/working    → Live agent dashboard (thinking stream)
 *   #/delivery   → Work results presentation
 *   #/billing    → Invoice & cost summary
 *   #/my-cases   → Active & past sessions
 *   #/my-page    → User profile & settings
 *   #/claw       → Claw Mode remote monitoring dashboard
 *   #/pricing    → Billable Hours — pricing page
 *   #/challenge  → The Marble Challenge — blind document comparison
 *   #/agent-builder → NBA2K-style custom agent builder wizard
 *
 * All views are lazy-loaded React components in their own directories.
 * App.tsx handles routing and cross-view data flow via sessionStorage.
 */

import { useEffect, useState, useCallback, useContext, Suspense, lazy } from 'react';
import { UserContext } from './auth/UserContext.js';
import { ErrorToast } from './components/ErrorToast.js';

import type { MatterData } from './intake/hooks/useIntakeState.js';
import type { BriefingPayload } from './briefing/hooks/useBriefingState.js';
import type { FrontendParsedDocument } from './briefing/hooks/useDocumentUpload.js';
import { SessionList } from './components/SessionList.js';
import { MarbleMark } from './components/MarbleMark.js';
import { LoadingM } from './components/LoadingM.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { YOLO_CONFIGS, type YoloTier } from './landing/yolo-config.js';
import { CustomCursor } from './components/CustomCursor.js';

// Lazy-load all views (separate code-split chunks)
const LandingView = lazy(() => import('./landing/LandingView.js'));
const LobbyView = lazy(() => import('./landing/LobbyView.js'));
const IntakeView = lazy(() => import('./intake/IntakeView.js'));
const BriefingView = lazy(() => import('./briefing/BriefingView.js'));
const StrategyView = lazy(() => import('./staffing/StrategyView.js'));

const TeamView = lazy(() => import('./staffing/TeamView.js'));
const WorkingView = lazy(() => import('./working/WorkingView.js'));
const DeliveryView = lazy(() => import('./delivery/DeliveryView.js'));
const BillingView = lazy(() => import('./billing/BillingView.js'));
const MyPageView = lazy(() => import('./my-page/MyPageView.js'));
const MyCasesView = lazy(() => import('./my-cases/MyCasesView.js'));
const AgentDocsView = lazy(() => import('./agent-docs/AgentDocsView.js'));
const BetTheCompanyView = lazy(() => import('./bet-the-company/BetTheCompanyView.js'));
const LoginView = lazy(() => import('./auth/LoginView.js'));
const QuickStartView = lazy(() => import('./landing/QuickStartView.js'));
const ClawView = lazy(() => import('./claw/ClawView.js'));
const ArchiveView = lazy(() => import('./archive/ArchiveView.js'));
const PricingView = lazy(() => import('./pricing/PricingView.js'));
const ChallengeView = lazy(() => import('./challenge/ChallengeView.js'));
const AgentBuilderView = lazy(() => import('./agent-builder/AgentBuilderView.js'));

type AppView = 'quickstart' | 'landing' | 'lobby' | 'login' | 'dashboard' | 'intake' | 'briefing' | 'strategy' | 'team' | 'working' | 'delivery' | 'billing' | 'my-page' | 'my-cases' | 'agent-docs' | 'bet-the-company' | 'claw' | 'archive' | 'pricing' | 'challenge' | 'agent-builder';

function getViewFromHash(): AppView {
  const hash = window.location.hash;
  if (hash.startsWith('#/quickstart')) return 'quickstart';
  if (hash.startsWith('#/lobby')) return 'lobby';
  if (hash.startsWith('#/login')) return 'login';
  if (hash.startsWith('#/dashboard')) return 'dashboard';
  if (hash.startsWith('#/intake')) return 'intake';
  if (hash.startsWith('#/briefing')) return 'briefing';
  if (hash.startsWith('#/strategy')) return 'strategy';
  if (hash.startsWith('#/instruct')) return 'team'; // legacy redirect
  if (hash.startsWith('#/team')) return 'team';
  if (hash.startsWith('#/staffing')) return 'strategy'; // backward compat redirect
  if (hash.startsWith('#/working')) return 'working';
  if (hash.startsWith('#/delivery')) return 'delivery';
  if (hash.startsWith('#/billing')) return 'billing';
  if (hash.startsWith('#/my-cases')) return 'my-cases';
  if (hash.startsWith('#/my-page')) return 'my-page';
  if (hash.startsWith('#/agent-docs')) return 'agent-docs';
  if (hash.startsWith('#/bet-the-company')) return 'bet-the-company';
  if (hash.startsWith('#/claw')) return 'claw';
  if (hash.startsWith('#/archive')) return 'archive';
  if (hash.startsWith('#/pricing')) return 'pricing';
  if (hash.startsWith('#/challenge')) return 'challenge';
  if (hash.startsWith('#/agent-builder')) return 'agent-builder';
  return 'landing';
}

/** Shared loading fallback for lazy-loaded views */
function ViewFallback({ text }: { text: string }) {
  return <LoadingM text={text} />;
}

export function App() {
  const [view, setView] = useState<AppView>(getViewFromHash);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Hash-based routing
  useEffect(() => {
    const onHashChange = () => setView(getViewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ── Stable navigation callbacks (prevent WS effect re-runs) ────────
  const navToDelivery = useCallback(() => { window.location.hash = '#/delivery'; }, []);
  const navToTeam = useCallback(() => { window.location.hash = '#/team'; }, []);
  const navToBetTheCompany = useCallback(() => { window.location.hash = '#/bet-the-company'; }, []);

  // ── Flow navigation handlers ─────────────────────────────────────────

  /** Landing → Intake */
  const handleBeginEngagement = useCallback(() => {
    window.location.hash = '#/intake';
  }, []);

  /** YOLO Express Lane — skip intake/briefing/staffing, create session directly */
  const handleYoloLaunch = useCallback(async (question: string, tier: YoloTier) => {
    const config = YOLO_CONFIGS[tier];
    const matterId = `yolo-${Date.now()}`;

    // Seed synthetic matter data
    const matterData = {
      matterId,
      matterNumber: `MBL-YOLO-${Date.now().toString(36).toUpperCase()}`,
      clientName: 'Express Client',
      matterTitle: question.slice(0, 80),
      matterType: config.requestType,
      jurisdiction: 'General',
      response: {
        conflictCheck: { conflictFound: false },
        kyc: { clientVerified: true, riskLevel: 'low', flags: [] },
        engagementLetter: {
          scope: question,
          feeStructure: 'fixed',
          estimatedBudget: { min: config.budgetUsd, max: config.budgetUsd, currency: 'USD' },
          accepted: true,
        },
      },
    };

    // Seed all sessionStorage keys at once
    sessionStorage.setItem('shem-matter-id', matterId);
    sessionStorage.setItem('shem-matter-data', JSON.stringify(matterData));
    sessionStorage.setItem('shem-briefing-memo', `# Express Briefing\n\n${question}`);
    sessionStorage.setItem('shem-briefing-config', JSON.stringify({
      workflowId: config.workflowId,
      intensity: config.intensity,
      budgetUsd: config.budgetUsd,
      yoloMode: true,
    }));
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(config.teamRoles));

    // Create session via API (same pattern as handleStaffingComplete)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request: {
            type: config.requestType,
            requestText: question,
          },
          team: config.teamRoles,
          workflow: config.workflowId,
          options: {
            budget: config.budgetUsd,
            intensity: config.intensity,
            effort: config.effort,
            yoloMode: true,
            verification: config.workflowId !== 'counsel',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          sessionStorage.setItem('shem-session-id', data.sessionId);
          window.location.hash = '#/working';
          return;
        }
      }

      // API returned non-ok — log the actual error
      const errorBody = await res.text().then(t => { try { return JSON.parse(t); } catch { return { error: 'Unknown error' }; } });
      console.error('[YOLO] Session creation failed:', res.status, errorBody);
      sessionStorage.removeItem('shem-session-id');
      setErrorToast(`Session creation failed (${res.status}): ${errorBody.error || errorBody.message || 'Check the server logs.'}`);
    } catch {
      // API unreachable — show error, don't silently fall through to demo
      console.error('[YOLO] API unreachable — cannot create session');
      sessionStorage.removeItem('shem-session-id');
      setErrorToast('Cannot connect to the server. Please ensure the backend is running.');
    }
  }, []);

  /** Quick Start — create session with question + optional documents */
  const handleQuickStart = useCallback(async (
    question: string,
    tier: YoloTier,
    parsedDocs: FrontendParsedDocument[],
  ) => {
    const config = YOLO_CONFIGS[tier];
    const matterId = `qs-${Date.now()}`;
    const hasDocuments = parsedDocs.length > 0;
    const questionText = question || 'Please review the attached documents.';

    // Seed synthetic matter data
    const matterData = {
      matterId,
      matterNumber: `MBL-QS-${Date.now().toString(36).toUpperCase()}`,
      clientName: 'Express Client',
      matterTitle: questionText.slice(0, 80),
      matterType: hasDocuments ? 'contract_review' : config.requestType,
      jurisdiction: 'General',
      response: {
        conflictCheck: { conflictFound: false },
        kyc: { clientVerified: true, riskLevel: 'low', flags: [] },
        engagementLetter: {
          scope: questionText,
          feeStructure: 'fixed',
          estimatedBudget: { min: config.budgetUsd, max: config.budgetUsd, currency: 'USD' },
          accepted: true,
        },
      },
    };

    // Seed sessionStorage
    sessionStorage.setItem('shem-matter-id', matterId);
    sessionStorage.setItem('shem-matter-data', JSON.stringify(matterData));
    sessionStorage.setItem('shem-briefing-memo', `# Express Briefing\n\n${questionText}`);
    sessionStorage.setItem('shem-briefing-config', JSON.stringify({
      workflowId: config.workflowId,
      intensity: config.intensity,
      budgetUsd: config.budgetUsd,
      yoloMode: true,
    }));
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(config.teamRoles));

    // Store parsed documents if available
    if (hasDocuments) {
      try {
        const serialized = JSON.stringify(parsedDocs);
        if (serialized.length < 4_500_000) {
          sessionStorage.setItem('shem-parsed-docs', serialized);
        } else {
          const trimmed = parsedDocs.map(d => ({
            ...d,
            fullText: d.fullText.slice(0, 50_000),
          }));
          sessionStorage.setItem('shem-parsed-docs', JSON.stringify(trimmed));
        }
      } catch (e) {
        console.warn('[QuickStart] sessionStorage full:', e);
      }
    }

    // Create session via API
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request: {
            type: hasDocuments ? 'contract_review' : config.requestType,
            requestText: questionText,
          },
          ...(hasDocuments ? { documents: parsedDocs } : {}),
          team: config.teamRoles,
          workflow: config.workflowId,
          options: {
            budget: config.budgetUsd,
            intensity: config.intensity,
            effort: config.effort,
            yoloMode: true,
            verification: config.workflowId !== 'counsel',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          sessionStorage.setItem('shem-session-id', data.sessionId);
          window.location.hash = '#/working';
          return;
        }
      }

      const errorBody = await res.text().then(t => { try { return JSON.parse(t); } catch { return { error: 'Unknown error' }; } });
      console.error('[QuickStart] Session creation failed:', res.status, errorBody);
      sessionStorage.removeItem('shem-session-id');
      setErrorToast(`Session creation failed (${res.status}): ${errorBody.error || errorBody.message || 'Check the server logs.'}`);
    } catch {
      console.error('[QuickStart] API unreachable');
      sessionStorage.removeItem('shem-session-id');
      setErrorToast('Cannot connect to the server. Please ensure the backend is running.');
    }
  }, []);

  /** Intake complete → store matter data → Briefing */
  const handleIntakeComplete = useCallback((data: MatterData) => {
    sessionStorage.setItem('shem-matter-id', data.matterId);
    sessionStorage.setItem('shem-matter-data', JSON.stringify(data));
    window.location.hash = '#/briefing';
  }, []);

  /** Intake skip → Briefing (no matter) */
  const handleIntakeSkip = useCallback(() => {
    window.location.hash = '#/briefing';
  }, []);

  /** Briefing complete → store memo → Strategy */
  const handleBriefingComplete = useCallback((payload: BriefingPayload) => {
    sessionStorage.setItem('shem-briefing-memo', payload.memoText);
    sessionStorage.setItem('shem-briefing-config', JSON.stringify({
      workflowId: payload.workflowId,
      intensity: payload.intensity,
      budgetUsd: payload.budgetUsd,
      yoloMode: payload.yoloMode,
    }));
    if (payload.documents?.length) {
      sessionStorage.setItem('shem-briefing-docs', JSON.stringify(
        payload.documents.map(d => ({ name: d.name, size: d.size, type: d.type }))
      ));
    }
    // v12: Store parsed documents for session creation (full structure)
    if (payload.parsedDocuments?.length) {
      try {
        const serialized = JSON.stringify(payload.parsedDocuments);
        // sessionStorage limit is ~5MB — truncate fullText if needed
        if (serialized.length < 4_500_000) {
          sessionStorage.setItem('shem-parsed-docs', serialized);
        } else {
          // Store with truncated fullText to fit sessionStorage
          const trimmed = payload.parsedDocuments.map(d => ({
            ...d,
            fullText: d.fullText.slice(0, 50_000),
          }));
          sessionStorage.setItem('shem-parsed-docs', JSON.stringify(trimmed));
        }
      } catch (e) {
        console.warn('[Briefing] sessionStorage full — parsed documents will not be passed to session:', e);
      }
    }
    window.location.hash = '#/strategy';
  }, []);

  /** Strategy complete → Team */
  const handleStrategyComplete = useCallback(() => {
    window.location.hash = '#/team';
  }, []);

  /** Team confirmed → create session → Working */
  const handleStaffingComplete = useCallback(async (roles: string[]) => {
    const memoText = sessionStorage.getItem('shem-briefing-memo') ?? '';
    const matterId = sessionStorage.getItem('shem-matter-id');
    const configStr = sessionStorage.getItem('shem-briefing-config');
    let config: { workflowId: string; intensity: string; budgetUsd: number; yoloMode: boolean; verification: boolean; provider?: string } = { workflowId: 'counsel', intensity: 'standard', budgetUsd: 10, yoloMode: false, verification: true };
    try { if (configStr) config = JSON.parse(configStr); } catch { /* use defaults */ }

    // Store team for downstream
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(roles));

    const WORKFLOW_TYPE_MAP: Record<string, string> = {
      'roundtable': 'document_redesign',
      'review': 'contract_review',
      'adversarial': 'legal_research',
      'counsel': 'legal_question',
      'pre-engagement': 'general',
      // Backward-compatible alias for old workflow ID
      'legal-design': 'document_redesign',
    };

    // v12: Load parsed documents from sessionStorage
    let parsedDocs: unknown[] = [];
    try {
      const pdStr = sessionStorage.getItem('shem-parsed-docs');
      if (pdStr) parsedDocs = JSON.parse(pdStr);
    } catch { /* no parsed docs available */ }

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request: {
            type: WORKFLOW_TYPE_MAP[config.workflowId] ?? 'general',
            requestText: memoText || 'New engagement session',
          },
          ...(parsedDocs.length > 0 ? { documents: parsedDocs } : {}),
          team: roles,
          workflow: config.workflowId,
          options: {
            budget: config.budgetUsd,
            intensity: config.intensity,
            yoloMode: config.yoloMode,
            verification: config.verification !== false,
            provider: config.provider,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          sessionStorage.setItem('shem-session-id', data.sessionId);
          if (matterId) {
            sessionStorage.setItem('shem-matter-id', matterId);
          }
          window.location.hash = '#/working';
          return;
        }
      }

      // API returned non-ok — log the actual error
      const errorBody = await res.text().then(t => { try { return JSON.parse(t); } catch { return { error: 'Unknown error' }; } });
      console.error('[Session] Session creation failed:', res.status, errorBody);
      sessionStorage.removeItem('shem-session-id');
      setErrorToast(`Session creation failed (${res.status}): ${errorBody.error || errorBody.message || 'Check the server logs.'}`);
    } catch {
      // API unreachable — show error, don't silently fall through to demo
      console.error('[Session] API unreachable — cannot create session');
      sessionStorage.removeItem('shem-session-id');
      setErrorToast('Cannot connect to the server. Please ensure the backend is running.');
    }
  }, []);

  /** Delivery → Billing */
  const handleDeliveryDone = useCallback(() => {
    window.location.hash = '#/billing';
  }, []);

  /** Billing → clear all state → Landing */
  const handleBillingClose = useCallback(() => {
    const keysToRemove = [
      'shem-matter-id', 'shem-matter-data',
      'shem-briefing-memo', 'shem-briefing-docs',
      'shem-briefing-team', 'shem-briefing-config',
      'shem-session-id', 'shem-parsed-docs', 'shem-strategy-preset',
      'shem-cowork-active', 'shem-from-archive',
    ];
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    window.location.hash = '#/quickstart';
  }, []);

  // ── View rendering ────────────────────────────────────────────────────

  // ── Global M mark — hide on landing (custom cursor) & working (tight header) ──
  const showMark = view !== 'quickstart' && view !== 'landing' && view !== 'lobby' && view !== 'login';
  const userCtx = useContext(UserContext);

  // ── ErrorToast rendered globally above all views ─────────────────────
  const toast = errorToast ? (
    <ErrorToast message={errorToast} onDismiss={() => setErrorToast(null)} />
  ) : null;

  // ── Custom cursor — auto-inverts via mix-blend-mode ──────────────────
  const cursor = <CustomCursor />;

  // ── Skip link for keyboard accessibility ─────────────────────────────
  const skipLink = <a href="#main-content" className="skip-to-content">Skip to main content</a>;

  // ── Quick Start — fast-track entry point ────────────────────────────
  if (view === 'quickstart') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading..." />}>
          <QuickStartView
            onQuickStart={handleQuickStart}
            onGuidedFlow={() => { window.location.hash = '#/intake'; }}
            onBetTheCompany={() => { window.location.hash = '#/bet-the-company'; }}
            onPricing={() => { window.location.hash = '#/pricing'; }}
            onChallenge={() => { window.location.hash = '#/challenge'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'intake') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading intake..." />}>
          {showMark && <MarbleMark />}
          <IntakeView
            onComplete={handleIntakeComplete}
            onSkip={handleIntakeSkip}
            onBack={() => { window.location.hash = '#/quickstart'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'briefing') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading briefing..." />}>
          {showMark && <MarbleMark />}
          <BriefingView
            onComplete={handleBriefingComplete}
            onBack={() => { window.location.hash = '#/intake'; }}
            onSkip={() => { window.location.hash = '#/strategy'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'strategy') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading strategy..." />}>
          {showMark && <MarbleMark />}
          <StrategyView
            onComplete={handleStrategyComplete}
            onBack={() => { sessionStorage.removeItem('shem-briefing-config'); window.location.hash = '#/briefing'; }}
            onSkip={() => { window.location.hash = '#/team'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'team') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading team..." />}>
          {showMark && <MarbleMark />}
          <TeamView
            onTeamConfirmed={handleStaffingComplete}
            onBack={() => { sessionStorage.removeItem('shem-briefing-team'); window.location.hash = '#/strategy'; }}
            onSkip={() => { window.location.hash = '#/delivery'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'working') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading session..." />}>
          {showMark && <MarbleMark />}
          <WorkingView
            onComplete={navToDelivery}
            onBack={() => { sessionStorage.removeItem('shem-session-id'); window.location.hash = '#/quickstart'; }}
            onSkip={navToDelivery}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'delivery') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading delivery..." />}>
          {showMark && <MarbleMark />}
          <DeliveryView
            onContinue={handleDeliveryDone}
            onBack={() => { window.location.hash = '#/quickstart'; }}
            onSkip={() => { window.location.hash = '#/billing'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'billing') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading billing..." />}>
          {showMark && <MarbleMark />}
          <BillingView
            onClose={handleBillingClose}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'my-page') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading profile..." />}>
          {showMark && <MarbleMark />}
          <MyPageView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === 'my-cases') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading cases..." />}>
          {showMark && <MarbleMark />}
          <MyCasesView
            onConnectSession={(id) => {
              sessionStorage.setItem('shem-session-id', id);
              window.location.hash = '#/working';
            }}
            onConnectReplay={(id) => {
              sessionStorage.setItem('shem-session-id', id);
              sessionStorage.setItem('shem-from-archive', 'true');
              window.location.hash = '#/delivery';
            }}
            onBack={() => { window.location.hash = '#/quickstart'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Archive — Knowledge Base UI ─────────────────────────────────────────
  if (view === 'archive') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading Archive..." />}>
          {showMark && <MarbleMark />}
          <ArchiveView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Login — standalone login page ──────────────────────────────────────
  if (view === 'login') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading..." />}>
          <LoginView
            onAuth={(user) => {
              if (userCtx) userCtx.login(user);
              window.location.hash = '#/lobby';
            }}
            onBack={() => { window.location.hash = '#/quickstart'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Agent Docs — API documentation for agent clients ───────────────────
  if (view === 'agent-docs') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading API docs..." />}>
          {showMark && <MarbleMark />}
          <AgentDocsView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Bet the Company — premium tier landing page ─────────────────────
  if (view === 'bet-the-company') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading..." />}>
          <BetTheCompanyView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Pricing — Billable Hours ───────────────────────────────────────
  if (view === 'pricing') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading..." />}>
          <PricingView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── The Marble Challenge — blind document comparison ────────────────
  if (view === 'challenge') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading..." />}>
          <ChallengeView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Agent Builder — NBA2K-style custom agent creator ────────────────
  if (view === 'agent-builder') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading Agent Builder..." />}>
          {showMark && <MarbleMark />}
          <AgentBuilderView onBack={() => { window.location.hash = '#/team'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Claw Mode — remote monitoring dashboard ─────────────────────────
  if (view === 'claw') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading Claw Mode..." />}>
          {showMark && <MarbleMark />}
          <ClawView onBack={() => { window.location.hash = '#/quickstart'; }} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Lobby — cinematic MARBLE gate ────────────────────────────────────
  if (view === 'lobby') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <Suspense fallback={<ViewFallback text="Loading..." />}>
          <LobbyView
            onEnter={() => { window.location.hash = '#/quickstart'; }}
            onMyPage={() => { window.location.hash = '#/my-page'; }}
            onLogin={() => { window.location.hash = '#/login'; }}
            onAgentDocs={() => { window.location.hash = '#/agent-docs'; }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── Dashboard — sessions hub (the old "landing") ──────────────────────
  if (view === 'dashboard') {
    return (
      <ErrorBoundary>
        {skipLink}
        {toast}
        {cursor}
        <div style={styles.app}>
          {showMark && <MarbleMark />}
          <div style={styles.sessionOverlay}>
            <SessionList
              onConnectSession={(id) => {
                sessionStorage.setItem('shem-session-id', id);
                window.location.hash = '#/working';
              }}
              onConnectReplay={(id) => {
                sessionStorage.setItem('shem-session-id', id);
                window.location.hash = '#/working';
              }}
              onBeginEngagement={handleBeginEngagement}
              onYoloLaunch={handleYoloLaunch}
              onBetTheCompany={navToBetTheCompany}
            />
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // ── Landing — cinematic dark door (default entry) ──────────────────
  return (
    <ErrorBoundary>
      {skipLink}
      {toast}
      {cursor}
      <Suspense fallback={<div style={{ width: '100%', height: '100vh', backgroundColor: '#1A1A1A' }} />}>
        <MarbleMark hideCursor />
        <LandingView
          onEnter={() => { window.location.hash = '#/lobby'; }}
          onMyPage={() => { window.location.hash = '#/my-page'; }}
          onAgentDocs={() => { window.location.hash = '#/agent-docs'; }}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#FAF9F6',
    position: 'relative',
  },
  sessionOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 9000,
    backgroundColor: 'rgba(250, 249, 246, 0.95)',
    backdropFilter: 'blur(8px)',
  },
};
