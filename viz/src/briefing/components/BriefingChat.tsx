/**
 * BriefingChat — Progressive Q&A form with acknowledgment responses.
 *
 * Questions are revealed one at a time with active listening responses
 * between them, mimicking a top-firm partner conducting an intake meeting.
 */

import { ChatMessage } from './ChatMessage.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import type { BriefingQuestion } from '../data/questions.js';

interface Props {
  questions: BriefingQuestion[];
  answers: Record<string, string>;
  acknowledgments?: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  requiredComplete: boolean;
  onGenerate: () => void;
  /** SVG portrait string for the interviewer avatar (optional) */
  interviewerAvatar?: string;
}

export function BriefingChat({
  questions,
  answers,
  acknowledgments,
  onAnswer,
  requiredComplete,
  onGenerate,
  interviewerAvatar,
}: Props) {
  return (
    <div style={styles.container}>
      {questions.map((q, i) => {
        const answer = answers[q.id] ?? '';
        const hasAnswer = answer.trim().length > 0;
        const ack = acknowledgments?.[q.id];
        const isLastQuestion = i === questions.length - 1;

        return (
          <div key={q.id}>
            <div style={interviewerAvatar ? styles.questionRow : undefined}>
              {/* Avatar beside each question (if interviewer selected) */}
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

            {/* Active listening response — shown after answering, before next question */}
            {hasAnswer && ack && !isLastQuestion && (
              <div style={{
                ...styles.acknowledgment,
                ...(interviewerAvatar ? { marginLeft: 44 } : {}),
              }}>
                <div style={styles.ackDot} />
                <span style={styles.ackText}>{ack}</span>
              </div>
            )}
          </div>
        );
      })}

      <div style={styles.footer}>
        <button
          onClick={onGenerate}
          disabled={!requiredComplete}
          style={{
            ...styles.generateBtn,
            backgroundColor: requiredComplete ? colors.text : colors.bgPanel,
            color: requiredComplete ? '#fff' : colors.textDim,
            cursor: requiredComplete ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={e => { if (requiredComplete) { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; } }}
          onMouseLeave={e => { if (requiredComplete) { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; } }}
        >
          Generate Briefing {'\u2192'}
        </button>
      </div>
    </div>
  );
}

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
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
};
