/**
 * App — Main application shell.
 *
 * 9-screen law firm engagement flow:
 *   (default)    → Cinematic landing page (dark, bold, mysterious)
 *   #/dashboard  → Hero: begin engagement + YOLO
 *   #/intake     → Client intake / reception
 *   #/briefing   → Context capture / document upload / Q&A
 *   #/staffing   → Draft & confirm team
 *   #/working    → Live agent dashboard (thinking stream)
 *   #/delivery   → Work results presentation
 *   #/billing    → Invoice & cost summary
 *   #/my-cases   → Active & past sessions
 *   #/my-page    → User profile & settings
 *
 * All views are lazy-loaded React components in their own directories.
 * App.tsx handles routing and cross-view data flow via sessionStorage.
 */

import { useEffect, useState, useCallback, Suspense, lazy } from 'react';

// ── Global keyframes for hover effects ──────────────────────────────
const MARBLE_KEYFRAMES_ID = 'marble-global-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(MARBLE_KEYFRAMES_ID)) {
  const s = document.createElement('style');
  s.id = MARBLE_KEYFRAMES_ID;
  s.textContent = `
    @keyframes marbleShimmer {
      0% { left: -100%; }
      100% { left: 200%; }
    }
    @keyframes marbleBtnHover {
      0% { background-position: 0% 50%; }
      100% { background-position: 100% 50%; }
    }
  `;
  document.head.appendChild(s);
}

import type { MatterData } from './intake/hooks/useIntakeState.js';
import type { BriefingPayload } from './briefing/hooks/useBriefingState.js';
import { SessionList } from './components/SessionList.js';
import { MarbleMark } from './components/MarbleMark.js';
import { DemoBanner } from './components/DemoBanner.js';
import { YOLO_CONFIGS, type YoloTier } from './landing/yolo-config.js';

// Lazy-load all views (separate code-split chunks)
const LandingView = lazy(() => import('./landing/LandingView.js'));
const IntakeView = lazy(() => import('./intake/IntakeView.js'));
const BriefingView = lazy(() => import('./briefing/BriefingView.js'));
const StaffingView = lazy(() => import('./staffing/StaffingView.js'));
const WorkingView = lazy(() => import('./working/WorkingView.js'));
const DeliveryView = lazy(() => import('./delivery/DeliveryView.js'));
const BillingView = lazy(() => import('./billing/BillingView.js'));
const MyPageView = lazy(() => import('./my-page/MyPageView.js'));
const MyCasesView = lazy(() => import('./my-cases/MyCasesView.js'));

type AppView = 'landing' | 'dashboard' | 'intake' | 'briefing' | 'staffing' | 'working' | 'delivery' | 'billing' | 'my-page' | 'my-cases';

function getViewFromHash(): AppView {
  const hash = window.location.hash;
  if (hash.startsWith('#/dashboard')) return 'dashboard';
  if (hash.startsWith('#/intake')) return 'intake';
  if (hash.startsWith('#/briefing')) return 'briefing';
  if (hash.startsWith('#/staffing')) return 'staffing';
  if (hash.startsWith('#/working')) return 'working';
  if (hash.startsWith('#/delivery')) return 'delivery';
  if (hash.startsWith('#/billing')) return 'billing';
  if (hash.startsWith('#/my-cases')) return 'my-cases';
  if (hash.startsWith('#/my-page')) return 'my-page';
  return 'landing';
}

/** Shared loading fallback for lazy-loaded views */
function ViewFallback({ text }: { text: string }) {
  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FAF9F6',
      color: '#A3A39E',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    }}>
      {text}
    </div>
  );
}

export function App() {
  const [view, setView] = useState<AppView>(getViewFromHash);
  const [demoMode, setDemoMode] = useState(false);

  // Hash-based routing
  useEffect(() => {
    const onHashChange = () => setView(getViewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
        body: JSON.stringify({
          request: {
            type: config.requestType,
            requestText: question,
          },
          workflow: config.workflowId,
          options: {
            budget: config.budgetUsd,
            intensity: config.intensity,
            effort: config.effort,
            yoloMode: true,
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
    } catch {
      // API unreachable — fall through to demo
      setDemoMode(true);
    }

    // Demo fallback
    const demoSessionId = `demo-session-${Date.now()}`;
    sessionStorage.setItem('shem-session-id', demoSessionId);
    window.location.hash = '#/working';
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

  /** Briefing complete → store memo → Staffing */
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
    window.location.hash = '#/staffing';
  }, []);

  /** Staffing confirmed → create session → Working */
  const handleStaffingComplete = useCallback(async (roles: string[]) => {
    const memoText = sessionStorage.getItem('shem-briefing-memo') ?? '';
    const matterId = sessionStorage.getItem('shem-matter-id');
    const configStr = sessionStorage.getItem('shem-briefing-config');
    let config = { workflowId: 'simple-query', intensity: 'standard', budgetUsd: 10, yoloMode: false };
    try { if (configStr) config = JSON.parse(configStr); } catch { /* use defaults */ }

    // Store team for downstream
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(roles));

    const WORKFLOW_TYPE_MAP: Record<string, string> = {
      'legal-design': 'document_redesign',
      'contract-review': 'contract_review',
      'research-memo': 'legal_research',
      'simple-query': 'legal_question',
      'pre-engagement': 'general',
    };

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            type: WORKFLOW_TYPE_MAP[config.workflowId] ?? 'general',
            requestText: memoText || 'New engagement session',
          },
          workflow: config.workflowId,
          options: {
            budget: config.budgetUsd,
            intensity: config.intensity,
            yoloMode: config.yoloMode,
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
    } catch {
      // API unreachable — fall through to demo session
      setDemoMode(true);
    }

    // Demo fallback: generate a local session ID and proceed
    const demoSessionId = `demo-session-${Date.now()}`;
    sessionStorage.setItem('shem-session-id', demoSessionId);
    if (matterId) {
      sessionStorage.setItem('shem-matter-id', matterId);
    }
    window.location.hash = '#/working';
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
      'shem-session-id',
    ];
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    window.location.hash = '';
  }, []);

  // ── View rendering ────────────────────────────────────────────────────

  // ── Global M mark — hide on landing (custom cursor) & working (tight header) ──
  const showMark = view !== 'landing' && view !== 'working';
  const showDemoBanner = demoMode && view !== 'landing';

  if (view === 'intake') {
    return (
      <Suspense fallback={<ViewFallback text="Loading intake..." />}>
        {showDemoBanner && <DemoBanner />}
        {showMark && <MarbleMark />}
        <IntakeView
          onComplete={handleIntakeComplete}
          onSkip={handleIntakeSkip}
          onBack={() => { window.location.hash = '#/dashboard'; }}
        />
      </Suspense>
    );
  }

  if (view === 'briefing') {
    return (
      <Suspense fallback={<ViewFallback text="Loading briefing..." />}>
        {showDemoBanner && <DemoBanner />}
        {showMark && <MarbleMark />}
        <BriefingView
          onComplete={handleBriefingComplete}
          onBack={() => { window.location.hash = '#/intake'; }}
          onSkip={() => { window.location.hash = '#/staffing'; }}
        />
      </Suspense>
    );
  }

  if (view === 'staffing') {
    return (
      <Suspense fallback={<ViewFallback text="Loading team..." />}>
        {showDemoBanner && <DemoBanner />}
        {showMark && <MarbleMark />}
        <StaffingView
          onTeamConfirmed={handleStaffingComplete}
          onBack={() => { window.location.hash = '#/briefing'; }}
          onSkip={() => { window.location.hash = '#/delivery'; }}
        />
      </Suspense>
    );
  }

  if (view === 'working') {
    return (
      <Suspense fallback={<ViewFallback text="Loading session..." />}>
        {showDemoBanner && <DemoBanner />}
        {showMark && <MarbleMark />}
        <WorkingView
          onComplete={() => { window.location.hash = '#/delivery'; }}
          onBack={() => { window.location.hash = '#/staffing'; }}
          onSkip={() => { window.location.hash = '#/delivery'; }}
        />
      </Suspense>
    );
  }

  if (view === 'delivery') {
    return (
      <Suspense fallback={<ViewFallback text="Loading delivery..." />}>
        {showDemoBanner && <DemoBanner />}
        {showMark && <MarbleMark />}
        <DeliveryView
          onContinue={handleDeliveryDone}
          onBack={() => { window.location.hash = '#/working'; }}
          onSkip={() => { window.location.hash = '#/billing'; }}
        />
      </Suspense>
    );
  }

  if (view === 'billing') {
    return (
      <Suspense fallback={<ViewFallback text="Loading billing..." />}>
        {showDemoBanner && <DemoBanner />}
        {showMark && <MarbleMark />}
        <BillingView
          onClose={handleBillingClose}
        />
      </Suspense>
    );
  }

  if (view === 'my-page') {
    return (
      <Suspense fallback={<ViewFallback text="Loading profile..." />}>
        {showMark && <MarbleMark />}
        <MyPageView onBack={() => { window.location.hash = '#/dashboard'; }} />
      </Suspense>
    );
  }

  if (view === 'my-cases') {
    return (
      <Suspense fallback={<ViewFallback text="Loading cases..." />}>
        {showMark && <MarbleMark />}
        <MyCasesView
          onConnectSession={(id) => {
            sessionStorage.setItem('shem-session-id', id);
            window.location.hash = '#/working';
          }}
          onConnectReplay={(id) => {
            sessionStorage.setItem('shem-session-id', id);
            window.location.hash = '#/working';
          }}
          onBack={() => { window.location.hash = '#/dashboard'; }}
        />
      </Suspense>
    );
  }

  // ── Dashboard — sessions hub (the old "landing") ──────────────────────
  if (view === 'dashboard') {
    return (
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
          />
        </div>
      </div>
    );
  }

  // ── Landing — cinematic gate ──────────────────────────────────────────
  return (
    <Suspense fallback={<div style={{ width: '100%', height: '100vh', backgroundColor: '#1A1A1A' }} />}>
      <MarbleMark hideCursor />
      <LandingView
        onEnter={() => { window.location.hash = '#/dashboard'; }}
        onMyPage={() => { window.location.hash = '#/my-page'; }}
      />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#FAF9F6',
    position: 'relative',
  },
  sessionOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 9000,
    backgroundColor: 'rgba(250, 249, 246, 0.95)',
    backdropFilter: 'blur(8px)',
    overflow: 'auto',
  },
};
