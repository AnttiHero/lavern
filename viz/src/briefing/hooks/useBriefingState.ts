/**
 * useBriefingState — Central state for the briefing flow.
 *
 * Composes document upload + questions + memo generation + phase management.
 * Accepts workflowId to determine question set and memo format.
 */

import { useState, useCallback } from 'react';
import { useDocumentUpload, type UploadedDocument } from './useDocumentUpload.js';
import { useBriefingQuestions } from './useBriefingQuestions.js';
import type { BriefingPhase } from '../components/ProgressStepper.js';
import type { BriefingQuestion } from '../data/questions.js';

export interface BriefingPayload {
  workflowId: string;
  requestType: string;
  memoText: string;
  documents: UploadedDocument[];
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
  'legal-design': 'document_redesign',
  'contract-review': 'contract_review',
  'research-memo': 'legal_research',
  'simple-query': 'legal_question',
  'pre-engagement': 'general',
};

export function useBriefingState(workflowId: string, interviewerId?: string) {
  const [phase, setPhase] = useState<BriefingPhase>('documents');
  const [memoText, setMemoText] = useState('');

  const upload = useDocumentUpload();
  const qna = useBriefingQuestions(workflowId, interviewerId);

  const advanceToInterviewer = useCallback(() => {
    setPhase('interviewer');
  }, []);

  const advanceToQuestions = useCallback(() => {
    setPhase('questions');
  }, []);

  const advanceToMemo = useCallback(() => {
    let memo = generateMemo(qna.answers, qna.questions, upload.documents, workflowId);

    // Append custom instructions from user profile (localStorage)
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
    setPhase('memo');
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
      team,
      intensity,
      budgetUsd,
      yoloMode,
    };
  }, [workflowId, memoText, upload.documents]);

  return {
    phase,
    setPhase,
    memoText,
    setMemoText,
    advanceToInterviewer,
    advanceToQuestions,
    advanceToMemo,
    buildPayload,
    upload,
    qna,
  };
}
