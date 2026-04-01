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

import { useState, useCallback, useRef, useEffect } from 'react';
import { BriefingHeader } from './components/BriefingHeader.js';
import { DocumentDropZone } from './components/DocumentDropZone.js';
import { DocumentList } from './components/DocumentList.js';
import { TemplatePicker } from './components/TemplatePicker.js';
import { BriefingChat } from './components/BriefingChat.js';
import { ConversationalChat } from './components/ConversationalChat.js';
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
import { colors } from '../staffing/styles/tokens.js';
import { cn } from '../utils/cn.js';

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
    interview,
    useLLMMode,
  } = useBriefingState(workflowId, interviewerId);

  // LLM interview mode: active when interviewer is selected and first call didn't fail
  const showConversationalChat = useLLMMode && !interview.fallbackToStatic;

  // ── Unsaved changes warning ───────────────────────────────────────
  // Warn if user has documents or interview progress and tries to leave
  const hasUnsavedWork = upload.documents.length > 0
    || interview.messages.length > 0
    || phase !== 'documents';

  useEffect(() => {
    if (!hasUnsavedWork) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show a generic message; returnValue triggers the dialog
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork]);

  const handleContinueToStaffing = useCallback(() => {
    const payload = buildPayload();
    onComplete(payload);
  }, [buildPayload, onComplete]);

  // Handle LLM interview finalization → generate structured brief → proceed
  const handleInterviewFinalize = useCallback(async () => {
    await interview.finalizeInterview();
    // The interviewResult will be set asynchronously — we handle it in an effect below
  }, [interview]);

  // When interviewResult arrives, inject it into the analysis pipeline and advance
  const interviewResultHandled = useRef(false);

  useEffect(() => {
    const result = interview.interviewResult;
    if (result && !interviewResultHandled.current) {
      interviewResultHandled.current = true;
      analysis.setFromInterviewResult(result);
      // Skip follow-ups if sufficiency is strong, otherwise show them
      if (result.sufficiency.verdict === 'strong' || result.followUpQuestions.length === 0) {
        setPhase('instructions');
      } else {
        setPhase('followups');
      }
    }
  }, [interview.interviewResult, analysis, setPhase]);

  // Reset interview refs when user navigates back to earlier phases
  const interviewStarted = useRef(false);
  // Stable ref for interview to avoid infinite loop from object reference in deps
  const interviewRef = useRef(interview);
  interviewRef.current = interview;

  useEffect(() => {
    if (phase === 'documents' || phase === 'interviewer') {
      interviewResultHandled.current = false;
      interviewStarted.current = false;
    }
  }, [phase]);

  useEffect(() => {
    const iv = interviewRef.current;
    if (
      phase === 'questions' &&
      useLLMMode &&
      !iv.fallbackToStatic &&
      iv.messages.length === 0 &&
      !iv.isStreaming &&
      !interviewStarted.current
    ) {
      interviewStarted.current = true;
      iv.startInterview();
    }
  }, [phase, useLLMMode]);

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
    <div className="briefing-scroll w-full min-h-screen bg-bg text-text font-sans px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8 lg:py-12 max-w-[800px] mx-auto relative">
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
        <div className="flex flex-wrap gap-2 mb-5">
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
      <div className={cn(
        'mb-6 transition-[background-color,color,border-color] duration-300',
        phase === 'documents' ? 'opacity-100' : 'opacity-50 pb-2 border-b border-border mb-5',
      )}>
        <div className="text-xs font-sans font-medium text-text-muted uppercase tracking-[0.5px] mb-4">
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

            {upload.documents.length === 0 && (
              <TemplatePicker onSelect={(content, name) => {
                upload.addTextDocument(`${name}.md`, content);
              }} />
            )}

            <DocumentList
              documents={upload.documents}
              parsedDocuments={upload.parsedDocuments}
              onRemove={upload.removeDocument}
            />

            {upload.error && (
              <div className="text-xs font-sans text-danger mt-2">{upload.error}</div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 mt-5">
              <span className="text-xs font-sans text-text-dim italic">
                {upload.documents.length === 0
                  ? 'You can skip this step if you have no documents to upload.'
                  : ''}
              </span>
              <button
                onClick={advanceToInterviewer}
                className="px-10 py-3.5 rounded-full border-2 border-text bg-text text-white font-sans text-[11px] font-semibold tracking-[3px] uppercase cursor-pointer transition-[background-color,color,border-color] duration-250 w-full sm:w-auto text-center"
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
        <div className="mb-6">
          <InterviewerPicker
            onSelect={(id) => {
              handleSelectInterviewer(id);
              advanceToQuestions();
            }}
            onSkip={advanceToQuestions}
          />
        </div>
      )}

      {/* Phase 3: Questions (Conversational LLM or Static) */}
      {(phase === 'questions' || isPostQuestions) && (
        <div data-phase="questions" className={cn(
          'mb-6 transition-[background-color,color,border-color] duration-300',
          phase === 'questions' ? 'opacity-100' : 'opacity-50 pb-2 border-b border-border mb-5',
        )}>
          <div className="text-xs font-sans font-medium text-text-muted uppercase tracking-[0.5px] mb-4">
            {phase === 'questions'
              ? (showConversationalChat ? 'Interview in progress' : 'Tell us about the matter')
              : (showConversationalChat ? 'Interview complete' : 'Questions answered')}
          </div>

          {phase === 'questions' && useLLMMode && interview.fallbackToStatic && (
            <div className="text-xs font-sans rounded-sm px-3 py-2 mb-4"
              style={{
                color: colors.textMuted,
                backgroundColor: 'rgba(26, 26, 26, 0.03)',
                border: '1px solid rgba(26, 26, 26, 0.08)',
              }}>
              Live interviews require an API connection. Using guided questions instead.
            </div>
          )}

          {phase === 'questions' && showConversationalChat && (
            <ConversationalChat
              messages={interview.messages}
              isStreaming={interview.isStreaming}
              turnCount={interview.turnCount}
              maxTurns={interview.maxTurns}
              error={interview.error}
              onSendAnswer={interview.sendAnswer}
              onFinalize={handleInterviewFinalize}
              interviewerAvatar={interviewerPortrait}
              interviewerName={interviewerId ? getInterviewer(interviewerId)?.name : undefined}
            />
          )}

          {phase === 'questions' && !showConversationalChat && (
            <BriefingChat
              questions={qna.visibleQuestions}
              answers={qna.answers}
              acknowledgments={qna.acknowledgments}
              onAnswer={qna.setAnswer}
              requiredComplete={qna.requiredComplete}
              onGenerate={advanceToFollowups}
              interviewerAvatar={interviewerPortrait}
              isAnalyzing={analysis.isAnalyzing}
            />
          )}
        </div>
      )}

      {/* Analyzing spinner — between questions and followups */}
      {analysis.isAnalyzing && phase !== 'brief' && (
        <div className="flex items-center justify-center gap-2.5 p-6">
          <div className="w-2 h-2 rounded-full bg-accent" style={{ animation: 'pulse 1.2s ease-in-out infinite' }} />
          <span className="text-sm font-serif italic text-text-secondary">Analyzing your intake...</span>
        </div>
      )}

      {/* Phase 4: Follow-ups (after LLM analysis) */}
      {phase === 'followups' && !analysis.isAnalyzing && analysis.sufficiency && (
        <div className="mb-6">
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
        <div className="mb-6">
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
        <div className="mb-6">
          <ConfidenceSignal
            message={
              analysis.sufficiency
                ? `Context sufficiency: ${analysis.sufficiency.score}% — ${analysis.sufficiency.verdict}.`
                : `Your briefing covers ${Math.min(breakdown.total, 100)}% of the context needed for this workflow.`
            }
          />
          <div className="h-3" />
          <BriefingMemo
            memoText={memoText}
            onMemoChange={setMemoText}
            onCommence={handleContinueToStaffing}
            engagementBrief={analysis.engagementBrief}
            sufficiency={analysis.sufficiency}
          />
        </div>
      )}

      {/* Analysis error banner — hide once we're already on the brief phase */}
      {analysis.analysisError && phase !== 'brief' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 px-4 py-2.5 rounded-md bg-accent-light border border-danger text-xs font-sans text-danger mt-4">
          <span className="text-sm shrink-0">{'\u26A0'}</span>
          <span>Analysis unavailable: {analysis.analysisError}. Using mechanical brief as fallback.</span>
          <div className="flex gap-2 sm:ml-auto shrink-0 w-full sm:w-auto">
            <button
              onClick={() => { analysis.reanalyze(); }}
              disabled={analysis.isAnalyzing}
              className="flex-1 sm:flex-none px-3 py-1 rounded-sm border border-text bg-text text-white font-sans text-[11px] font-semibold cursor-pointer whitespace-nowrap text-center disabled:opacity-40"
            >
              Try Again
            </button>
            <button
              onClick={advanceToMemo}
              className="flex-1 sm:flex-none px-3 py-1 rounded-sm border border-danger bg-transparent text-danger font-sans text-[11px] font-semibold cursor-pointer whitespace-nowrap text-center"
            >
              Use Fallback Brief
            </button>
          </div>
        </div>
      )}

      {/* Bottom spacer */}
      <div className="h-20" />
    </div>
  );
}

