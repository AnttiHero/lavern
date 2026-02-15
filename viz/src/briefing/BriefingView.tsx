/**
 * BriefingView — "Brief the Matter" screen.
 *
 * Four-phase context capture: Documents → Interviewer → Questions → Memo.
 * Reads matter data from sessionStorage (set by IntakeView).
 * Comes BEFORE staffing — no team data needed.
 */

import { useState, useCallback, useRef } from 'react';
import { BriefingHeader } from './components/BriefingHeader.js';
import { DocumentDropZone } from './components/DocumentDropZone.js';
import { DocumentList } from './components/DocumentList.js';
import { BriefingChat } from './components/BriefingChat.js';
import { BriefingMemo } from './components/BriefingMemo.js';
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
  'contract_review': 'contract-review',
  'legal_research': 'research-memo',
  'document_redesign': 'legal-design',
  'legal_question': 'simple-query',
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
  const workflowId = MATTER_TYPE_TO_WORKFLOW[matterInfo.matterType ?? ''] ?? 'simple-query';

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
    memoText,
    setMemoText,
    advanceToInterviewer,
    advanceToQuestions,
    advanceToMemo,
    buildPayload,
    upload,
    qna,
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
      // Focus the document drop zone / open file picker
      upload.openFilePicker();
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
      // Scroll to the target question
      setTimeout(() => {
        const el = questionRefs.current.get(suggestion.targetQuestionId!);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [phase, advanceToQuestions, upload, qna]);

  // URL import handler — adds fetched content as a document
  const handleUrlImport = useCallback((name: string, content: string, size: number) => {
    // We need to add to documents directly via the upload state
    // Since useDocumentUpload manages its own state, we'll use a workaround
    // by creating a synthetic file and processing it
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], `${name}.txt`, { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Trigger the file input handler via a synthetic event
    if (upload.inputRef.current) {
      upload.inputRef.current.files = dataTransfer.files;
      upload.inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [upload]);

  return (
    <div style={styles.container}>
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

      {/* Smart suggestion chips */}
      {suggestions.length > 0 && (
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
      {(phase === 'questions' || phase === 'memo') && (
        <div style={{
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
              onGenerate={advanceToMemo}
              interviewerAvatar={interviewerPortrait}
            />
          )}
        </div>
      )}

      {/* Phase 4: Memo */}
      {phase === 'memo' && (
        <div style={{ ...styles.phaseSection, ...styles.phaseActive }}>
          <ConfidenceSignal
            message={`Your briefing covers ${Math.min(breakdown.total, 100)}% of the context needed for this workflow.`}
          />
          <div style={{ height: 12 }} />
          <BriefingMemo
            memoText={memoText}
            onMemoChange={setMemoText}
            onCommence={handleContinueToStaffing}
          />
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 80 }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100vh',
    overflow: 'auto',
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
};
