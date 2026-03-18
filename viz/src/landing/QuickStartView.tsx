/**
 * QuickStartView — The Reception Desk.
 *
 * One generous input card. Bold serif heading. Everything else
 * inside the card's bottom bar. Extreme restraint.
 *
 * v2: "More Lavern" — tier hints, shimmer buttons, stronger
 *     texture, decorative rule, card elevation.
 *
 * Inspired by Cowork's "one thing" design, but with
 * law-firm gravity instead of productivity-tool energy.
 */

import { useState, useCallback, useContext, useEffect, useRef } from 'react';
import { colors, fonts } from '../staffing/styles/tokens.js';
import { cn } from '../utils/cn.js';
import { UserContext } from '../auth/UserContext.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';
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
  onPricing?: () => void;
  onChallenge?: () => void;
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
            animation: 'lavernShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export default function QuickStartView({ onQuickStart, onGuidedFlow, onPricing, onChallenge }: QuickStartProps) {
  const userCtx = useContext(UserContext);
  const isLoggedIn = !!userCtx?.user;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Billable hours balance
  const [billableBalance, setBillableBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch('/api/billing/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.billableHours?.balance != null) {
          setBillableBalance(data.billableHours.balance);
        }
      })
      .catch(() => { /* silently ignore */ });
  }, [isLoggedIn]);

  // Core state
  const [question, setQuestion] = useState('');
  const [tier, setTier] = useState<EngagementTier>('counsel');
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false); // Sync guard against double-click race
  const [instructHovered, setInstructHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [archiveHovered, setArchiveHovered] = useState(false);
  const [pricingHovered, setPricingHovered] = useState(false);
  const [agentsHovered, setAgentsHovered] = useState(false);
  const [challengeHovered, setChallengeHovered] = useState(false);

  // Tier fill animation — black slides inside each pill
  const prevTierRef = useRef<EngagementTier>(tier);
  const [tierBounce, setTierBounce] = useState(false);
  const [tierAnimKey, setTierAnimKey] = useState(0); // bumped to retrigger pass-through
  const TIER_ORDER: EngagementTier[] = ['counsel', 'review', 'full-bench'];
  const tierIdx = TIER_ORDER.indexOf(tier);
  const prevIdx = TIER_ORDER.indexOf(prevTierRef.current);
  const tierDistance = Math.abs(tierIdx - prevIdx);
  const tierDirection = tierIdx > prevIdx ? 'ltr' : 'rtl'; // left-to-right or right-to-left

  // Instruct button "ready" pulse
  const [instructPulsed, setInstructPulsed] = useState(false);
  const prevCanSubmit = useRef(false);


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

  // Track tier changes for slide direction + micro-bounce + pass-through key
  useEffect(() => {
    setTierBounce(true);
    setTierAnimKey(k => k + 1);
    const t = setTimeout(() => {
      setTierBounce(false);
      prevTierRef.current = tier;
    }, 400); // update prevTier after animation completes
    return () => clearTimeout(t);
  }, [tier]);

  // Submission
  const canSubmit = (question.trim().length > 0 || documents.length > 0 || folderHasSelected) && !submitting && !parsing;

  // Instruct button ready pulse — fire once when canSubmit goes false→true
  useEffect(() => {
    if (canSubmit && !prevCanSubmit.current) {
      setInstructPulsed(true);
      const t = setTimeout(() => setInstructPulsed(false), 600);
      return () => clearTimeout(t);
    }
    prevCanSubmit.current = canSubmit;
  }, [canSubmit]);

  const handleSubmit = useCallback(async () => {
    // Synchronous ref guard — prevents double-click race (React state is async)
    if (submittedRef.current) return;
    if (submitting || parsing) return;
    if (question.trim().length === 0 && documents.length === 0 && !folderHasSelected) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      let docs: FrontendParsedDocument[] = parsedDocuments;

      // If cowork folder is active, read selected files from it
      if (hasFolder && folderHasSelected) {
        try {
          docs = await cowork.getSelectedDocuments();
          sessionStorage.setItem('shem-cowork-active', 'true');
        } catch (err) {
          console.warn('[QuickStart] Failed to read cowork folder, falling back to uploaded docs:', err);
        }
      }

      await onQuickStart(question.trim(), TIER_MAP[tier], docs);
    } finally {
      // Reset ref if we're still on this page (successful submit navigates away).
      // This handles the case where onQuickStart catches errors internally
      // without re-throwing — the catch block here would never fire,
      // leaving submittedRef stuck at true and blocking all future clicks.
      if (!window.location.hash.includes('#/working')) {
        submittedRef.current = false;
      }
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
      {/* ── Texture — subtle but visible ──────────── */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        role="presentation"
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
        <div className="flex items-center gap-5">
          {/* The Archive — quiet serif, just typography */}
          <button
            onClick={() => { window.location.hash = '#/archive'; }}
            className="cursor-pointer bg-transparent border-none transition-all duration-300 ease-in-out"
            style={{
              padding: '4px 0',
              color: archiveHovered ? colors.text : colors.textMuted,
              fontFamily: fonts.serif,
              fontStyle: 'italic',
              fontSize: 15,
              fontWeight: 400,
              letterSpacing: 0.5,
              borderBottom: archiveHovered ? `1px solid ${colors.text}` : '1px solid transparent',
            }}
            onMouseEnter={() => setArchiveHovered(true)}
            onMouseLeave={() => setArchiveHovered(false)}
          >
            The Archive
          </button>
          {/* Billable Hours — pricing */}
          {onPricing && (
            <div className="flex items-center gap-2">
              <button
                onClick={onPricing}
                className="cursor-pointer bg-transparent border-none transition-all duration-300 ease-in-out"
                style={{
                  padding: '4px 0',
                  color: pricingHovered ? colors.text : colors.textMuted,
                  fontFamily: fonts.serif,
                  fontStyle: 'italic',
                  fontSize: 15,
                  fontWeight: 400,
                  letterSpacing: 0.5,
                  borderBottom: pricingHovered ? `1px solid ${colors.text}` : '1px solid transparent',
                }}
                onMouseEnter={() => setPricingHovered(true)}
                onMouseLeave={() => setPricingHovered(false)}
              >
                The Billable Hours
              </button>
              {billableBalance != null && billableBalance <= 0 && (
                <button
                  onClick={onPricing}
                  className="cursor-pointer bg-transparent"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#EF5350',
                    letterSpacing: 0.3,
                    padding: '2px 8px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(229, 115, 115, 0.1)',
                    border: '1px solid rgba(229, 115, 115, 0.2)',
                  }}
                >
                  0h — top off
                </button>
              )}
            </div>
          )}
          {onChallenge && (
            <button
              onClick={onChallenge}
              className="cursor-pointer bg-transparent border-none transition-all duration-300 ease-in-out"
              style={{
                padding: '4px 0',
                color: challengeHovered ? colors.text : colors.textMuted,
                fontFamily: fonts.serif,
                fontStyle: 'italic',
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: 0.5,
                borderBottom: challengeHovered ? `1px solid ${colors.text}` : '1px solid transparent',
              }}
              onMouseEnter={() => setChallengeHovered(true)}
              onMouseLeave={() => setChallengeHovered(false)}
            >
              The Challenge
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Claw — the night shift */}
          <button
            onClick={() => { window.location.hash = '#/claw'; }}
            className="cursor-pointer bg-transparent border-none transition-all duration-300 ease-in-out"
            style={{
              fontSize: 18,
              padding: '2px 6px',
              opacity: agentsHovered ? 1 : 0.45,
              transform: agentsHovered ? 'scale(1.15) rotate(-10deg)' : 'scale(1)',
            }}
            onMouseEnter={() => setAgentsHovered(true)}
            onMouseLeave={() => setAgentsHovered(false)}
            title="Clawern"
          >
            {'\uD83E\uDD80'}
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
          50+ agent experts. Every discipline. Waiting on your instruction.
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
          border: `1.5px solid ${isDragOver ? colors.accent : inputFocused ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)'}`,
          boxShadow: inputFocused
            ? '0 8px 40px rgba(0,0,0,0.10), 0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)'
            : '0 2px 24px rgba(0,0,0,0.06), 0 1px 6px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)',
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
                  hasFolder ? 'text-text-dim cursor-default opacity-40' : 'text-text-muted hover:text-text hover:bg-black/[0.04]',
                )}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 6 }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
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
                        : 'text-text-muted hover:text-text hover:bg-black/[0.04]',
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
                'py-2.5 px-7 rounded-lg border-none',
                'font-sans text-sm font-semibold tracking-[0.5px]',
                'transition-[background-color,opacity,box-shadow,transform] duration-200 ease-in-out whitespace-nowrap',
              )}
              style={{
                backgroundColor: instructHovered && canSubmit ? '#B5523A' : colors.accent,
                color: '#fff',
                opacity: canSubmit ? 1 : 0.35,
                cursor: canSubmit ? 'pointer' : 'default',
                boxShadow: instructPulsed
                  ? '0 0 0 4px rgba(196, 93, 62, 0.15), 0 4px 16px rgba(196, 93, 62, 0.25)'
                  : instructHovered && canSubmit
                    ? '0 4px 16px rgba(196, 93, 62, 0.35), 0 2px 6px rgba(196, 93, 62, 0.2)'
                    : '0 1px 4px rgba(196, 93, 62, 0.15)',
                transform: instructPulsed
                  ? 'scale(1.04)'
                  : instructHovered && canSubmit ? 'translateY(-1px)' : 'none',
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
                    animation: 'lavernShimmer 0.6s ease forwards',
                  }}
                />
              )}
            </button>
          </div>

          {/* Row 2: Tier selector — black slides inside each pill */}
          <div className="flex gap-1.5 px-4 sm:px-5 pb-3">
            {([
              { key: 'counsel' as EngagementTier, name: 'Counsel', hint: `Expert opinion \u00B7 up to $${counselConfig.budgetUsd}` },
              { key: 'review' as EngagementTier, name: 'Review', hint: `Dedicated team \u00B7 up to $${reviewConfig.budgetUsd}` },
              { key: 'full-bench' as EngagementTier, name: 'Full Bench', hint: `Every specialist \u00B7 up to $${eliteConfig.budgetUsd}` },
            ]).map((t, i) => {
              const active = tier === t.key;
              const myIdx = i;

              // Is this a "middle" pill being jumped over?
              const isPassThrough = tierDistance > 1 && tierBounce
                && !active && t.key !== prevTierRef.current
                && ((tierDirection === 'ltr' && myIdx > prevIdx && myIdx < tierIdx)
                  || (tierDirection === 'rtl' && myIdx < prevIdx && myIdx > tierIdx));

              // Fill rests on the side NEAREST to the active pill,
              // so it always enters/exits in the direction of travel.
              const fillTranslate = active
                ? 'translateX(0)'
                : myIdx < tierIdx
                  ? 'translateX(105%)'   // left of active → hidden right (toward active)
                  : 'translateX(-105%)'; // right of active → hidden left (toward active)

              // Fill style: pass-through uses keyframe animation, others use transition
              const fillStyle: React.CSSProperties = isPassThrough
                ? {
                    backgroundColor: colors.text,
                    animation: `${tierDirection === 'ltr' ? 'tierPassLTR' : 'tierPassRTL'} 0.35s cubic-bezier(0.25, 0.1, 0.25, 1) 0.06s both`,
                  }
                : {
                    backgroundColor: colors.text,
                    transform: fillTranslate,
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  };

              // Stagger: when becoming active, text waits for fill to arrive;
              // when becoming inactive, text changes first before fill leaves.
              const textTransition = active
                ? 'color 0.18s ease 0.12s'   // delay — fill arrives first, then text lightens
                : 'color 0.12s ease';         // instant — text darkens before fill slides away

              return (
                <button
                  key={t.key}
                  onClick={() => setTier(t.key)}
                  className={cn(
                    'relative flex-1 flex flex-col items-start py-2 px-3 rounded-md border cursor-pointer overflow-hidden',
                  )}
                  style={{
                    borderColor: active ? colors.text : colors.border,
                    boxShadow: active ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                    transition: active
                      ? 'border-color 0.25s ease 0.08s, box-shadow 0.3s ease 0.1s'
                      : 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.borderColor = colors.borderHover;
                      e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.08)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.borderColor = colors.border;
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {/* ── Black fill — slides in/out within this pill, waves through middle ── */}
                  <div
                    key={isPassThrough ? tierAnimKey : undefined}
                    className="absolute inset-0 rounded-[5px] pointer-events-none"
                    style={fillStyle}
                  />
                  <span className="relative" style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: 0.5,
                    color: active ? '#fff' : colors.text,
                    transition: textTransition,
                    zIndex: 1,
                  }}>
                    {t.name}
                  </span>
                  <span className="relative" style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-sans)',
                    color: active ? 'rgba(255,255,255,0.6)' : colors.textDim,
                    marginTop: 1,
                    transition: textTransition,
                    whiteSpace: 'nowrap',
                    zIndex: 1,
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
          'transition-[border-color,background-color,box-shadow,transform] duration-300 ease-in-out',
        )}
        style={{
          animation: 'qsFadeUp 0.6s ease 0.8s both',
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: '1.5px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 8px rgba(0,0,0,0.03)',
        }}
        onClick={onGuidedFlow}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = colors.borderHover;
          e.currentTarget.style.backgroundColor = colors.bgCard;
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08), 0 1px 6px rgba(0,0,0,0.04)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          const arrow = e.currentTarget.querySelector('.arrow-nudge') as HTMLElement;
          if (arrow) arrow.style.transform = 'translateX(3px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.7)';
          e.currentTarget.style.boxShadow = '0 1px 8px rgba(0,0,0,0.03)';
          e.currentTarget.style.transform = 'none';
          const arrow = e.currentTarget.querySelector('.arrow-nudge') as HTMLElement;
          if (arrow) arrow.style.transform = 'none';
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
            Hand-picked team selection. The complete Lavern experience.
          </p>
        </div>
        <div className="shrink-0 w-12 h-12 rounded-full border-[1.5px] border-border flex items-center justify-center transition-[border-color] duration-300 ease-in-out">
          <span className="arrow-nudge text-xl text-text-muted" style={{ transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>{'\u2192'}</span>
        </div>
      </div>

      {/* ── The Lavern Challenge ─────────────────────── */}
      {onChallenge && (
        <div
          className={cn(
            'relative z-2 w-full max-w-[680px] mx-4 sm:mx-auto mt-4 box-border',
            'flex flex-col sm:flex-row items-start sm:items-center gap-6',
            'p-5 sm:p-6 lg:px-8 lg:py-7',
            'rounded-xl cursor-pointer',
            'transition-[border-color,background-color,box-shadow,transform] duration-300 ease-in-out',
          )}
          style={{
            animation: 'qsFadeUp 0.6s ease 1s both',
            backgroundColor: 'rgba(10, 10, 15, 0.85)',
            border: '1.5px solid rgba(184, 150, 11, 0.2)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          }}
          onClick={onChallenge}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(184, 150, 11, 0.5)';
            e.currentTarget.style.backgroundColor = 'rgba(10, 10, 15, 0.95)';
            e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.25), 0 0 20px rgba(184, 150, 11, 0.08)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            const arrow = e.currentTarget.querySelector('.arrow-nudge') as HTMLElement;
            if (arrow) arrow.style.transform = 'translateX(3px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(184, 150, 11, 0.2)';
            e.currentTarget.style.backgroundColor = 'rgba(10, 10, 15, 0.85)';
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
            e.currentTarget.style.transform = 'none';
            const arrow = e.currentTarget.querySelector('.arrow-nudge') as HTMLElement;
            if (arrow) arrow.style.transform = 'none';
          }}
        >
          <div className="flex-1">
            <h3
              className="text-[22px] font-light m-0 tracking-tight"
              style={{ fontFamily: fonts.serif, color: '#B8960B' }}
            >
              The Lavern Challenge
            </h3>
            <p
              className="text-[13px] mt-2 leading-relaxed tracking-[0.15px]"
              style={{ fontFamily: fonts.sans, color: 'rgba(250, 249, 246, 0.7)' }}
            >
              We will beat your lawyer. Upload any document. Blind judge.
              If yours wins, it's free.
            </p>
          </div>
          <div
            className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-[border-color] duration-300 ease-in-out"
            style={{ border: '1.5px solid rgba(184, 150, 11, 0.3)' }}
          >
            <span className="arrow-nudge text-xl" style={{ color: '#B8960B', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>{'\u2192'}</span>
          </div>
        </div>
      )}


      {/* ── Footer ───────────────────────────────────────── */}
      <div
        className="relative z-2 mt-auto pt-16 pb-8 text-center flex flex-col items-center gap-4"
        style={{ animation: 'qsFadeIn 0.4s ease 1s both' }}
      >
        <LavernIlluminated
          color={colors.textDim}
          glow="rgba(150, 135, 95, 0.4)"
          style={{ fontSize: 9, letterSpacing: 4 }}
        />
      </div>

    </div>
  );
}
