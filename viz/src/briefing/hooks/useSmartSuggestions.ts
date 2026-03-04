/**
 * useSmartSuggestions — Pattern-matches briefing state for contextual suggestions.
 *
 * Returns an array of suggestion chips that help the user strengthen their briefing.
 * Each suggestion targets a specific aspect of the context (documents, answers, scope).
 */

import { useMemo } from 'react';
import type { BriefingQuestion } from '../data/questions.js';
import type { UploadedDocument } from './useDocumentUpload.js';

export interface Suggestion {
  id: string;
  label: string;
  description: string;
  action: 'focus-question' | 'add-document' | 'add-context';
  targetQuestionId?: string;
  autoText?: string;
}

export function useSmartSuggestions(
  workflowId: string,
  documents: UploadedDocument[],
  questions: BriefingQuestion[],
  answers: Record<string, string>,
  contextScore: number,
): Suggestion[] {
  return useMemo(() => {
    const suggestions: Suggestion[] = [];

    // ── Document suggestions ──────────────────────────────────────────
    if (documents.length === 0) {
      if (workflowId === 'review'
        || workflowId === 'roundtable' || workflowId === 'legal-design') {
        suggestions.push({
          id: 'upload-document',
          label: 'Upload your document',
          description: 'Upload the document for deeper analysis',
          action: 'add-document',
        });
      } else if (contextScore < 50) {
        suggestions.push({
          id: 'add-doc-generic',
          label: 'Add a document',
          description: 'Add a document to strengthen the briefing',
          action: 'add-document',
        });
      }
    }

    // ── Answer-based suggestions ──────────────────────────────────────

    // Jurisdiction-specific hints
    const jurisdictionAnswer = answers['constraints'] ?? answers['jurisdiction'] ?? '';
    if (/california|CA/i.test(jurisdictionAnswer)) {
      const hasPrivacyContext = Object.values(answers).some(a => /ccpa|cpra|privacy/i.test(a));
      if (!hasPrivacyContext) {
        suggestions.push({
          id: 'ccpa-context',
          label: 'Add CCPA context?',
          description: 'California triggers CCPA/CPRA requirements \u2014 mention relevant privacy obligations',
          action: 'focus-question',
          targetQuestionId: 'constraints',
          autoText: 'Subject to CCPA/CPRA privacy requirements. ',
        });
      }
    }

    if (/eu|european|gdpr/i.test(jurisdictionAnswer)) {
      const hasGdprContext = Object.values(answers).some(a => /gdpr|data.protection/i.test(a));
      if (!hasGdprContext) {
        suggestions.push({
          id: 'gdpr-context',
          label: 'Add GDPR context?',
          description: 'EU jurisdiction requires GDPR compliance consideration',
          action: 'focus-question',
          targetQuestionId: 'constraints',
          autoText: 'Must comply with GDPR data protection requirements. ',
        });
      }
    }

    // Audience-specific suggestions for document review
    if (workflowId === 'roundtable' || workflowId === 'legal-design') {
      const audience = answers['audience'] ?? '';
      if (/consumer|customer|public/i.test(audience) && !answers['pain-points']?.trim()) {
        suggestions.push({
          id: 'consumer-pain',
          label: 'Common document issues?',
          description: 'Consumer-facing docs often have jargon and clarity issues — mention specifics',
          action: 'focus-question',
          targetQuestionId: 'pain-points',
        });
      }
    }

    // Low context score generic suggestion
    if (contextScore < 50 && contextScore > 0) {
      const unanswered = questions.filter(
        q => !q.required && !(answers[q.id] ?? '').trim(),
      );
      if (unanswered.length > 0) {
        suggestions.push({
          id: 'answer-optional',
          label: 'Answer optional questions',
          description: `${unanswered.length} optional question${unanswered.length > 1 ? 's' : ''} could strengthen your briefing`,
          action: 'focus-question',
          targetQuestionId: unanswered[0].id,
        });
      }
    }

    // Depth suggestion: encourage longer answers
    const shortAnswers = questions.filter(q => {
      const a = (answers[q.id] ?? '').trim();
      return a.length > 0 && a.split(/\s+/).length < 5 && q.multiline;
    });
    if (shortAnswers.length > 0 && contextScore < 75) {
      suggestions.push({
        id: 'expand-answers',
        label: 'Add more detail',
        description: `${shortAnswers.length} answer${shortAnswers.length > 1 ? 's are' : ' is'} quite brief \u2014 more detail helps agents work`,
        action: 'focus-question',
        targetQuestionId: shortAnswers[0].id,
      });
    }

    // Limit to 3 suggestions max
    return suggestions.slice(0, 3);
  }, [workflowId, documents, questions, answers, contextScore]);
}
