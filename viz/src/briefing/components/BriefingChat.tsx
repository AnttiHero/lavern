/**
 * BriefingChat — Progressive Q&A with thinking delays.
 *
 * Each new question pauses behind a "thinking" indicator (three animated dots)
 * before revealing — like a real interviewer considering the previous answer
 * before moving on. The first question gets a shorter delay; follow-ups
 * take 1.8–3 seconds to simulate genuine deliberation.
 */

import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import type { BriefingQuestion } from '../data/questions.js';

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  questions: BriefingQuestion[];
  answers: Record<string, string>;
  acknowledgments?: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  requiredComplete: boolean;
  onGenerate: () => void;
  /** SVG portrait string for the interviewer avatar (optional) */
  interviewerAvatar?: string;
  /** True while the LLM analysis is running (shows loading state on button). */
  isAnalyzing?: boolean;
}

export function BriefingChat({
  questions,
  answers,
  acknowledgments,
  onAnswer,
  requiredComplete,
  onGenerate,
  interviewerAvatar,
  isAnalyzing = false,
}: Props) {
  // Track which questions have been "revealed" (past thinking delay)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [thinkingForId, setThinkingForId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror of thinkingForId — guards against duplicate scheduling
  // without appearing in the dependency array (which would clear the timer).
  const thinkingRef = useRef<string | null>(null);

  // When a new question appears, show thinking dots → reveal after delay
  useEffect(() => {
    if (questions.length === 0) return;

    // Find the first unrevealed question
    const unrevealed = questions.find(q => !revealedIds.has(q.id));
    if (!unrevealed) return;
    if (thinkingRef.current === unrevealed.id) return; // already scheduled

    // Clear any stale timer from a previous question
    if (timerRef.current) clearTimeout(timerRef.current);

    // First question → shorter delay; subsequent → deliberation time
    const isFirst = revealedIds.size === 0;
    const delay = isFirst
      ? 800 + Math.random() * 400            // 0.8 – 1.2 s
      : 1800 + Math.random() * 1200;         // 1.8 – 3.0 s

    thinkingRef.current = unrevealed.id;
    setThinkingForId(unrevealed.id);

    timerRef.current = setTimeout(() => {
      setRevealedIds(prev => {
        const next = new Set(prev);
        next.add(unrevealed.id);
        return next;
      });
      thinkingRef.current = null;
      setThinkingForId(null);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      thinkingRef.current = null;
    };
  }, [questions, revealedIds]); // thinkingForId intentionally excluded — tracked via ref

  return (
    <div style={styles.container}>
      {questions.map((q, i) => {
        const answer = answers[q.id] ?? '';
        const hasAnswer = answer.trim().length > 0;
        const ack = acknowledgments?.[q.id];
        const isLastVisible = i === questions.length - 1;
        const isRevealed = revealedIds.has(q.id);
        const isThinking = thinkingForId === q.id;

        // ── Thinking state — three animated dots ─────────────────────
        if (!isRevealed) {
          if (isThinking) {
            return (
              <div key={q.id} style={styles.thinkingRow}>
                {interviewerAvatar && (
                  <div
                    style={styles.avatar}
                    dangerouslySetInnerHTML={{ __html: interviewerAvatar }}
                  />
                )}
                <div style={styles.thinkingBubble}>
                  <span style={{ ...styles.thinkingDot, animationDelay: '0s' }} />
                  <span style={{ ...styles.thinkingDot, animationDelay: '0.2s' }} />
                  <span style={{ ...styles.thinkingDot, animationDelay: '0.4s' }} />
                </div>
              </div>
            );
          }
          return null; // not yet in the pipeline
        }

        // ── Revealed question — slides in with fade ──────────────────
        return (
          <div
            key={q.id}
            style={{ animation: 'briefingReveal 0.45s ease both' }}
          >
            <div style={interviewerAvatar ? styles.questionRow : undefined}>
              {interviewerAvatar && (
                <div
                  style={styles.avatar}
                  dangerouslySetInnerHTML={{ __html: interviewerAvatar }}
                />
              )}
              <div style={styles.questionContent}>
                <ChatMessage
                  question={q}
                  answer={answer}
                  onChange={value => onAnswer(q.id, value)}
                />
              </div>
            </div>

            {/* Acknowledgment — fades in after user answers */}
            {hasAnswer && ack && !isLastVisible && (
              <div style={{
                ...styles.acknowledgment,
                ...(interviewerAvatar ? { marginLeft: 44 } : {}),
                animation: 'briefingAckFade 0.6s ease 0.3s both',
              }}>
                <div style={styles.ackDot} />
                <span style={styles.ackText}>{ack}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Generate button — hidden while interviewer is "thinking" */}
      {!thinkingForId && (
        <div style={styles.footer}>
          <button
            onClick={onGenerate}
            disabled={!requiredComplete || isAnalyzing}
            style={{
              ...styles.generateBtn,
              backgroundColor: isAnalyzing ? colors.bgPanel : (requiredComplete ? colors.text : colors.bgPanel),
              color: isAnalyzing ? colors.textSecondary : (requiredComplete ? '#fff' : colors.textDim),
              cursor: isAnalyzing ? 'wait' : (requiredComplete ? 'pointer' : 'not-allowed'),
            }}
            onMouseEnter={e => { if (requiredComplete && !isAnalyzing) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
            onMouseLeave={e => { if (requiredComplete && !isAnalyzing) { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; } }}
          >
            {isAnalyzing ? (
              <>
                <span style={{ ...styles.spinnerDot, border: `2px solid ${colors.border}`, borderTopColor: colors.text }} />
                Generating Briefing{'\u2026'}
              </>
            ) : 'Generate Briefing \u2192'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  questionRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    flexShrink: 0,
    marginTop: 4,
  },
  questionContent: {
    flex: 1,
    minWidth: 0,
  },

  // ── Thinking indicator ──────────────────────────────────────────────────
  thinkingRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 40,
  },
  thinkingBubble: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '10px 18px',
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
    borderRadius: 12,
    borderLeft: `3px solid ${colors.accent}`,
  },
  thinkingDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    animation: 'briefingThinkDot 1.4s ease-in-out infinite',
  },

  // ── Acknowledgment ──────────────────────────────────────────────────────
  acknowledgment: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 16px',
    marginBottom: 16,
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
    borderRadius: 8,
    borderLeft: `3px solid ${colors.accent}`,
  },
  ackDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    flexShrink: 0,
    marginTop: 6,
  },
  ackText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: 1.5,
    fontStyle: 'italic',
  },

  // ── Footer ──────────────────────────────────────────────────────────────
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  generateBtn: {
    padding: '10px 24px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  spinnerDot: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'briefingBtnSpin 0.8s linear infinite',
    flexShrink: 0,
  },
};
