/**
 * QuickStartView — The Reception Desk.
 *
 * One generous input card. Bold serif heading. Everything else
 * inside the card's bottom bar. Extreme restraint.
 *
 * v2: "More Marble" — tier hints, shimmer buttons, stronger
 *     marble texture, decorative rule, card elevation.
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
import { useCoworkFolder } from '../cowork/useCoworkFolder.js';
import { CoworkFolderPanel } from '../cowork/CoworkFolderPanel.js';
import { YOLO_CONFIGS, type YoloTier } from './yolo-config.js';
import type { FrontendParsedDocument } from '../briefing/hooks/useDocumentUpload.js';

// ── Types ──────────────────────────────────────────────────────────────

type EngagementTier = 'counsel' | 'review' | 'full-bench';

const TIER_MAP: Record<EngagementTier, YoloTier> = {
  counsel: 'standard',
  review: 'white-shoe',
  'full-bench': 'elite',
};

interface QuickStartProps {
  onQuickStart: (question: string, tier: YoloTier, parsedDocs: FrontendParsedDocument[]) => Promise<void>;
  onGuidedFlow: () => void;
  onBetTheCompany?: () => void;
}

// ── Shimmer Button (borrowed from LobbyView) ──────────────────────────

function ShimmerButton({
  onClick,
  className,
  style: btnStyle,
  children,
}: {
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative overflow-hidden border-[1.5px] border-text rounded-sm',
        'font-sans text-[11px] font-semibold tracking-[1px] uppercase',
        'px-[18px] py-2 cursor-pointer',
        'transition-[background-color,color,border-color] duration-250 ease-in-out',
        className,
      )}
      style={{
        ...btnStyle,
        backgroundColor: hovered ? colors.text : 'transparent',
        color: hovered ? '#fff' : colors.text,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <span
          className="absolute top-0 -left-full w-3/5 h-full pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
            animation: 'marbleShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export default function QuickStartView({ onQuickStart, onGuidedFlow, onBetTheCompany }: QuickStartProps) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Core state
  const [question, setQuestion] = useState('');
  const [tier, setTier] = useState<EngagementTier>('counsel');
  const [submitting, setSubmitting] = useState(false);
  const [instructHovered, setInstructHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [archiveHovered, setArchiveHovered] = useState(false);
  const [agentsHovered, setAgentsHovered] = useState(false);

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

  // Cowork folder mode
  const cowork = useCoworkFolder();
  const hasFolder = cowork.status !== 'disconnected';
  const folderHasSelected = cowork.files.some(f => f.selected);

  // Smart defaults
  useEffect(() => {
    setTier(documents.length > 0 ? 'review' : 'counsel');
  }, [documents.length]);

  // Auto-focus textarea on mount
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 600);
    return () => clearTimeout(t);
  }, []);

  // Submission
  const canSubmit = (question.trim().length > 0 || documents.length > 0 || folderHasSelected) && !submitting && !parsing;

  const handleSubmit = useCallback(async () => {
    if (submitting || parsing) return;
    if (question.trim().length === 0 && documents.length === 0 && !folderHasSelected) return;
    setSubmitting(true);
    try {
      let docs: FrontendParsedDocument[] = parsedDocuments;

      // If cowork folder is active, read selected files from it
      if (hasFolder && folderHasSelected) {
        docs = await cowork.getSelectedDocuments();
        sessionStorage.setItem('shem-cowork-active', 'true');
      }

      await onQuickStart(question.trim(), TIER_MAP[tier], docs);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, parsing, question, documents.length, folderHasSelected, tier, parsedDocuments, hasFolder, cowork, onQuickStart]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }, [handleSubmit]);

  // Tier configs for hints
  const counselConfig = YOLO_CONFIGS['standard'];
  const reviewConfig = YOLO_CONFIGS['white-shoe'];
  const eliteConfig = YOLO_CONFIGS['elite'];

  return (
    <div
      className="w-full min-h-screen bg-bg flex flex-col items-center font-sans relative overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* ── Marble texture — subtle but visible ──────────── */}
      <img
        src={`${import.meta.env.BASE_PATH ?? import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        style={{ filter: 'contrast(0.65) brightness(1.2) saturate(0.2)', opacity: 0.18 }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${colors.bg} 0%, rgba(250,249,246,0.82) 40%, ${colors.bg} 100%)` }}
      />

      {/* ── Top nav ────────────────────────────────────── */}
      <div
        className="relative z-2 w-full flex justify-between items-center pt-5 px-7 box-border"
        style={{ animation: 'qsFadeIn 0.5s ease 0.7s both' }}
      >
        {/* Archive monogram — minimal, architectural */}
        <button
          onClick={() => { window.location.hash = '#/archive'; }}
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center border cursor-pointer transition-all duration-250 ease-in-out"
          style={{
            borderColor: archiveHovered ? colors.text : 'rgba(0,0,0,0.12)',
            backgroundColor: archiveHovered ? colors.text : 'transparent',
            color: archiveHovered ? '#fff' : colors.text,
          }}
          onMouseEnter={() => setArchiveHovered(true)}
          onMouseLeave={() => setArchiveHovered(false)}
          title="Archive"
        >
          <span className="font-serif text-[14px] font-medium leading-none" style={{ marginTop: 1 }}>
            A
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Agents — discovery button, distinct accent style */}
          <button
            onClick={() => { window.location.hash = '#/agent-docs'; }}
            className={cn(
              'font-sans text-[11px] font-semibold tracking-[1.5px] uppercase',
              'py-1.5 cursor-pointer bg-transparent border-none',
              'transition-colors duration-250 ease-in-out',
            )}
            style={{
              color: agentsHovered ? colors.accent : colors.textMuted,
              borderLeft: `2px solid ${agentsHovered ? colors.accent : 'rgba(0,0,0,0.1)'}`,
              paddingLeft: 12,
              paddingRight: 4,
            }}
            onMouseEnter={() => setAgentsHovered(true)}
            onMouseLeave={() => setAgentsHovered(false)}
          >
            Agents
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-border opacity-40 mx-1" />

          {/* Account buttons — compact */}
          <ShimmerButton onClick={() => { window.location.hash = '#/my-cases'; }} className="px-[14px] py-1.5 text-[10px]">
            My Cases
          </ShimmerButton>
          <ShimmerButton onClick={() => { window.location.hash = '#/my-page'; }} className="px-[14px] py-1.5 text-[10px]">
            My Page
          </ShimmerButton>
          {!isLoggedIn ? (
            <ShimmerButton onClick={() => { window.location.hash = '#/login'; }} className="px-[14px] py-1.5 text-[10px]">
              Sign In
            </ShimmerButton>
          ) : (
            <ShimmerButton onClick={() => { userCtx!.logout(); }} className="px-[14px] py-1.5 text-[10px]">
              Sign Out
            </ShimmerButton>
          )}
        </div>
      </div>

      {/* ── Hero heading ─────────────────────────────────── */}
      <div className="relative z-2 text-center mt-12 sm:mt-16 lg:mt-20 mb-6 sm:mb-8 lg:mb-9 px-6">
        <h1
          className="text-3xl sm:text-4xl lg:text-[52px] font-light font-serif text-text m-0 tracking-tight leading-[1.15]"
          style={{ animation: 'qsFadeUp 0.7s ease 0.1s both' }}
        >
          Your firm is{' '}<span className="italic">ready.</span>
        </h1>
        <p
          className="text-[13px] sm:text-sm font-serif text-text-muted mt-4 tracking-[0.3px] leading-normal"
          style={{ animation: 'qsFadeIn 0.5s ease 0.3s both' }}
        >
          49 agents. Every discipline. Waiting on your instruction.
        </p>
        {/* Decorative rule */}
        <div
          className="mx-auto mt-5 w-16 h-px bg-border origin-center"
          style={{ animation: 'qsLineGrow 0.5s ease 0.45s both' }}
        />
      </div>

      {/* ── Focus glow — warm light when leaning in ───────── */}
      <div
        className="absolute z-1 pointer-events-none"
        style={{
          width: 700,
          height: 400,
          top: '28%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(600px circle, rgba(196, 93, 62, 0.045) 0%, transparent 70%)',
          opacity: inputFocused ? 1 : 0,
          transition: 'opacity 0.8s ease',
        }}
      />

      {/* ── The Card — unified input area ─────────────────── */}
      <div
        className={cn(
          'relative z-2 w-full max-w-[680px] mx-4 sm:mx-auto',
          'bg-bg-card rounded-xl p-0 box-border overflow-hidden',
          'transition-[border-color,box-shadow] duration-300 ease-in-out',
        )}
        style={{
          animation: 'qsFadeUp 0.6s ease 0.5s both',
          border: `1.5px solid ${isDragOver ? colors.accent : 'rgba(0,0,0,0.06)'}`,
          boxShadow: '0 2px 24px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)',
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="What brings you in today?"
          rows={4}
          className={cn(
            'w-full p-4 sm:p-6 lg:px-7 lg:pt-7 lg:pb-4',
            'text-base lg:text-[17px] font-serif text-text',
            'bg-transparent border-none resize-none outline-none',
            'leading-[1.7] box-border min-h-[120px]',
            'placeholder:font-serif placeholder:italic placeholder:text-text-dim',
          )}
        />

        {/* Cowork folder panel OR document list */}
        {hasFolder ? (
          <CoworkFolderPanel
            folderName={cowork.folderName!}
            files={cowork.files}
            status={cowork.status}
            onToggleFile={cowork.toggleFile}
            onDisconnect={cowork.disconnect}
          />
        ) : documents.length > 0 ? (
          <div className="px-6 pb-2">
            <DocumentList
              documents={documents}
              parsedDocuments={parsedDocuments}
              onRemove={removeDocument}
            />
          </div>
        ) : null}

        {uploadError && (
          <p className="text-xs font-sans text-danger mx-7 mb-2">{uploadError}</p>
        )}
        {parsing && (
          <p className="text-[11px] font-sans text-text-muted mx-7 mb-2 italic">
            Parsing{'\u2026'}
          </p>
        )}

        {/* ── Bottom bar (inside card) ──────────────────── */}
        <div className="border-t border-border bg-bg-panel">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.rtf,.html"
            onChange={handleFileInput}
            className="hidden"
          />

          {/* Row 1: Attach/Folder left — Instruct right */}
          <div className="flex items-center justify-between px-4 sm:px-5 pt-3 pb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={openFilePicker}
                disabled={hasFolder}
                className={cn(
                  'flex items-center bg-transparent border-none',
                  'font-sans text-[13px] cursor-pointer',
                  'py-1.5 px-2.5 rounded-sm',
                  'transition-colors duration-200 ease-in-out whitespace-nowrap',
                  hasFolder ? 'text-text-dim cursor-default opacity-40' : 'text-text-muted hover:text-text',
                )}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 6 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6" />
                </svg>
                {documents.length > 0 ? `${documents.length} document${documents.length > 1 ? 's' : ''}` : 'Attach'}
              </button>

              {cowork.isSupported && (
                <button
                  onClick={hasFolder ? undefined : cowork.openFolder}
                  disabled={documents.length > 0}
                  className={cn(
                    'flex items-center bg-transparent border-none',
                    'font-sans text-[13px] cursor-pointer',
                    'py-1.5 px-2.5 rounded-sm',
                    'transition-colors duration-200 ease-in-out whitespace-nowrap',
                    documents.length > 0
                      ? 'text-text-dim cursor-default opacity-40'
                      : hasFolder
                        ? 'text-accent'
                        : 'text-text-muted hover:text-text',
                  )}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 6 }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  {hasFolder ? cowork.folderName : 'Folder'}
                </button>
              )}
            </div>

            {/* ── Submit with shimmer ─────────────────────── */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'relative overflow-hidden',
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
              onMouseEnter={() => canSubmit && setInstructHovered(true)}
              onMouseLeave={() => setInstructHovered(false)}
            >
              {submitting ? 'Instructing\u2026' : 'Instruct \u2192'}
              {instructHovered && canSubmit && (
                <span
                  className="absolute top-0 -left-full w-3/5 h-full pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    animation: 'marbleShimmer 0.6s ease forwards',
                  }}
                />
              )}
            </button>
          </div>

          {/* Row 2: Tier selector */}
          <div className="flex gap-1.5 px-4 sm:px-5 pb-3">
            {([
              { key: 'counsel' as EngagementTier, name: 'Counsel', hint: `Expert opinion \u00B7 up to $${counselConfig.budgetUsd}` },
              { key: 'review' as EngagementTier, name: 'Review', hint: `Dedicated team \u00B7 up to $${reviewConfig.budgetUsd}` },
              { key: 'full-bench' as EngagementTier, name: 'Full Bench', hint: `Every specialist \u00B7 up to $${eliteConfig.budgetUsd}` },
            ]).map(t => {
              const active = tier === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTier(t.key)}
                  className={cn(
                    'flex-1 flex flex-col items-start py-2 px-3 rounded-md border cursor-pointer',
                    'transition-all duration-200 ease-in-out',
                  )}
                  style={{
                    backgroundColor: active ? colors.text : 'transparent',
                    borderColor: active ? colors.text : colors.border,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = colors.borderHover; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = colors.border; }}
                >
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: 0.5,
                    color: active ? '#fff' : colors.text,
                    transition: 'color 0.2s ease',
                  }}>
                    {t.name}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-sans)',
                    color: active ? 'rgba(255,255,255,0.6)' : colors.textDim,
                    marginTop: 1,
                    transition: 'color 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.hint}
                  </span>
                </button>
              );
            })}
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
          <span style={{
              fontSize: 10,
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase' as const,
              color: colors.textDim,
              marginBottom: 4,
              display: 'block',
            }}>
              Recommended
            </span>
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

      {/* ── Bet the Company ─────────────────────────────── */}
      {onBetTheCompany && (
        <div
          className={cn(
            'relative z-2 w-full max-w-[680px] mx-4 sm:mx-auto mt-3 box-border',
            'flex flex-col sm:flex-row items-start sm:items-center gap-6',
            'p-5 sm:p-6 lg:px-8 lg:py-7',
            'rounded-xl cursor-pointer',
            'transition-[border-color,background-color,box-shadow] duration-300 ease-in-out',
          )}
          style={{
            animation: 'qsFadeUp 0.6s ease 0.9s both',
            backgroundColor: 'rgba(255,255,255,0.7)',
            border: '1.5px solid rgba(0,0,0,0.06)',
          }}
          onClick={onBetTheCompany}
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
              Bet the Company
            </h3>
            <p className="text-[13px] font-sans text-text-muted mt-2 leading-relaxed tracking-[0.15px]">
              White-glove service. AI analysis reviewed by human legal professionals
              before anything reaches you. For when the stakes are highest.
            </p>
          </div>
          <div className="shrink-0 w-12 h-12 rounded-full border-[1.5px] border-border flex items-center justify-center transition-[border-color] duration-300 ease-in-out">
            <span className="text-xl text-text">{'\u2192'}</span>
          </div>
        </div>
      )}

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
