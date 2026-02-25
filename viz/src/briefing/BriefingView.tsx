/**
 * BriefingView — "Brief the Matter" screen.
 *
 * Six-phase context capture:
 *   Documents → Interviewer → Questions → Follow-ups → Instructions → Brief
 *
 * After static questions, an LLM analyzes sufficiency and generates
 * targeted follow-up questions + a structured engagement brief.
 *
 * Reads matter data from sessionStorage (set by IntakeView).
 * Comes BEFORE staffing — no team data needed.
 */

import { useState, useCallback, useRef } from 'react';
import { BriefingHeader } from './components/BriefingHeader.js';
import { DocumentDropZone } from './components/DocumentDropZone.js';
import { DocumentList } from './components/DocumentList.js';
import { BriefingChat } from './components/BriefingChat.js';
import { BriefingMemo } from './components/BriefingMemo.js';
import { FollowUpSection } from './components/FollowUpSection.js';
import { FinalInstructions } from './components/FinalInstructions.js';
import { ContextMeter } from './components/ContextMeter.js';
import { SuggestionChip } from './components/SuggestionChip.js';
import { UrlImportField } from './components/UrlImportField.js';
import { InterviewerPicker } from './components/InterviewerPicker.js';
import { ConfidenceSignal } from '../shared/ConfidenceSignal.js';
import { useBriefingState, type BriefingPayload } from './hooks/useBriefingState.js';
import { useContextScore } from './hooks/useContextScore.js';
import { useSmartSuggestions, type Suggestion } from './hooks/useSmartSuggestions.js';
import { getInterviewer } from './data/interviewers.js';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface Props {
  onComplete: (payload: BriefingPayload) => void;
  onBack: () => void;
  onSkip?: () => void;
}

// Map API matter types to workflow IDs
const MATTER_TYPE_TO_WORKFLOW: Record<string, string> = {
  'contract_review': 'review',
  'legal_research': 'adversarial',
  'document_redesign': 'roundtable',
  'legal_question': 'counsel',
  'general': 'pre-engagement',
};

interface MatterInfo {
  matterNumber?: string;
  matterTitle?: string;
  matterType?: string;
  jurisdiction?: string;
  clientName?: string;
}

export default function BriefingView({ onComplete, onBack, onSkip }: Props) {
  // Read matter data from sessionStorage (set by IntakeView)
  const [matterInfo] = useState<MatterInfo>(() => {
    try {
      const stored = sessionStorage.getItem('shem-matter-data');
      if (stored) {
        const data = JSON.parse(stored);
        return {
          matterNumber: data.matterNumber,
          matterTitle: data.matterTitle ?? data.response?.title,
          matterType: data.matterType ?? data.response?.matterType,
          jurisdiction: data.jurisdiction ?? data.response?.jurisdiction,
          clientName: data.clientName ?? data.response?.clientName,
        };
      }
      return {};
    } catch {
      return {};
    }
  });

  // Derive workflowId from matter type
  const workflowId = MATTER_TYPE_TO_WORKFLOW[matterInfo.matterType ?? ''] ?? 'counsel';

  // Interviewer persona state (persisted to sessionStorage)
  const [interviewerId, setInterviewerId] = useState<string | undefined>(() => {
    try {
      return sessionStorage.getItem('shem-interviewer') ?? undefined;
    } catch { return undefined; }
  });

  const handleSelectInterviewer = useCallback((id: string) => {
    setInterviewerId(id);
    try { sessionStorage.setItem('shem-interviewer', id); } catch { /* ignore */ }
  }, []);

  const interviewerPortrait = interviewerId
    ? getInterviewer(interviewerId)?.portrait
    : undefined;

  const {
    phase,
    setPhase,
    memoText,
    setMemoText,
    advanceToInterviewer,
    advanceToQuestions,
    advanceToFollowups,
    advanceToInstructions,
    advanceToBrief,
    advanceToMemo,
    buildPayload,
    upload,
    qna,
    analysis,
  } = useBriefingState(workflowId, interviewerId);

  const handleContinueToStaffing = useCallback(() => {
    const payload = buildPayload();
    onComplete(payload);
  }, [buildPayload, onComplete]);

  // Context completeness scoring
  const { breakdown, milestones, newMilestone } = useContextScore(
    upload.documents,
    qna.questions,
    qna.answers,
  );

  // Smart suggestion chips
  const suggestions = useSmartSuggestions(
    workflowId,
    upload.documents,
    qna.questions,
    qna.answers,
    breakdown.total,
  );

  // Ref map for scrolling to questions
  const questionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleSuggestionActivate = useCallback((suggestion: Suggestion) => {
    if (suggestion.action === 'add-document') {
      // Navigate back to documents phase where the upload zone + file input live
      if (phase !== 'documents') {
        setPhase('documents');
      } else {
        upload.openFilePicker();
      }
    } else if (suggestion.action === 'focus-question' && suggestion.targetQuestionId) {
      // If in earlier phases, advance to questions
      if (phase === 'documents' || phase === 'interviewer') {
        advanceToQuestions();
      }
      // Prepend auto-text if provided
      if (suggestion.autoText && suggestion.targetQuestionId) {
        const currentAnswer = qna.answers[suggestion.targetQuestionId] ?? '';
        if (!currentAnswer.includes(suggestion.autoText)) {
          qna.setAnswer(suggestion.targetQuestionId, suggestion.autoText + currentAnswer);
        }
      }
      // Scroll to the questions area (questionRefs map isn't wired to DOM)
      setTimeout(() => {
        const questionsEl = document.querySelector('[data-phase="questions"]');
        if (questionsEl) {
          questionsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      }, 200);
    }
  }, [phase, setPhase, advanceToQuestions, upload, qna]);

  // URL import handler — adds fetched content as a document
  const handleUrlImport = useCallback((name: string, content: string, _size: number) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], `${name}.txt`, { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    if (upload.inputRef.current) {
      upload.inputRef.current.files = dataTransfer.files;
      upload.inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [upload]);

  // Determine if questions/followups should show collapsed
  const isPostQuestions = phase === 'followups' || phase === 'instructions' || phase === 'brief';

  return (
    <div className="briefing-scroll" style={styles.container}>
      <BriefingHeader
        matterNumber={matterInfo.matterNumber}
        matterTitle={matterInfo.matterTitle}
        workflowId={workflowId}
        jurisdiction={matterInfo.jurisdiction}
        phase={phase}
        onBack={onBack}
        onSkip={onSkip}
      />

      {/* Context Meter — visible throughout all briefing phases */}
      <ContextMeter
        breakdown={breakdown}
        milestones={milestones}
        newMilestone={newMilestone}
      />

      {/* Smart suggestion chips — only during early phases */}
      {suggestions.length > 0 && (phase === 'documents' || phase === 'questions') && (
        <div style={styles.suggestionsRow}>
          {suggestions.map(s => (
            <SuggestionChip
              key={s.id}
              suggestion={s}
              onActivate={handleSuggestionActivate}
            />
          ))}
        </div>
      )}

      {/* Phase 1: Documents */}
      <div style={{
        ...styles.phaseSection,
        ...(phase === 'documents' ? styles.phaseActive : styles.phaseCollapsed),
      }}>
        <div style={styles.phaseTitle}>
          {phase === 'documents' ? 'Upload relevant documents' : `${upload.documents.length} document${upload.documents.length !== 1 ? 's' : ''} attached`}
        </div>

        {phase === 'documents' && (
          <>
            <DocumentDropZone
              isDragOver={upload.isDragOver}
              inputRef={upload.inputRef}
              onDrop={upload.handleDrop}
              onDragOver={upload.handleDragOver}
              onDragLeave={upload.handleDragLeave}
              onClick={upload.openFilePicker}
              onFileInput={upload.handleFileInput}
            />

            <UrlImportField onImport={handleUrlImport} />

            <DocumentList
              documents={upload.documents}
              parsedDocuments={upload.parsedDocuments}
              onRemove={upload.removeDocument}
            />

            {upload.error && (
              <div style={styles.error}>{upload.error}</div>
            )}

            <div style={styles.continueRow}>
              <span style={styles.skipHint}>
                {upload.documents.length === 0
                  ? 'You can skip this step if you have no documents to upload.'
                  : ''}
              </span>
              <button
                onClick={advanceToInterviewer}
                style={styles.continueBtn}
                onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              >
                Continue {'\u2192'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Phase 2: Interviewer */}
      {phase === 'interviewer' && (
        <div style={{ ...styles.phaseSection, ...styles.phaseActive }}>
          <InterviewerPicker
            onSelect={(id) => {
              handleSelectInterviewer(id);
              advanceToQuestions();
            }}
            onSkip={advanceToQuestions}
          />
        </div>
      )}

      {/* Phase 3: Questions */}
      {(phase === 'questions' || isPostQuestions) && (
        <div data-phase="questions" style={{
          ...styles.phaseSection,
          ...(phase === 'questions' ? styles.phaseActive : styles.phaseCollapsed),
        }}>
          <div style={styles.phaseTitle}>
            {phase === 'questions' ? 'Tell us about the matter' : 'Questions answered'}
          </div>

          {phase === 'questions' && (
            <BriefingChat
              questions={qna.visibleQuestions}
              answers={qna.answers}
              acknowledgments={qna.acknowledgments}
              onAnswer={qna.setAnswer}
              requiredComplete={qna.requiredComplete}
              onGenerate={advanceToFollowups}
              interviewerAvatar={interviewerPortrait}
            />
          )}
        </div>
      )}

      {/* Analyzing spinner — between questions and followups */}
      {analysis.isAnalyzing && phase !== 'brief' && (
        <div style={styles.analyzingSection}>
          <div style={styles.analyzingDot} />
          <span style={styles.analyzingText}>Analyzing your intake...</span>
        </div>
      )}

      {/* Phase 4: Follow-ups (after LLM analysis) */}
      {phase === 'followups' && !analysis.isAnalyzing && analysis.sufficiency && (
        <div style={{ ...styles.phaseSection, ...styles.phaseActive }}>
          <FollowUpSection
            sufficiency={analysis.sufficiency}
            followUpQuestions={analysis.followUpQuestions}
            followUpAnswers={analysis.followUpAnswers}
            onSetAnswer={analysis.setFollowUpAnswer}
            onContinue={advanceToInstructions}
            onReanalyze={analysis.reanalyze}
            isAnalyzing={analysis.isAnalyzing}
            analysisRound={analysis.analysisRound}
            maxRounds={2}
          />
        </div>
      )}

      {/* Phase 5: Final Instructions */}
      {phase === 'instructions' && (
        <div style={{ ...styles.phaseSection, ...styles.phaseActive }}>
          <FinalInstructions
            value={analysis.finalInstructions}
            onChange={analysis.setFinalInstructions}
            onGenerate={advanceToBrief}
            isAnalyzing={analysis.isAnalyzing}
          />
        </div>
      )}

      {/* Phase 6: Engagement Brief */}
      {phase === 'brief' && (
        <div style={{ ...styles.phaseSection, ...styles.phaseActive }}>
          <ConfidenceSignal
            message={
              analysis.sufficiency
                ? `Context sufficiency: ${analysis.sufficiency.score}% — ${analysis.sufficiency.verdict}.`
                : `Your briefing covers ${Math.min(breakdown.total, 100)}% of the context needed for this workflow.`
            }
          />
          <div style={{ height: 12 }} />
          <BriefingMemo
            memoText={memoText}
            onMemoChange={setMemoText}
            onCommence={handleContinueToStaffing}
            engagementBrief={analysis.engagementBrief}
            sufficiency={analysis.sufficiency}
          />
        </div>
      )}

      {/* Analysis error banner */}
      {analysis.analysisError && (
        <div style={styles.errorBanner}>
          <span style={styles.errorBannerIcon}>{'\u26A0'}</span>
          <span>Analysis unavailable: {analysis.analysisError}. Using mechanical brief as fallback.</span>
          <button
            onClick={advanceToMemo}
            style={styles.errorFallbackBtn}
          >
            Use Fallback Brief
          </button>
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 80 }} />
    </div>
  );
}

// Hide scrollbar globally for briefing container
const BRIEFING_SCROLLBAR_ID = 'briefing-hide-scrollbar';
if (typeof document !== 'undefined' && !document.getElementById(BRIEFING_SCROLLBAR_ID)) {
  const s = document.createElement('style');
  s.id = BRIEFING_SCROLLBAR_ID;
  s.textContent = `.briefing-scroll::-webkit-scrollbar { display: none; }`;
  document.head.appendChild(s);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    maxWidth: 800,
    margin: '0 auto',
    position: 'relative',
  },
  phaseSection: {
    marginBottom: spacing.xl,
    transition: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease',
  },
  phaseActive: {
    opacity: 1,
  },
  phaseCollapsed: {
    opacity: 0.5,
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: spacing.lg,
  },
  phaseTitle: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  continueRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  skipHint: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
  },
  continueBtn: {
    padding: '12px 32px',
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
  suggestionsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: spacing.lg,
  },
  error: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    marginTop: 8,
  },
  analyzingSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: `${spacing.xl}px`,
  },
  analyzingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  analyzingText: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: radii.md,
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    border: `1px solid ${colors.danger}`,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    marginTop: spacing.md,
  },
  errorBannerIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  errorFallbackBtn: {
    marginLeft: 'auto',
    padding: '4px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.danger}`,
    backgroundColor: 'transparent',
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
};
