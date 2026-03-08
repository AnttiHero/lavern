/**
 * ChatMessage — Individual Q&A pair: question + answer input.
 */

import { ContextImpactLabel } from './ContextImpactLabel.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import type { BriefingQuestion } from '../data/questions.js';

interface Props {
  question: BriefingQuestion;
  answer: string;
  onChange: (value: string) => void;
}

export function ChatMessage({ question, answer, onChange }: Props) {
  const hasAnswer = answer.trim().length > 0;

  return (
    <div style={styles.container}>
      {/* Question with accent bar */}
      <div style={styles.questionRow}>
        <div style={styles.accentBar} />
        <div style={styles.questionContent}>
          <div style={styles.questionText}>
            {question.text}
            {question.required && <span style={styles.required}> *</span>}
          </div>
          {question.hint && (
            <div style={styles.hint}>{question.hint}</div>
          )}
        </div>
      </div>

      {/* Answer input */}
      {question.multiline ? (
        <textarea
          value={answer}
          onChange={e => onChange(e.target.value)}
          placeholder="Your answer..."
          style={styles.textarea}
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={answer}
          onChange={e => onChange(e.target.value)}
          placeholder="Your answer..."
          style={styles.input}
        />
      )}

      {/* Impact note — explains why this answer matters */}
      {question.impactNote && (
        <ContextImpactLabel
          note={question.impactNote}
          hasAnswer={hasAnswer}
        />
      )}
    </div>
  );
}

const inputBase: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box' as const,
  backgroundColor: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  color: colors.text,
  fontFamily: fonts.sans,
  fontSize: 14,
  padding: '10px 14px',
  transition: 'border-color 0.15s ease',
  marginTop: 8,
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 20,
  },
  questionRow: {
    display: 'flex',
    gap: 12,
  },
  accentBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    flexShrink: 0,
    marginTop: 2,
    marginBottom: 2,
  },
  questionContent: {
    flex: 1,
  },
  questionText: {
    fontSize: 17,
    fontFamily: fonts.serif,
    fontWeight: 500,
    color: colors.text,
    lineHeight: 1.3,
  },
  required: {
    color: colors.accent,
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    marginTop: 3,
    lineHeight: 1.4,
  },
  textarea: {
    ...inputBase,
    resize: 'vertical' as const,
    minHeight: 60,
    lineHeight: 1.5,
  },
  input: {
    ...inputBase,
  },
};
