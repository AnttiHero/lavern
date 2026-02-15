/**
 * useBriefingQuestions — Workflow-specific question management with progressive disclosure.
 *
 * Questions are revealed one at a time:
 * 1. First required question is always visible
 * 2. Each subsequent required question appears after the previous is answered
 * 3. Optional questions appear collapsed after all required questions are answered
 * 4. An acknowledgment template is shown between questions to create a conversational feel
 */

import { useState, useCallback, useMemo } from 'react';
import { WORKFLOW_QUESTIONS } from '../data/questions.js';
import type { BriefingQuestion } from '../data/questions.js';
import { getInterviewer } from '../data/interviewers.js';

/** Template for acknowledging an answer before showing the next question. */
const ACKNOWLEDGE_TEMPLATES: Record<string, (answer: string) => string> = {
  'matter-description': (a) => `Got it \u2014 we'll focus our analysis on this specific context.`,
  'audience': (a) => `${a.split(/[,;]/)[0]?.trim() || 'That audience'} \u2014 we'll calibrate readability and tone accordingly.`,
  'contract-type': (a) => `${a.trim()} \u2014 activating the right review templates.`,
  'party-position': () => `Understanding your position shapes how we approach every clause.`,
  'research-question': () => `Clear question framed. This will focus the research precisely.`,
  'jurisdiction': (a) => `${a.trim()} \u2014 we'll focus on the right legal authorities.`,
  'question': () => `Understood. Our agents will analyze this from multiple angles.`,
  'client-name': () => `Noted. We'll run the standard pre-engagement checks.`,
  'matter-type': (a) => `${a.trim()} matter \u2014 selecting the appropriate workflow.`,
};

function getAcknowledgment(
  questionId: string,
  answer: string,
  interviewerId?: string,
): string | null {
  // Use persona-specific templates if an interviewer is selected
  if (interviewerId) {
    const persona = getInterviewer(interviewerId);
    if (persona) {
      const template = persona.acknowledgments[questionId] ?? persona.acknowledgments['default'];
      if (template && answer.trim()) return template(answer);
    }
  }

  // Fallback to generic templates
  const template = ACKNOWLEDGE_TEMPLATES[questionId];
  if (template && answer.trim()) {
    return template(answer);
  }
  return null;
}

export function useBriefingQuestions(workflowId: string, interviewerId?: string) {
  const questions = useMemo(() => {
    return WORKFLOW_QUESTIONS[workflowId] ?? WORKFLOW_QUESTIONS['default'];
  }, [workflowId]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showOptional, setShowOptional] = useState(false);

  const setAnswer = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const requiredComplete = useMemo(() => {
    return questions
      .filter(q => q.required)
      .every(q => (answers[q.id] ?? '').trim().length > 0);
  }, [questions, answers]);

  // Progressive disclosure: compute visible questions
  const visibleQuestions = useMemo(() => {
    const required = questions.filter(q => q.required);
    const optional = questions.filter(q => !q.required);

    // Show required questions progressively
    const visibleRequired: BriefingQuestion[] = [];
    for (const q of required) {
      visibleRequired.push(q);
      // Stop at the first unanswered required question
      if (!(answers[q.id] ?? '').trim()) break;
    }

    // Show optional questions only after all required are answered
    const visibleOptional = requiredComplete ? optional : [];

    return [...visibleRequired, ...visibleOptional];
  }, [questions, answers, requiredComplete]);

  // Acknowledgments for answered questions
  const acknowledgments = useMemo(() => {
    const acks: Record<string, string> = {};
    for (const q of questions) {
      const answer = answers[q.id] ?? '';
      const ack = getAcknowledgment(q.id, answer, interviewerId);
      if (ack) acks[q.id] = ack;
    }
    return acks;
  }, [questions, answers, interviewerId]);

  return {
    questions,
    visibleQuestions,
    answers,
    setAnswer,
    requiredComplete,
    acknowledgments,
    showOptional,
    setShowOptional,
  };
}
