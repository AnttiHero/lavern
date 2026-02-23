/**
 * useBriefingQuestions — Document-aware question management with progressive disclosure.
 *
 * Questions are now reactive to uploaded documents:
 * 1. Document sub-type is inferred from filenames + content (ToS, NDA, employment, etc.)
 * 2. Generic questions are replaced with document-specific variants
 * 3. Progressive disclosure: required → optional, one at a time
 * 4. Acknowledgment templates create a conversational feel
 *
 * The user should never see "Which party do you represent?" after uploading a
 * Terms of Service. They should see "Are you the service provider or reviewing
 * someone else's terms?"
 */

import { useState, useCallback, useMemo } from 'react';
import { WORKFLOW_QUESTIONS } from '../data/questions.js';
import type { BriefingQuestion } from '../data/questions.js';
import { getInterviewer } from '../data/interviewers.js';

// ── Document sub-type detection ───────────────────────────────────────────

type DocumentSubType =
  | 'tos' | 'privacy-policy' | 'nda' | 'employment'
  | 'lease' | 'saas' | 'vendor' | 'ip-license' | 'general';

function detectDocumentType(
  docs: Array<{ name: string; content: string }>,
): DocumentSubType {
  if (docs.length === 0) return 'general';

  // Combine filenames + first 3000 chars of content for detection
  const combined = docs
    .map(d => `${d.name} ${d.content.slice(0, 3000)}`)
    .join(' ')
    .toLowerCase();

  if (/terms\s+of\s+service|terms\s+and\s+conditions|\btos\b/.test(combined)) return 'tos';
  if (/privacy\s+policy|data\s+protection|gdpr|ccpa/.test(combined)) return 'privacy-policy';
  if (/non-disclosure|\bnda\b|confidential\s+information\s+agreement/.test(combined)) return 'nda';
  if (/employment\s+(agreement|contract)|offer\s+letter|at-will\s+employment/.test(combined)) return 'employment';
  if (/lease\s+agreement|rental\s+agreement|landlord.*tenant|tenant.*landlord/.test(combined)) return 'lease';
  if (/\bsaas\b|software\s+as\s+a\s+service|subscription\s+(agreement|terms)/.test(combined)) return 'saas';
  if (/vendor\s+agreement|procurement|supply\s+agreement|master\s+service/.test(combined)) return 'vendor';
  if (/license\s+agreement|intellectual\s+property|\bip\b\s+license|patent\s+license/.test(combined)) return 'ip-license';

  return 'general';
}

// ── Question overrides per document sub-type ──────────────────────────────

const DOC_OVERRIDES: Partial<Record<DocumentSubType, Record<string, { text: string; hint: string }>>> = {
  'tos': {
    'contract-type': {
      text: 'We see this is a Terms of Service.',
      hint: 'Consumer-facing product, enterprise platform, marketplace, or API service?',
    },
    'party-position': {
      text: 'Are you the service provider, or are you reviewing someone else\'s terms?',
      hint: 'This shapes whether we strengthen your protections or flag risks for your users.',
    },
  },
  'privacy-policy': {
    'contract-type': {
      text: 'This appears to be a Privacy Policy.',
      hint: 'For a website, mobile app, SaaS platform, or something else?',
    },
    'party-position': {
      text: 'Are you the data controller drafting this, or reviewing a third party\'s policy?',
      hint: 'We\'ll check GDPR/CCPA compliance from the appropriate angle.',
    },
  },
  'nda': {
    'contract-type': {
      text: 'This looks like a Non-Disclosure Agreement.',
      hint: 'Mutual or one-way? For a specific transaction, M&A, or ongoing relationship?',
    },
    'party-position': {
      text: 'Are you the disclosing party, the receiving party, or both?',
      hint: 'Your role determines which obligations and carve-outs we focus on.',
    },
  },
  'employment': {
    'contract-type': {
      text: 'This appears to be an employment-related agreement.',
      hint: 'Employment contract, offer letter, separation agreement, or independent contractor?',
    },
    'party-position': {
      text: 'Are you the employer or the prospective employee?',
      hint: 'This determines whether we review for enforceability or for your protection.',
    },
  },
  'lease': {
    'contract-type': {
      text: 'This looks like a lease or rental agreement.',
      hint: 'Commercial or residential? Single-tenant, multi-tenant, or ground lease?',
    },
    'party-position': {
      text: 'Are you the landlord or the tenant?',
      hint: 'We\'ll focus on the provisions that matter most from your side.',
    },
  },
  'saas': {
    'contract-type': {
      text: 'This appears to be a SaaS agreement.',
      hint: 'Enterprise subscription, self-serve terms, or reseller/partner agreement?',
    },
    'party-position': {
      text: 'Are you the SaaS provider or the customer subscribing?',
      hint: 'Providers need strong limitation of liability; customers need strong SLAs and data terms.',
    },
  },
  'vendor': {
    'contract-type': {
      text: 'This looks like a vendor or procurement agreement.',
      hint: 'Master services agreement, SOW, supply contract, or distribution agreement?',
    },
    'party-position': {
      text: 'Are you the buyer or the vendor in this arrangement?',
      hint: 'Buyers focus on warranties and remedies; vendors focus on liability caps and payment.',
    },
  },
  'ip-license': {
    'contract-type': {
      text: 'This appears to be a license agreement involving IP.',
      hint: 'Software license, patent license, trademark license, or content license?',
    },
    'party-position': {
      text: 'Are you the licensor granting rights, or the licensee receiving them?',
      hint: 'This determines our focus on scope restrictions vs. usage rights.',
    },
  },
};

// ── Acknowledgment templates ──────────────────────────────────────────────

/** Template for acknowledging an answer before showing the next question. */
const ACKNOWLEDGE_TEMPLATES: Record<string, (answer: string) => string> = {
  'matter-description': () => `Got it \u2014 we'll focus our analysis on this specific context.`,
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

// ── Hook ──────────────────────────────────────────────────────────────────

export function useBriefingQuestions(
  workflowId: string,
  interviewerId?: string,
  documents?: Array<{ name: string; content: string }>,
) {
  // Build document-aware questions: detect type → apply overrides
  const questions = useMemo(() => {
    const base = WORKFLOW_QUESTIONS[workflowId] ?? WORKFLOW_QUESTIONS['default'];

    if (!documents || documents.length === 0) return base;

    const docType = detectDocumentType(documents);
    if (docType === 'general') return base;

    const overrides = DOC_OVERRIDES[docType];
    if (!overrides) return base;

    // Apply overrides — replace text/hint for matching question IDs
    return base.map(q => {
      const override = overrides[q.id];
      if (!override) return q;
      return { ...q, text: override.text, hint: override.hint };
    });
  }, [workflowId, documents]);

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
