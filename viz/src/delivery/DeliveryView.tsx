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

import { useState } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { useDeliveryData } from './hooks/useDeliveryData.js';
import { DeliveryHeader } from './components/DeliveryHeader.js';
import { TabBar, type DeliveryTab } from './components/TabBar.js';
import { TheWorkTab } from './components/TheWorkTab.js';
import { ReviewTab } from './components/ReviewTab.js';
import { TheStoryTab } from './components/TheStoryTab.js';
import { TheScorecardTab } from './components/TheScorecardTab.js';
import { NextStepsTab } from './components/NextStepsTab.js';
import { ConversationTab, type ConversationMessage } from './components/ConversationTab.js';

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
  const { data, loading, error } = useDeliveryData();
  const [activeTab, setActiveTab] = useState<DeliveryTab>('work');

  // Conversation state lives here so it persists across tab switches
  const [convMessages, setConvMessages] = useState<ConversationMessage[]>([]);
  const [convInput, setConvInput] = useState('');
  const [convStreaming, setConvStreaming] = useState(false);

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

  return (
    <div style={styles.container}>
      <DeliveryHeader
        matterNumber={matterInfo.matterNumber}
        matterType={matterInfo.matterType}
        jurisdiction={matterInfo.jurisdiction}
        onBack={isArchiveView ? () => { window.location.hash = '#/my-cases'; } : onBack}
        onSkip={isArchiveView ? undefined : onSkip}
      />

      {loading && <div style={styles.loadingState}>Loading session results...</div>}
      {error && <div style={styles.errorState}>{error}</div>}

      {data && (
        <>
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'work' && <TheWorkTab data={data} />}
          {activeTab === 'review' && <ReviewTab data={data} />}
          {activeTab === 'story' && <TheStoryTab data={data} />}
          {activeTab === 'scorecard' && <TheScorecardTab data={data} />}
          {activeTab === 'next-steps' && <NextStepsTab data={data} />}
          {activeTab === 'conversation' && (
            <ConversationTab
              sessionId={data.sessionId}
              messages={convMessages}
              setMessages={setConvMessages}
              input={convInput}
              setInput={setConvInput}
              streaming={convStreaming}
              setStreaming={setConvStreaming}
            />
          )}
        </>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        {isArchiveView ? (
          <>
            <button
              onClick={() => { window.location.hash = '#/working'; }}
              style={styles.secondaryBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              View Agent Work
            </button>
            <button
              onClick={() => { window.location.hash = '#/my-cases'; }}
              style={styles.continueBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            >
              {'\u2190'} Back to Cases
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    maxWidth: 900,
    margin: '0 auto',
    position: 'relative',
  },
  loadingState: {
    textAlign: 'center' as const,
    color: colors.textMuted,
    fontSize: 14,
    padding: '60px 0',
  },
  errorState: {
    textAlign: 'center' as const,
    color: colors.danger,
    fontSize: 14,
    padding: '60px 0',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  secondaryBtn: {
    padding: '12px 36px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  continueBtn: {
    padding: '12px 36px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
};
