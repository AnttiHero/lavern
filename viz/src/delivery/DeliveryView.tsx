/**
 * DeliveryView — Tabbed editorial delivery screen.
 *
 * Six tabs present the work product as a professional handoff:
 *   1. The Work    — primary deliverable with executive summary + downloads
 *   2. The Review  — process transparency: what was checked, debated, escalated
 *   3. The Story   — storified project narrative
 *   4. The Scorecard — quality metrics and team performance
 *   5. Next Steps  — implementation guide and watch-outs
 *   6. Ask the Team — post-delivery conversational Q&A
 *
 * Fetches data from GET /api/sessions/:id or falls back to
 * demo data when session ID starts with "demo-session-".
 */

import { useState, useEffect } from 'react';
import { useResponsive } from '../hooks/useMediaQuery.js';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';
import { useDeliveryData } from './hooks/useDeliveryData.js';
import { DeliveryHeader } from './components/DeliveryHeader.js';
import { TabBar, type DeliveryTab } from './components/TabBar.js';
import { TheWorkTab } from './components/TheWorkTab.js';
import { ReviewTab } from './components/ReviewTab.js';
import { TheStoryTab } from './components/TheStoryTab.js';
import { TheScorecardTab } from './components/TheScorecardTab.js';
import { NextStepsTab } from './components/NextStepsTab.js';
import { ConversationTab, type ConversationMessage } from './components/ConversationTab.js';
import { ConfettiBurst } from './components/ConfettiBurst.js';
import { DeliverySkeleton } from './components/DeliverySkeleton.js';
import { DemoNarration } from '../components/DemoNarration.js';

interface Props {
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
}

interface MatterInfo {
  matterNumber?: string;
  matterTitle?: string;
  clientName?: string;
  matterType?: string;
  jurisdiction?: string;
}

export default function DeliveryView({ onContinue, onBack, onSkip }: Props) {
  const { data, loading, error, assemblyStatus, retryAssembly } = useDeliveryData();
  const [activeTab, setActiveTab] = useState<DeliveryTab>('work');
  const { isMobile } = useResponsive();

  // Conversation state lives here so it persists across tab switches
  const [convMessages, setConvMessages] = useState<ConversationMessage[]>([]);
  const [convInput, setConvInput] = useState('');
  const [convStreaming, setConvStreaming] = useState(false);

  // Detect demo session
  const isDemo = data?.sessionId.startsWith('demo-session') ?? false;

  // Demo: no auto-advance — user clicks "See Clawern →" in the footer

  // Detect if viewing an archived session from My Cases
  const [isArchiveView] = useState(() => {
    const flag = sessionStorage.getItem('shem-from-archive');
    if (flag === 'true') {
      sessionStorage.removeItem('shem-from-archive');
      return true;
    }
    return false;
  });

  // Read matter info from sessionStorage
  const [matterInfo] = useState<MatterInfo>(() => {
    try {
      const stored = sessionStorage.getItem('shem-matter-data');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // Build narration detail with cost info
  const narrationDetail = data
    ? `Transformed document with full process transparency. Cost: $${data.cost.accumulated.toFixed(2)}`
    : undefined;

  return (
    <main style={{
      ...styles.container,
      ...(isMobile ? { padding: spacing.lg } : {}),
    }} id="main-content">
      {isDemo && <DemoNarration step={3} detail={narrationDetail} />}
      <DeliveryHeader
        matterNumber={matterInfo.matterNumber}
        matterType={matterInfo.matterType}
        jurisdiction={matterInfo.jurisdiction}
        onBack={isArchiveView ? () => { window.location.hash = '#/my-cases'; } : onBack}
        onSkip={isArchiveView ? undefined : onSkip}
      />

      {loading && <DeliverySkeleton />}
      {error && <div style={styles.errorState}>{error}</div>}

      {data && (
        <>
          <ConfettiBurst />
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          <div key={activeTab} role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} style={{ animation: 'tabFadeIn 0.3s ease both' }}>
            {activeTab === 'work' && <TheWorkTab data={data} assemblyStatus={assemblyStatus} onRetryAssembly={retryAssembly} />}
            {activeTab === 'review' && <ReviewTab data={data} />}
            {activeTab === 'story' && <TheStoryTab data={data} />}
            {activeTab === 'scorecard' && <TheScorecardTab data={data} />}
            {activeTab === 'next-steps' && <NextStepsTab data={data} />}
            {activeTab === 'conversation' && (
              isDemo ? (
                <div style={styles.demoConversationNotice}>
                  <div style={styles.demoNoticeTitle}>Live Session Feature</div>
                  <div style={styles.demoNoticeBody}>
                    In a live engagement, you can ask the team follow-up questions about their analysis,
                    request alternative clause drafts, or drill into specific findings. The team responds
                    with full context from the session.
                  </div>
                </div>
              ) : (
                <ConversationTab
                  sessionId={data.sessionId}
                  messages={convMessages}
                  setMessages={setConvMessages}
                  input={convInput}
                  setInput={setConvInput}
                  streaming={convStreaming}
                  setStreaming={setConvStreaming}
                />
              )
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        {isArchiveView ? (
          <>
            <button
              onClick={() => { window.location.hash = '#/working'; }}
              style={styles.secondaryBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.transform = 'translateY(-2px)'; b.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; b.style.transform = ''; b.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.5)'; }}
            >
              View Agent Work
            </button>
            <button
              onClick={() => { window.location.hash = '#/my-cases'; }}
              style={styles.continueBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.transform = 'translateY(-2px) scale(1.02)'; b.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.4), 0 14px 40px rgba(0,0,0,0.25)'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.transform = ''; b.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35), 0 8px 28px rgba(0,0,0,0.18)'; }}
            >
              {'\u2190'} Back to Cases
            </button>
          </>
        ) : isDemo ? (
          <>
            <button
              onClick={() => {
                sessionStorage.removeItem('shem-session-id');
                sessionStorage.removeItem('shem-demo-case');
                window.location.hash = '#/demo';
              }}
              style={styles.secondaryBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.transform = 'translateY(-2px)'; b.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; b.style.transform = ''; b.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.5)'; }}
            >
              Try Another Case
            </button>
            <button
              onClick={() => {
                sessionStorage.setItem('shem-demo-resume', 'clawern');
                window.location.hash = '#/demo';
              }}
              style={styles.continueBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.transform = 'translateY(-2px) scale(1.02)'; b.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.4), 0 14px 40px rgba(0,0,0,0.25)'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.transform = ''; b.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35), 0 8px 28px rgba(0,0,0,0.18)'; }}
            >
              See how the autopilot works {'\u2192'}
            </button>
          </>
        ) : (
          <button
            onClick={onContinue}
            style={styles.continueBtn}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          >
            Continue to Billing {'\u2192'}
          </button>
        )}
      </div>

      {/* AI disclaimer */}
      <p style={styles.aiDisclaimer}>
        Lavern assists with document design and analysis. It does not provide legal advice.
        Always verify results with qualified legal professionals.
      </p>

      {/* Branding footer */}
      <div style={styles.brandingFooter}>
        <LavernIlluminated
          color={colors.textDim}
          glow="rgba(150, 135, 95, 0.4)"
          style={{ fontSize: 9, letterSpacing: 4 }}
        />
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxxl}px`,
    maxWidth: 940,
    margin: '0 auto',
    position: 'relative',
  },
  errorState: {
    textAlign: 'center' as const,
    color: colors.danger,
    fontSize: 14,
    padding: '60px 0',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxxl,
  },
  brandingFooter: {
    textAlign: 'center' as const,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  secondaryBtn: {
    padding: '15px 40px',
    borderRadius: 100,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.22s ease, color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  continueBtn: {
    padding: '15px 40px',
    borderRadius: 100,
    border: 'none',
    background: `linear-gradient(170deg, ${colors.text} 0%, #0d0d0d 100%)`,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'transform 0.22s ease, box-shadow 0.22s ease',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35), 0 8px 28px rgba(0,0,0,0.18)',
  },
  demoConversationNotice: {
    textAlign: 'center' as const,
    padding: '60px 40px',
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  demoNoticeTitle: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 12,
  },
  demoNoticeBody: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.7,
    maxWidth: 480,
    margin: '0 auto',
  },
  aiDisclaimer: {
    textAlign: 'center' as const,
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    lineHeight: 1.6,
    maxWidth: 480,
    margin: '0 auto',
    paddingTop: spacing.lg,
  },
};
