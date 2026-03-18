/**
 * SessionList — Dashboard landing page.
 *
 * Confident, focused hero. One CTA: Begin Engagement.
 * One escape hatch: White-Shoe YOLO for the bold.
 * Sessions live in My Cases now.
 */

import { useState, useCallback, useContext } from 'react';
import { colors } from '../staffing/styles/tokens.js';
import { UserContext } from '../auth/UserContext.js';
import { LavernIlluminated } from './LavernIlluminated.js';
import { cn } from '../utils/cn.js';
import type { YoloTier } from '../landing/yolo-config.js';

interface SessionListProps {
  onConnectSession: (id: string) => void;
  onConnectReplay: (id: string) => void;
  onBeginEngagement?: () => void;
  onYoloLaunch?: (question: string, tier: YoloTier) => void;
}

// Shared nav button class
const NAV_BTN = 'flex items-center px-2.5 py-1.5 sm:px-4 sm:py-2 sm:pl-3.5 rounded-sm border-[1.5px] border-text bg-transparent text-text font-sans text-[11px] font-semibold cursor-pointer tracking-[1px] uppercase transition-[background-color,color,border-color] duration-250 whitespace-nowrap';

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
    <div className="relative w-full min-h-screen bg-bg text-text font-sans px-4 sm:px-6 pb-10 sm:pb-15">
      {/* Top bar — nav */}
      <div className="flex justify-between items-center pt-5">
        <div />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { window.location.hash = '#/my-cases'; }}
            className={NAV_BTN}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="mr-1.5">
              <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 4V2.5A1.5 1.5 0 016.5 1h3A1.5 1.5 0 0111 2.5V4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            My Cases
          </button>
          <button
            onClick={() => { window.location.hash = '#/my-page'; }}
            className={NAV_BTN}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="mr-1.5">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 14.5c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            My Page
          </button>
          {!isLoggedIn && (
            <button
              onClick={() => { window.location.hash = '#/login'; }}
              className={NAV_BTN}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              Sign In
            </button>
          )}
          {isLoggedIn && (
            <button
              onClick={() => { userCtx!.logout(); }}
              className={NAV_BTN}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div className="text-center pt-16 sm:pt-20 lg:pt-[120px] pb-8 sm:pb-12 lg:pb-[60px] max-w-[700px] mx-auto flex flex-col items-center">
        <p className="text-[10px] font-semibold font-sans text-text-muted tracking-[4px] uppercase m-0">
          <LavernIlluminated color={colors.textMuted} />
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[64px] font-light font-serif text-text m-0 mt-4 tracking-tight leading-none">
          Your <span className="italic font-light">Engagements</span>
        </h1>

        <p className="text-sm sm:text-base text-text-muted mt-6 font-normal leading-relaxed font-sans tracking-[0.3px]">
          Legal intelligence, delivered with certainty.
        </p>

        {/* Primary CTA */}
        {onBeginEngagement && (
          <button
            onClick={onBeginEngagement}
            className="mt-8 sm:mt-10 lg:mt-12 px-8 py-4 sm:px-12 sm:py-4.5 lg:px-16 lg:py-[18px] rounded-sm border-2 border-text font-sans text-xs sm:text-sm font-semibold tracking-[2px] uppercase cursor-pointer transition-[background-color,color,border-color] duration-250"
            style={{
              backgroundColor: hoveredBtn === 'cta' ? 'transparent' : colors.text,
              color: hoveredBtn === 'cta' ? colors.text : '#fff',
            }}
            onMouseEnter={() => setHoveredBtn('cta')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Begin Engagement {'\u2192'}
          </button>
        )}

        {/* YOLO toggle */}
        {onYoloLaunch && !yoloOpen && (
          <button
            onClick={() => setYoloOpen(true)}
            className="mt-5 px-5 sm:px-7 py-2.5 rounded-sm border-2 border-accent font-sans text-[11px] font-semibold tracking-[1.5px] uppercase cursor-pointer transition-[background-color,color,border-color] duration-250"
            style={{
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
        <div className="max-w-[600px] mx-auto p-4 sm:p-6 bg-bg-card border-[1.5px] border-border rounded-sm mt-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg font-light font-serif text-accent">Express Lane</span>
            <button
              onClick={() => setYoloOpen(false)}
              className="w-7 h-7 flex items-center justify-center border-[1.5px] border-text rounded-sm bg-transparent text-text text-xs cursor-pointer transition-[background-color,color] duration-250"
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              {'\u2715'}
            </button>
          </div>

          <p className="text-sm text-text-muted leading-relaxed mb-4 font-sans tracking-[0.2px]">
            Skip the briefing. No documents, no context {'\u2014'} just a question and the full
            agentic team working on it. Same structure, same quality gates.
          </p>

          <textarea
            value={yoloQuestion}
            onChange={e => setYoloQuestion(e.target.value)}
            placeholder="What's your legal question?"
            rows={3}
            className="w-full px-4 py-3.5 text-[15px] font-sans text-text bg-bg-input border-[1.5px] rounded-sm resize-y outline-none leading-relaxed box-border transition-[border-color] duration-250"
            style={{ borderColor: yoloQuestion.trim() ? colors.accent : colors.border }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <button
              onClick={() => handleYoloLaunch('standard')}
              disabled={yoloEmpty}
              className="py-3.5 px-5 rounded-sm font-sans text-xs font-semibold tracking-[1.5px] uppercase transition-[background-color,color,border-color] duration-250 border-2 border-text"
              style={{
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
              className="py-3.5 px-5 rounded-sm font-sans text-xs font-semibold tracking-[1.5px] uppercase transition-[background-color,color,border-color] duration-250 border-2 border-accent"
              style={{
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

          <p className="text-[11px] text-accent leading-snug mt-3 font-sans font-medium tracking-[0.3px] text-center opacity-80">
            {'\u26A0'} White-Shoe engages the full senior team with extended deliberation.
            Expect significantly higher cost.
          </p>
        </div>
      )}
    </div>
  );
}
