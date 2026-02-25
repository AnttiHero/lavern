/**
 * App — Main application shell.
 *
 * 9-screen law firm engagement flow:
 *   (default)    → Cinematic landing page (dark, bold, mysterious)
 *   #/dashboard  → Hero: begin engagement + YOLO
 *   #/intake     → Client intake / reception
 *   #/briefing   → Context capture / document upload / Q&A
 *   #/strategy   → Choose approach, depth, team leader
 *   #/instruct   → Tell your team lead what to focus on
 *   #/team       → Browse & select agents
 *   #/working    → Live agent dashboard (thinking stream)
 *   #/delivery   → Work results presentation
 *   #/billing    → Invoice & cost summary
 *   #/my-cases   → Active & past sessions
 *   #/my-page    → User profile & settings
 *
 * All views are lazy-loaded React components in their own directories.
 * App.tsx handles routing and cross-view data flow via sessionStorage.
 */

import { useEffect, useState, useCallback, useContext, Suspense, lazy } from 'react';
import { UserContext } from './auth/UserContext.js';

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
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.3); }
    }
    @keyframes marbleIlluminate {
      0% { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
  `;
  document.head.appendChild(s);
}

import type { MatterData } from './intake/hooks/useIntakeState.js';
import type { BriefingPayload } from './briefing/hooks/useBriefingState.js';
import { SessionList } from './components/SessionList.js';
import { MarbleMark } from './components/MarbleMark.js';
import { LoadingM } from './components/LoadingM.js';
import { YOLO_CONFIGS, type YoloTier } from './landing/yolo-config.js';

// Lazy-load all views (separate code-split chunks)
const LandingView = lazy(() => import('./landing/LandingView.js'));
const LobbyView = lazy(() => import('./landing/LobbyView.js'));
const IntakeView = lazy(() => import('./intake/IntakeView.js'));
const BriefingView = lazy(() => import('./briefing/BriefingView.js'));
const StrategyView = lazy(() => import('./staffing/StrategyView.js'));
const InstructView = lazy(() => import('./staffing/InstructView.js'));
const TeamView = lazy(() => import('./staffing/TeamView.js'));
const WorkingView = lazy(() => import('./working/WorkingView.js'));
const DeliveryView = lazy(() => import('./delivery/DeliveryView.js'));
const BillingView = lazy(() => import('./billing/BillingView.js'));
const MyPageView = lazy(() => import('./my-page/MyPageView.js'));
const MyCasesView = lazy(() => import('./my-cases/MyCasesView.js'));
const AgentDocsView = lazy(() => import('./agent-docs/AgentDocsView.js'));
const LoginView = lazy(() => import('./auth/LoginView.js'));

type AppView = 'landing' | 'lobby' | 'login' | 'dashboard' | 'intake' | 'briefing' | 'strategy' | 'instruct' | 'team' | 'working' | 'delivery' | 'billing' | 'my-page' | 'my-cases' | 'agent-docs';

function getViewFromHash(): AppView {
  const hash = window.location.hash;
  if (hash.startsWith('#/lobby')) return 'lobby';
  if (hash.startsWith('#/login')) return 'login';
  if (hash.startsWith('#/dashboard')) return 'dashboard';
  if (hash.startsWith('#/intake')) return 'intake';
  if (hash.startsWith('#/briefing')) return 'briefing';
  if (hash.startsWith('#/strategy')) return 'strategy';
  if (hash.startsWith('#/instruct')) return 'instruct';
  if (hash.startsWith('#/team')) return 'team';
  if (hash.startsWith('#/staffing')) return 'strategy'; // backward compat redirect
  if (hash.startsWith('#/working')) return 'working';
  if (hash.startsWith('#/delivery')) return 'delivery';
  if (hash.startsWith('#/billing')) return 'billing';
  if (hash.startsWith('#/my-cases')) return 'my-cases';
  if (hash.startsWith('#/my-page')) return 'my-page';
  if (hash.startsWith('#/agent-docs')) return 'agent-docs';
  return 'landing';
}

/** Shared loading fallback for lazy-loaded views */
function ViewFallback({ text }: { text: string }) {
  return <LoadingM text={text} />;
}

export function App() {
  const [view, setView] = useState<AppView>(getViewFromHash);

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
        credentials: 'include',
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

      // API returned non-ok — log the actual error
      const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[YOLO] Session creation failed:', res.status, errorBody);
      alert(`Session creation failed (${res.status}): ${errorBody.error || errorBody.message || 'Check the server logs.'}`);
    } catch {
      // API unreachable — show error, don't silently fall through to demo
      console.error('[YOLO] API unreachable — cannot create session');
      alert('Cannot connect to the server. Please ensure the backend is running.');
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

  /** Strategy complete → Instruct */
  const handleStrategyComplete = useCallback(() => {
    window.location.hash = '#/instruct';
  }, []);

  /** Instruct complete → Team */
  const handleInstructComplete = useCallback(() => {
    window.location.hash = '#/team';
  }, []);

  /** Team confirmed → create session → Working */
  const handleStaffingComplete = useCallback(async (roles: string[]) => {
    let memoText = sessionStorage.getItem('shem-briefing-memo') ?? '';
    const instructPrompt = sessionStorage.getItem('shem-instruct-prompt') ?? '';
    if (instructPrompt.trim()) {
      memoText += '\n\n### Client Instructions\n\n' + instructPrompt.trim() + '\n';
    }
    const matterId = sessionStorage.getItem('shem-matter-id');
    const configStr = sessionStorage.getItem('shem-briefing-config');
    let config = { workflowId: 'counsel', intensity: 'standard', budgetUsd: 10, yoloMode: false };
    try { if (configStr) config = JSON.parse(configStr); } catch { /* use defaults */ }

    // Store team for downstream
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(roles));

    const WORKFLOW_TYPE_MAP: Record<string, string> = {
      'roundtable': 'document_redesign',
      'review': 'contract_review',
      'adversarial': 'legal_research',
      'counsel': 'legal_question',
      'pre-engagement': 'general',
      // Backward-compatible aliases for old workflow IDs
      'legal-design': 'document_redesign',
      'contract-review': 'contract_review',
      'research-memo': 'legal_research',
      'simple-query': 'legal_question',
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
      const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[Session] Session creation failed:', res.status, errorBody);
      alert(`Session creation failed (${res.status}): ${errorBody.error || errorBody.message || 'Check the server logs.'}`);
    } catch {
      // API unreachable — show error, don't silently fall through to demo
      console.error('[Session] API unreachable — cannot create session');
      alert('Cannot connect to the server. Please ensure the backend is running.');
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
      'shem-instruct-prompt',
    ];
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    window.location.hash = '';
  }, []);

  // ── View rendering ────────────────────────────────────────────────────

  // ── Global M mark — hide on landing (custom cursor) & working (tight header) ──
  const showMark = view !== 'landing' && view !== 'lobby' && view !== 'login' && view !== 'working';
  const userCtx = useContext(UserContext);

  if (view === 'intake') {
    return (
      <Suspense fallback={<ViewFallback text="Loading intake..." />}>
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
        {showMark && <MarbleMark />}
        <BriefingView
          onComplete={handleBriefingComplete}
          onBack={() => { window.location.hash = '#/intake'; }}
          onSkip={() => { window.location.hash = '#/strategy'; }}
        />
      </Suspense>
    );
  }

  if (view === 'strategy') {
    return (
      <Suspense fallback={<ViewFallback text="Loading strategy..." />}>
        {showMark && <MarbleMark />}
        <StrategyView
          onComplete={handleStrategyComplete}
          onBack={() => { window.location.hash = '#/briefing'; }}
          onSkip={() => { window.location.hash = '#/instruct'; }}
        />
      </Suspense>
    );
  }

  if (view === 'instruct') {
    return (
      <Suspense fallback={<ViewFallback text="Loading..." />}>
        {showMark && <MarbleMark />}
        <InstructView
          onComplete={handleInstructComplete}
          onBack={() => { window.location.hash = '#/strategy'; }}
          onSkip={() => { window.location.hash = '#/team'; }}
        />
      </Suspense>
    );
  }

  if (view === 'team') {
    return (
      <Suspense fallback={<ViewFallback text="Loading team..." />}>
        {showMark && <MarbleMark />}
        <TeamView
          onTeamConfirmed={handleStaffingComplete}
          onBack={() => { window.location.hash = '#/instruct'; }}
          onSkip={() => { window.location.hash = '#/delivery'; }}
        />
      </Suspense>
    );
  }

  if (view === 'working') {
    return (
      <Suspense fallback={<ViewFallback text="Loading session..." />}>
        {showMark && <MarbleMark />}
        <WorkingView
          onComplete={() => { window.location.hash = '#/delivery'; }}
          onBack={() => { window.location.hash = '#/team'; }}
          onSkip={() => { window.location.hash = '#/delivery'; }}
        />
      </Suspense>
    );
  }

  if (view === 'delivery') {
    return (
      <Suspense fallback={<ViewFallback text="Loading delivery..." />}>
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

  // ── Login — standalone login page ──────────────────────────────────────
  if (view === 'login') {
    return (
      <Suspense fallback={<ViewFallback text="Loading..." />}>
        <LoginView
          onAuth={(user) => {
            if (userCtx) userCtx.login(user);
            window.location.hash = '#/lobby';
          }}
          onBack={() => { window.location.hash = '#/lobby'; }}
        />
      </Suspense>
    );
  }

  // ── Agent Docs — API documentation for agent clients ───────────────────
  if (view === 'agent-docs') {
    return (
      <Suspense fallback={<ViewFallback text="Loading API docs..." />}>
        {showMark && <MarbleMark />}
        <AgentDocsView onBack={() => { window.location.hash = ''; }} />
      </Suspense>
    );
  }

  // ── Lobby — cinematic MARBLE gate ────────────────────────────────────
  if (view === 'lobby') {
    return (
      <Suspense fallback={<ViewFallback text="Loading..." />}>
        <LobbyView
          onEnter={() => { window.location.hash = '#/dashboard'; }}
          onMyPage={() => { window.location.hash = '#/my-page'; }}
          onLogin={() => { window.location.hash = '#/login'; }}
          onAgentDocs={() => { window.location.hash = '#/agent-docs'; }}
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
        onEnter={() => { window.location.hash = '#/lobby'; }}
        onMyPage={() => { window.location.hash = '#/my-page'; }}
        onAgentDocs={() => { window.location.hash = '#/agent-docs'; }}
      />
    </Suspense>
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
