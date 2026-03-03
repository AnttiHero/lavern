/**
 * QuickStartView — The Reception Desk.
 *
 * One generous input card. Bold serif heading. Everything else
 * inside the card's bottom bar. Extreme restraint.
 *
 * Inspired by Cowork's "one thing" design, but with
 * law-firm gravity instead of productivity-tool energy.
 */

import { useState, useCallback, useContext, useEffect, useRef } from 'react';
import { colors } from '../staffing/styles/tokens.js';
import { cn } from '../utils/cn.js';
import { UserContext } from '../auth/UserContext.js';
import { MarbleIlluminated } from '../components/MarbleIlluminated.js';
import { DocumentList } from '../briefing/components/DocumentList.js';
import { useDocumentUpload } from '../briefing/hooks/useDocumentUpload.js';
import { YOLO_CONFIGS, type YoloTier } from './yolo-config.js';
import type { FrontendParsedDocument } from '../briefing/hooks/useDocumentUpload.js';

// ── Types ──────────────────────────────────────────────────────────────

type EngagementTier = 'advisory' | 'comprehensive';

const TIER_MAP: Record<EngagementTier, YoloTier> = {
  advisory: 'standard',
  comprehensive: 'white-shoe',
};

interface QuickStartProps {
  onQuickStart: (question: string, tier: YoloTier, parsedDocs: FrontendParsedDocument[]) => Promise<void>;
  onGuidedFlow: () => void;
}

// ── Component ──────────────────────────────────────────────────────────

export default function QuickStartView({ onQuickStart, onGuidedFlow }: QuickStartProps) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Core state
  const [question, setQuestion] = useState('');
  const [tier, setTier] = useState<EngagementTier>('advisory');
  const [submitting, setSubmitting] = useState(false);

  // Document upload
  const {
    documents,
    parsedDocuments,
    parsing,
    isDragOver,
    error: uploadError,
    inputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleFileInput,
    removeDocument,
  } = useDocumentUpload();

  // Smart defaults
  useEffect(() => {
    setTier(documents.length > 0 ? 'comprehensive' : 'advisory');
  }, [documents.length]);

  // Auto-focus textarea on mount
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 600);
    return () => clearTimeout(t);
  }, []);

  // Submission
  const canSubmit = (question.trim().length > 0 || documents.length > 0) && !submitting && !parsing;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onQuickStart(question.trim(), TIER_MAP[tier], parsedDocuments);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, question, tier, parsedDocuments, onQuickStart]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }, [handleSubmit]);

  // ── Shared hover handler for nav buttons ──
  const navBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = colors.text;
    e.currentTarget.style.color = '#fff';
  };
  const navBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.color = colors.text;
  };

  return (
    <div
      className="w-full min-h-screen bg-bg flex flex-col items-center font-sans relative overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* ── Marble texture — very faint ───────────────────── */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        style={{ filter: 'contrast(0.6) brightness(1.25) saturate(0.15)', opacity: 0.12 }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${colors.bg} 0%, rgba(250,249,246,0.85) 40%, ${colors.bg} 100%)` }}
      />

      {/* ── Top nav ──────────────────────────────────────── */}
      <div
        className="relative z-2 w-full flex justify-between items-center pt-5 px-7 box-border"
        style={{ animation: 'qsFadeIn 0.6s ease 0.8s both' }}
      >
        <div />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { window.location.hash = '#/my-cases'; }}
            className={cn(
              'flex items-center px-[18px] py-2 rounded-sm border-[1.5px] border-text',
              'bg-transparent font-sans text-[11px] font-semibold cursor-pointer',
              'tracking-[1px] uppercase whitespace-nowrap',
              'transition-[background-color,color] duration-250 ease-in-out',
            )}
            style={{ color: colors.text }}
            onMouseEnter={navBtnEnter}
            onMouseLeave={navBtnLeave}
          >
            My Cases
          </button>
          <button
            onClick={() => { window.location.hash = '#/my-page'; }}
            className={cn(
              'flex items-center px-[18px] py-2 rounded-sm border-[1.5px] border-text',
              'bg-transparent font-sans text-[11px] font-semibold cursor-pointer',
              'tracking-[1px] uppercase whitespace-nowrap',
              'transition-[background-color,color] duration-250 ease-in-out',
            )}
            style={{ color: colors.text }}
            onMouseEnter={navBtnEnter}
            onMouseLeave={navBtnLeave}
          >
            My Page
          </button>
          {!isLoggedIn ? (
            <button
              onClick={() => { window.location.hash = '#/login'; }}
              className={cn(
                'flex items-center px-[18px] py-2 rounded-sm border-[1.5px] border-text',
                'bg-transparent font-sans text-[11px] font-semibold cursor-pointer',
                'tracking-[1px] uppercase whitespace-nowrap',
                'transition-[background-color,color] duration-250 ease-in-out',
              )}
              style={{ color: colors.text }}
              onMouseEnter={navBtnEnter}
              onMouseLeave={navBtnLeave}
            >
              Sign In
            </button>
          ) : (
            <button
              onClick={() => { userCtx!.logout(); }}
              className={cn(
                'flex items-center px-[18px] py-2 rounded-sm border-[1.5px] border-text',
                'bg-transparent font-sans text-[11px] font-semibold cursor-pointer',
                'tracking-[1px] uppercase whitespace-nowrap',
                'transition-[background-color,color] duration-250 ease-in-out',
              )}
              style={{ color: colors.text }}
              onMouseEnter={navBtnEnter}
              onMouseLeave={navBtnLeave}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* ── Hero heading ─────────────────────────────────── */}
      <div className="relative z-2 text-center mt-12 sm:mt-16 lg:mt-20 mb-6 sm:mb-8 lg:mb-9 px-6">
        <h1
          className="text-3xl sm:text-4xl lg:text-[52px] font-light font-serif text-text m-0 tracking-tight leading-[1.15]"
          style={{ animation: 'qsFadeUp 0.8s ease 0.15s both' }}
        >
          Your firm is ready.
        </h1>
        <p
          className="text-sm font-sans text-text-muted mt-4 tracking-[0.3px] leading-normal"
          style={{ animation: 'qsFadeIn 0.6s ease 0.5s both' }}
        >
          57 agents. Every discipline. Waiting on your instruction.
        </p>
      </div>

      {/* ── The Card — unified input area ─────────────────── */}
      <div
        className={cn(
          'relative z-2 w-full max-w-[680px] mx-4 sm:mx-auto',
          'bg-bg-card rounded-xl p-0 box-border overflow-hidden',
          'shadow-[0_2px_20px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)]',
          'transition-[border-color] duration-300 ease-in-out',
        )}
        style={{
          animation: 'qsFadeUp 0.6s ease 0.3s both',
          border: `1.5px solid ${isDragOver ? colors.accent : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What brings you in today?"
          rows={4}
          className={cn(
            'w-full p-4 sm:p-6 lg:px-7 lg:pt-7 lg:pb-4',
            'text-base lg:text-[17px] font-serif text-text',
            'bg-transparent border-none resize-none outline-none',
            'leading-[1.7] box-border min-h-[120px]',
          )}
        />

        {/* Document list inside card (if any) */}
        {documents.length > 0 && (
          <div className="px-6 pb-2">
            <DocumentList
              documents={documents}
              parsedDocuments={parsedDocuments}
              onRemove={removeDocument}
            />
          </div>
        )}

        {uploadError && (
          <p className="text-xs font-sans text-danger mx-7 mb-2">{uploadError}</p>
        )}
        {parsing && (
          <p className="text-[11px] font-sans text-text-muted mx-7 mb-2 italic">
            Parsing{'\u2026'}
          </p>
        )}

        {/* ── Bottom bar (inside card) ──────────────────── */}
        <div className={cn(
          'flex flex-col sm:flex-row items-stretch sm:items-center',
          'justify-between gap-3 sm:gap-0',
          'py-3 px-4 sm:pl-5 sm:pr-4',
          'border-t border-border bg-bg-panel',
        )}>
          {/* Left: attach documents */}
          <button
            onClick={openFilePicker}
            className={cn(
              'flex items-center bg-transparent border-none',
              'font-sans text-[13px] cursor-pointer',
              'py-1.5 px-2.5 rounded-sm',
              'transition-colors duration-200 ease-in-out whitespace-nowrap',
            )}
            style={{ color: colors.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.color = colors.text; }}
            onMouseLeave={e => { e.currentTarget.style.color = colors.textMuted; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 6 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
            {documents.length > 0 ? `${documents.length} document${documents.length > 1 ? 's' : ''}` : 'Attach documents'}
          </button>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html"
            onChange={handleFileInput}
            className="hidden"
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Tier toggle */}
            <div className="flex rounded-sm border border-border overflow-hidden">
              <button
                onClick={() => setTier('advisory')}
                className={cn(
                  'py-1.5 px-3.5 text-[11px] font-sans font-semibold',
                  'tracking-[0.5px] border-none cursor-pointer',
                  'transition-[background-color,color] duration-200 ease-in-out whitespace-nowrap',
                )}
                style={{
                  backgroundColor: tier === 'advisory' ? colors.text : 'transparent',
                  color: tier === 'advisory' ? '#fff' : colors.textMuted,
                }}
              >
                Advisory
              </button>
              <button
                onClick={() => setTier('comprehensive')}
                className={cn(
                  'py-1.5 px-3.5 text-[11px] font-sans font-semibold',
                  'tracking-[0.5px] border-none cursor-pointer',
                  'transition-[background-color,color] duration-200 ease-in-out whitespace-nowrap',
                )}
                style={{
                  backgroundColor: tier === 'comprehensive' ? colors.text : 'transparent',
                  color: tier === 'comprehensive' ? '#fff' : colors.textMuted,
                }}
              >
                Full Review
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'py-2.5 px-7 rounded-sm border-none',
                'font-sans text-sm font-semibold tracking-[0.5px]',
                'transition-[background-color,opacity] duration-200 ease-in-out whitespace-nowrap',
              )}
              style={{
                backgroundColor: colors.accent,
                color: '#fff',
                opacity: canSubmit ? 1 : 0.35,
                cursor: canSubmit ? 'pointer' : 'default',
              }}
              onMouseEnter={e => {
                if (!canSubmit) return;
                e.currentTarget.style.backgroundColor = '#a04a2e';
              }}
              onMouseLeave={e => {
                if (!canSubmit) return;
                e.currentTarget.style.backgroundColor = colors.accent;
              }}
            >
              {submitting ? 'Instructing\u2026' : 'Instruct \u2192'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────── */}
      <div
        className="relative z-2 flex items-center gap-5 w-full max-w-[680px] my-8 px-6 box-border"
        style={{ animation: 'qsFadeIn 0.5s ease 0.7s both' }}
      >
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs font-sans text-text-dim tracking-[1px] lowercase">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* ── Full Engagement — prominent section ──────────── */}
      <div
        className={cn(
          'relative z-2 w-full max-w-[680px] mx-4 sm:mx-auto',
          'flex flex-col sm:flex-row items-start sm:items-center gap-6',
          'p-5 sm:p-6 lg:px-8 lg:py-7',
          'rounded-xl box-border cursor-pointer',
          'transition-[border-color,background-color,box-shadow] duration-300 ease-in-out',
        )}
        style={{
          animation: 'qsFadeUp 0.6s ease 0.8s both',
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: '1.5px solid rgba(0,0,0,0.06)',
        }}
        onClick={onGuidedFlow}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = colors.borderHover;
          e.currentTarget.style.backgroundColor = colors.bgCard;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.7)';
        }}
      >
        <div className="flex-1">
          <h3 className="text-[22px] font-light font-serif text-text m-0 tracking-tight">
            The Full Engagement
          </h3>
          <p className="text-[13px] font-sans text-text-muted mt-2 leading-relaxed tracking-[0.15px]">
            Client intake. Guided briefing with AI interviewer. Strategy conference.
            Hand-picked team selection. The complete Marble experience.
          </p>
        </div>
        <div className="shrink-0 w-12 h-12 rounded-full border-[1.5px] border-border flex items-center justify-center transition-[border-color] duration-300 ease-in-out">
          <span className="text-xl text-text">{'\u2192'}</span>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div
        className="relative z-2 mt-auto pt-12 pb-8 text-center"
        style={{ animation: 'qsFadeIn 0.4s ease 1s both' }}
      >
        <MarbleIlluminated
          color={colors.textDim}
          glow="rgba(150, 135, 95, 0.4)"
          style={{ fontSize: 9, letterSpacing: 4 }}
        />
      </div>
    </div>
  );
}
