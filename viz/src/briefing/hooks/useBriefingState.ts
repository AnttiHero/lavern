/**
 * useBriefingState — Central state for the briefing flow.
 *
 * Composes document upload + questions + LLM analysis + phase management.
 * Accepts workflowId to determine question set and memo format.
 *
 * Phases: documents → interviewer → questions → followups → instructions → brief
 * Stepper maps these to 4 visible dots:
 *   - Documents (documents)
 *   - Interviewer (interviewer)
 *   - Questions (questions, followups)
 *   - Brief (instructions, brief)
 */

import { useState, useCallback } from 'react';
import { useDocumentUpload, type UploadedDocument, type FrontendParsedDocument } from './useDocumentUpload.js';
import { useBriefingQuestions } from './useBriefingQuestions.js';
import { useBriefingAnalysis, type EngagementBrief } from './useBriefingAnalysis.js';
import { useLLMInterview, type UseLLMInterviewReturn } from './useLLMInterview.js';
import type { BriefingPhase } from '../components/ProgressStepper.js';
import type { BriefingQuestion } from '../data/questions.js';

export interface BriefingPayload {
  workflowId: string;
  requestType: string;
  memoText: string;
  documents: UploadedDocument[];
  /** Structured parsed documents from backend (when available) */
  parsedDocuments: FrontendParsedDocument[];
  team: string[];
  intensity: string;
  budgetUsd: number;
  yoloMode: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Serialize an engagement brief to structured markdown for the orchestrator prompt.
 */
function serializeBrief(
  brief: EngagementBrief,
  finalInstructions: string,
  sufficiencyScore: number | undefined,
): string {
  const sections: string[] = [];

  sections.push('## Engagement Brief');
  sections.push('');

  sections.push('### Objective');
  sections.push(brief.objective);
  sections.push('');

  sections.push('### Summary');
  sections.push(brief.summary);
  sections.push('');

  if (brief.documentAnalysis) {
    sections.push('### Document Analysis');
    sections.push(brief.documentAnalysis);
    sections.push('');
  }

  sections.push('### Scope & Constraints');
  sections.push(brief.scopeAndConstraints);
  sections.push('');

  if (brief.riskFactors.length > 0) {
    sections.push('### Risk Factors');
    for (const risk of brief.riskFactors) {
      sections.push(`- ${risk}`);
    }
    sections.push('');
  }

  if (brief.successCriteria.length > 0) {
    sections.push('### Success Criteria');
    for (const criterion of brief.successCriteria) {
      sections.push(`- ${criterion}`);
    }
    sections.push('');
  }

  if (brief.specialInstructions.trim()) {
    sections.push('### Special Instructions');
    sections.push(brief.specialInstructions);
    sections.push('');
  }

  if (finalInstructions.trim()) {
    sections.push('### Final Client Instructions');
    sections.push(finalInstructions.trim());
    sections.push('');
  }

  if (sufficiencyScore != null) {
    sections.push(`### Context Sufficiency: ${sufficiencyScore}/100`);
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Fallback: generate a mechanical memo when LLM analysis fails.
 */
function generateMemo(
  answers: Record<string, string>,
  questions: BriefingQuestion[],
  documents: UploadedDocument[],
  workflowId: string,
): string {
  const sections: string[] = [];

  sections.push('# Briefing Memo');
  sections.push(`## ${workflowId}`);
  sections.push('');

  const categories: Array<{ key: string; label: string }> = [
    { key: 'context', label: 'Context' },
    { key: 'scope', label: 'Scope' },
    { key: 'constraints', label: 'Constraints' },
    { key: 'objectives', label: 'Objectives' },
  ];

  for (const cat of categories) {
    const catQuestions = questions.filter(q => q.category === cat.key);
    const answered = catQuestions.filter(q => (answers[q.id] ?? '').trim());
    if (answered.length > 0) {
      sections.push(`### ${cat.label}`);
      sections.push('');
      for (const q of answered) {
        sections.push(`**${q.text}**`);
        sections.push(answers[q.id]);
        sections.push('');
      }
    }
  }

  if (documents.length > 0) {
    sections.push('### Attached Documents');
    sections.push('');
    for (const doc of documents) {
      sections.push(`- ${doc.name} (${formatSize(doc.size)})`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

const WORKFLOW_TYPE_MAP: Record<string, string> = {
  'roundtable': 'document_redesign',
  'review': 'contract_review',
  'adversarial': 'legal_research',
  'counsel': 'legal_question',
  'pre-engagement': 'general',
  // Backward-compatible alias for old workflow ID
  'legal-design': 'document_redesign',
};

export function useBriefingState(workflowId: string, interviewerId?: string) {
  const [phase, setPhase] = useState<BriefingPhase>('documents');
  const [memoText, setMemoText] = useState('');

  const upload = useDocumentUpload();
  const qna = useBriefingQuestions(workflowId, interviewerId, upload.documents);
  const analysis = useBriefingAnalysis();

  // LLM-driven interview (active when an interviewer persona is selected)
  const interview = useLLMInterview(
    workflowId,
    interviewerId,
    upload.documents.map(d => ({ name: d.name, content: d.content })),
  );
  const useLLMMode = interviewerId != null;

  // ── Phase transitions ──

  const advanceToInterviewer = useCallback(() => {
    setPhase('interviewer');
  }, []);

  const advanceToQuestions = useCallback(() => {
    setPhase('questions');
  }, []);

  /**
   * After static questions → trigger LLM analysis → move to followups or instructions.
   *
   * Uses the RETURNED result from analyze() instead of reading analysis.analysisError
   * (which is React state and would be stale in this closure after await).
   */
  const advanceToFollowups = useCallback(async () => {
    // Trigger LLM analysis with documents + answers
    const result = await analysis.analyze({
      workflowId,
      documents: upload.documents.map(d => ({
        name: d.name,
        content: d.content,
      })),
      answers: qna.answers,
    });

    // If analysis errored, fall back to mechanical memo
    if (!result.success) {
      let memo = generateMemo(qna.answers, qna.questions, upload.documents, workflowId);
      try {
        const profileStr = localStorage.getItem('shem-user-profile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          if (profile.customInstructions?.trim()) {
            memo += '\n### Custom Instructions\n\n' + profile.customInstructions.trim() + '\n';
          }
        }
      } catch { /* ignore */ }
      setMemoText(memo);
      setPhase('brief');
      return;
    }

    // After analysis completes, the phase is set in the component based on results
    // If follow-up questions exist and verdict is not 'strong' → followups
    // Otherwise → skip to instructions
    setPhase('followups');
  }, [analysis, workflowId, upload.documents, qna.answers, qna.questions]);

  const advanceToInstructions = useCallback(() => {
    setPhase('instructions');
  }, []);

  /**
   * After final instructions → reanalyze with everything → show brief.
   *
   * Uses the RETURNED result from reanalyze() to avoid stale-closure issues
   * with analysis.engagementBrief after await.
   */
  const advanceToBrief = useCallback(async () => {
    // If we have follow-up answers or final instructions, reanalyze
    const hasFollowUpAnswers = Object.values(analysis.followUpAnswers).some(v => v.trim());
    const hasFinalInstructions = analysis.finalInstructions.trim().length > 0;

    let brief = analysis.engagementBrief;
    let score = analysis.sufficiency?.score;

    if (hasFollowUpAnswers || hasFinalInstructions) {
      const result = await analysis.reanalyze();
      // Use the fresh result data if reanalyze succeeded
      if (result.success && result.data) {
        brief = result.data.engagementBrief;
        score = result.data.sufficiency?.score;
      }
    }

    // Build the memo from the engagement brief
    if (brief) {
      const memo = serializeBrief(
        brief,
        analysis.finalInstructions,
        score,
      );
      setMemoText(memo);
    } else {
      // Fallback to mechanical memo
      let memo = generateMemo(qna.answers, qna.questions, upload.documents, workflowId);
      if (analysis.finalInstructions.trim()) {
        memo += '\n### Final Instructions\n\n' + analysis.finalInstructions.trim() + '\n';
      }
      try {
        const profileStr = localStorage.getItem('shem-user-profile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          if (profile.customInstructions?.trim()) {
            memo += '\n### Custom Instructions\n\n' + profile.customInstructions.trim() + '\n';
          }
        }
      } catch { /* ignore */ }
      setMemoText(memo);
    }

    setPhase('brief');
  }, [analysis, qna.answers, qna.questions, upload.documents, workflowId]);

  /**
   * Legacy memo generation (kept as fallback).
   */
  const advanceToMemo = useCallback(() => {
    let memo = generateMemo(qna.answers, qna.questions, upload.documents, workflowId);

    // If memo is effectively empty (just headers, no substantive content),
    // produce a minimal useful brief so agents can still proceed.
    const contentLines = memo.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (contentLines.length === 0) {
      memo = `# Briefing Memo\n## ${workflowId}\n\n### Note\n\nNo specific context was captured during the briefing.\nThe agents will proceed with general analysis based on the uploaded documents and workflow type.\n`;
    }

    try {
      const profileStr = localStorage.getItem('shem-user-profile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile.customInstructions?.trim()) {
          memo += '\n### Custom Instructions\n\n' + profile.customInstructions.trim() + '\n';
        }
      }
    } catch { /* ignore */ }

    setMemoText(memo);
    setPhase('brief');
  }, [qna.answers, qna.questions, upload.documents, workflowId]);

  const buildPayload = useCallback((): BriefingPayload => {
    // Read any persisted config (may be set later by staffing)
    let intensity = 'standard';
    let budgetUsd = 10;
    let yoloMode = false;
    let team: string[] = [];

    try {
      const configStr = sessionStorage.getItem('shem-briefing-config');
      if (configStr) {
        const config = JSON.parse(configStr);
        intensity = config.intensity ?? intensity;
        budgetUsd = config.budgetUsd ?? budgetUsd;
        yoloMode = config.yoloMode ?? yoloMode;
      }
    } catch { /* ignore */ }

    try {
      const teamStr = sessionStorage.getItem('shem-briefing-team');
      if (teamStr) team = JSON.parse(teamStr);
    } catch { /* ignore */ }

    return {
      workflowId,
      requestType: WORKFLOW_TYPE_MAP[workflowId] ?? 'general',
      memoText,
      documents: upload.documents,
      parsedDocuments: upload.parsedDocuments,
      team,
      intensity,
      budgetUsd,
      yoloMode,
    };
  }, [workflowId, memoText, upload.documents, upload.parsedDocuments]);

  return {
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
    /** LLM-driven interview hook (active when interviewer persona is selected). */
    interview,
    /** True when conversational LLM interview is active (interviewer selected). */
    useLLMMode,
  };
}
