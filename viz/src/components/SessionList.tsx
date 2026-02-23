/**
 * SessionList — Dashboard landing page.
 *
 * Confident, focused hero. One CTA: Begin Engagement.
 * One escape hatch: White-Shoe YOLO for the bold.
 * Sessions live in My Cases now.
 */

import { useState, useCallback, useContext } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { UserContext } from '../auth/UserContext.js';
import type { YoloTier } from '../landing/yolo-config.js';

interface SessionListProps {
  onConnectSession: (id: string) => void;
  onConnectReplay: (id: string) => void;
  onBeginEngagement?: () => void;
  onYoloLaunch?: (question: string, tier: YoloTier) => void;
}

// Inject YOLO keyframes
const YOLO_KF_ID = 'dashboard-yolo-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(YOLO_KF_ID)) {
  const s = document.createElement('style');
  s.id = YOLO_KF_ID;
  s.textContent = `
    @keyframes dashboardYoloGlow {
      0%, 100% { box-shadow: 0 0 0 rgba(196, 93, 62, 0); }
      50% { box-shadow: 0 0 24px rgba(196, 93, 62, 0.15); }
    }
  `;
  document.head.appendChild(s);
}

export function SessionList({ onBeginEngagement, onYoloLaunch }: SessionListProps) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const [yoloOpen, setYoloOpen] = useState(false);
  const [yoloQuestion, setYoloQuestion] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const handleYoloLaunch = useCallback((tier: YoloTier) => {
    const trimmed = yoloQuestion.trim();
    if (trimmed && onYoloLaunch) onYoloLaunch(trimmed, tier);
  }, [yoloQuestion, onYoloLaunch]);

  const yoloEmpty = !yoloQuestion.trim();

  return (
    <div style={styles.container}>
      {/* Top bar — nav */}
      <div style={styles.topBar}>
        {/* Left spacer — MarbleMark handles home */}
        <div />
        <div style={styles.topNavGroup}>
          <button
            onClick={() => { window.location.hash = '#/my-cases'; }}
            style={styles.topNavBtn}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}>
              <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 4V2.5A1.5 1.5 0 016.5 1h3A1.5 1.5 0 0111 2.5V4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            My Cases
          </button>
          <button
            onClick={() => { window.location.hash = '#/my-page'; }}
            style={styles.topNavBtn}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}>
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 14.5c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            My Page
          </button>
          {!isLoggedIn && (
            <button
              onClick={() => { window.location.hash = '#/login'; }}
              style={styles.topNavBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              Sign In
            </button>
          )}
          {isLoggedIn && (
            <button
              onClick={() => { userCtx!.logout(); }}
              style={styles.topNavBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div style={styles.hero}>
        <p style={styles.logoType}>MARBLE</p>

        <h1 style={styles.title}>
          Your <span style={styles.titleItalic}>Engagements</span>
        </h1>

        <p style={styles.subtitle}>
          Legal intelligence, delivered with certainty.
        </p>

        {/* Primary CTA */}
        {onBeginEngagement && (
          <button
            onClick={onBeginEngagement}
            style={{
              ...styles.ctaButton,
              backgroundColor: hoveredBtn === 'cta' ? 'transparent' : colors.text,
              color: hoveredBtn === 'cta' ? colors.text : '#fff',
            }}
            onMouseEnter={() => setHoveredBtn('cta')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Begin Engagement {'\u2192'}
          </button>
        )}

        {/* YOLO toggle — one small button, no explanation */}
        {onYoloLaunch && !yoloOpen && (
          <button
            onClick={() => setYoloOpen(true)}
            style={{
              ...styles.yoloToggleBtn,
              backgroundColor: hoveredBtn === 'yolo' ? 'transparent' : colors.accent,
              color: hoveredBtn === 'yolo' ? colors.accent : '#fff',
              borderColor: colors.accent,
              animation: 'dashboardYoloGlow 3s ease infinite',
            }}
            onMouseEnter={() => setHoveredBtn('yolo')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Express Lane
          </button>
        )}
      </div>

      {/* ── YOLO Panel — expands when toggled ──────────────────────── */}
      {yoloOpen && onYoloLaunch && (
        <div style={styles.yoloPanel}>
          <div style={styles.yoloPanelHeader}>
            <span style={styles.yoloPanelTitle}>Express Lane</span>
            <button
              onClick={() => setYoloOpen(false)}
              style={styles.yoloCloseBtn}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              {'\u2715'}
            </button>
          </div>

          <p style={styles.yoloDescription}>
            Skip the briefing. No documents, no context {'\u2014'} just a question and the full
            agentic team working on it. Same structure, same quality gates.
          </p>

          <textarea
            value={yoloQuestion}
            onChange={e => setYoloQuestion(e.target.value)}
            placeholder="What's your legal question?"
            rows={3}
            style={{
              ...styles.yoloInput,
              borderColor: yoloQuestion.trim() ? colors.accent : colors.border,
            }}
          />

          <div style={styles.yoloBtnRow}>
            <button
              onClick={() => handleYoloLaunch('standard')}
              disabled={yoloEmpty}
              style={{
                ...styles.yoloLaunchBtn,
                ...styles.yoloStandardBtn,
                opacity: yoloEmpty ? 0.35 : 1,
                cursor: yoloEmpty ? 'not-allowed' : 'pointer',
                backgroundColor: !yoloEmpty && hoveredBtn === 'yolo-std' ? 'transparent' : colors.text,
                color: !yoloEmpty && hoveredBtn === 'yolo-std' ? colors.text : '#fff',
              }}
              onMouseEnter={() => !yoloEmpty && setHoveredBtn('yolo-std')}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              Launch {'\u2192'}
            </button>
            <button
              onClick={() => handleYoloLaunch('white-shoe')}
              disabled={yoloEmpty}
              style={{
                ...styles.yoloLaunchBtn,
                ...styles.yoloWhiteShoeBtn,
                opacity: yoloEmpty ? 0.35 : 1,
                cursor: yoloEmpty ? 'not-allowed' : 'pointer',
                backgroundColor: !yoloEmpty && hoveredBtn === 'yolo-ws' ? 'transparent' : colors.accent,
                color: !yoloEmpty && hoveredBtn === 'yolo-ws' ? colors.accent : '#fff',
              }}
              onMouseEnter={() => !yoloEmpty && setHoveredBtn('yolo-ws')}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              {'\u26A1'} White-Shoe {'\u2192'}
            </button>
          </div>

          <p style={styles.yoloWarning}>
            {'\u26A0'} White-Shoe engages the full senior team with extended deliberation.
            Expect significantly higher cost.
          </p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    overflow: 'auto',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: '0 24px 60px',
  },

  // ── Top Bar ──────────────────────────────────────────────────────
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 0 0',
  },
  topNavGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  topNavBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 18px 8px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  // ── Hero ──────────────────────────────────────────────────────────
  hero: {
    textAlign: 'center' as const,
    paddingTop: 120,
    paddingBottom: 60,
    maxWidth: 700,
    marginLeft: 'auto',
    marginRight: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 0,
  },
  logoType: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
    margin: 0,
  },
  title: {
    fontSize: 64,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    marginTop: 16,
    letterSpacing: -1.5,
    lineHeight: 1.05,
  },
  titleItalic: {
    fontStyle: 'italic' as const,
    fontWeight: 300,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 24,
    fontWeight: 400,
    lineHeight: 1.7,
    fontFamily: fonts.sans,
    letterSpacing: 0.3,
  },
  ctaButton: {
    marginTop: 48,
    padding: '18px 64px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  yoloToggleBtn: {
    marginTop: 20,
    padding: '10px 28px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.accent}`,
    backgroundColor: colors.accent,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },

  // ── YOLO Panel ──────────────────────────────────────────────────
  yoloPanel: {
    maxWidth: 600,
    marginLeft: 'auto',
    marginRight: 'auto',
    padding: `${spacing.xl}px`,
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    marginTop: spacing.lg,
  },
  yoloPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  yoloPanelTitle: {
    fontSize: 18,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.accent,
  },
  yoloCloseBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
  yoloInput: {
    width: '100%',
    padding: '14px 16px',
    fontSize: 15,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: 1.6,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.25s ease',
  },
  yoloBtnRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  yoloLaunchBtn: {
    padding: '14px 20px',
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  yoloStandardBtn: {
    backgroundColor: colors.text,
    color: '#fff',
    border: `2px solid ${colors.text}`,
  },
  yoloWhiteShoeBtn: {
    backgroundColor: colors.accent,
    color: '#fff',
    border: `2px solid ${colors.accent}`,
  },
  yoloDescription: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 1.7,
    margin: `0 0 ${spacing.lg}px`,
    fontFamily: fonts.sans,
    letterSpacing: 0.2,
  },
  yoloWarning: {
    fontSize: 11,
    color: colors.accent,
    lineHeight: 1.5,
    margin: `${spacing.md}px 0 0`,
    fontFamily: fonts.sans,
    fontWeight: 500,
    letterSpacing: 0.3,
    textAlign: 'center' as const,
    opacity: 0.8,
  },
};
