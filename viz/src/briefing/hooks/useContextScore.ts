/**
 * useContextScore — Computes a 0-100 context completeness score.
 *
 * Scoring formula:
 *   Documents:         0–25 pts (5 per doc, max 25)
 *   Required answers:  0–25 pts (proportional to completion)
 *   Optional answers:  0–25 pts (proportional to completion)
 *   Answer depth:      0–15 pts (rewards longer, richer answers)
 *   Variety signals:   0–10 pts (multiple categories, different lengths)
 *
 * Pure computation — no side effects. Drives the ContextMeter UI.
 */

import { useMemo, useRef } from 'react';
import type { BriefingQuestion } from '../data/questions.js';
import type { UploadedDocument } from './useDocumentUpload.js';

export interface ContextScoreBreakdown {
  documents: number;       // 0–25
  requiredAnswers: number; // 0–25
  optionalAnswers: number; // 0–25
  answerDepth: number;     // 0–15
  variety: number;         // 0–10
  total: number;           // 0–100
}

export interface ContextMilestone {
  threshold: number;
  label: string;
  reached: boolean;
}

const MILESTONES: Array<{ threshold: number; label: string }> = [
  { threshold: 25, label: 'Getting started' },
  { threshold: 50, label: 'Good foundation' },
  { threshold: 75, label: 'Strong briefing' },
  { threshold: 100, label: 'Exceptional' },
];

/**
 * Count words roughly (split on whitespace).
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function useContextScore(
  documents: UploadedDocument[],
  questions: BriefingQuestion[],
  answers: Record<string, string>,
) {
  const previousMilestoneRef = useRef(0);

  const breakdown = useMemo((): ContextScoreBreakdown => {
    // ── Documents (0–25) ───────────────────────────────────────────
    const docScore = Math.min(25, documents.length * 5);

    // ── Required answers (0–25) ────────────────────────────────────
    const required = questions.filter(q => q.required);
    const requiredAnswered = required.filter(
      q => (answers[q.id] ?? '').trim().length > 0,
    ).length;
    const requiredScore =
      required.length > 0
        ? Math.round((requiredAnswered / required.length) * 25)
        : 25; // no required questions = full marks

    // ── Optional answers (0–25) ────────────────────────────────────
    const optional = questions.filter(q => !q.required);
    const optionalAnswered = optional.filter(
      q => (answers[q.id] ?? '').trim().length > 0,
    ).length;
    const optionalScore =
      optional.length > 0
        ? Math.round((optionalAnswered / optional.length) * 25)
        : 0;

    // ── Answer depth (0–15) ────────────────────────────────────────
    // Rewards longer, more considered answers.
    // Each answer: 0 words = 0, 5+ words = 1pt, 15+ = 2pt, 30+ = 3pt
    const allAnswered = questions.filter(
      q => (answers[q.id] ?? '').trim().length > 0,
    );
    let depthRaw = 0;
    for (const q of allAnswered) {
      const wc = wordCount(answers[q.id]);
      if (wc >= 30) depthRaw += 3;
      else if (wc >= 15) depthRaw += 2;
      else if (wc >= 5) depthRaw += 1;
    }
    // Scale: max possible depth = questions.length * 3
    const maxDepth = questions.length * 3;
    const depthScore =
      maxDepth > 0 ? Math.min(15, Math.round((depthRaw / maxDepth) * 15)) : 0;

    // ── Variety (0–10) ─────────────────────────────────────────────
    // Categories covered (context, scope, constraints, objectives)
    const categories = new Set(
      allAnswered.map(q => q.category),
    );
    const catBonus = Math.min(8, categories.size * 2);
    // Documents + answers diversity bonus
    const hasDocs = documents.length > 0 ? 2 : 0;
    const varietyScore = Math.min(10, catBonus + hasDocs);

    const total = docScore + requiredScore + optionalScore + depthScore + varietyScore;

    return {
      documents: docScore,
      requiredAnswers: requiredScore,
      optionalAnswers: optionalScore,
      answerDepth: depthScore,
      variety: varietyScore,
      total: Math.min(100, total),
    };
  }, [documents, questions, answers]);

  // ── Milestones ────────────────────────────────────────────────────
  const milestones: ContextMilestone[] = MILESTONES.map(m => ({
    ...m,
    reached: breakdown.total >= m.threshold,
  }));

  // Detect new milestone crossing
  const newMilestone = useMemo(() => {
    const highestReached = milestones
      .filter(m => m.reached)
      .reduce((max, m) => Math.max(max, m.threshold), 0);

    if (highestReached > previousMilestoneRef.current) {
      const prev = previousMilestoneRef.current;
      previousMilestoneRef.current = highestReached;
      // Only fire on actual increase, not on initial render
      return prev > 0 ? highestReached : null;
    }
    return null;
  }, [milestones]);

  return { breakdown, milestones, newMilestone };
}
