/**
 * Local Analysis — On-device legal review for confidential documents.
 *
 * When a document matches a sensitivity pattern (e.g., *confidential*,
 * *privileged*, *merger*), it is analyzed entirely on-device using a
 * local model via Ollama's OpenAI-compatible API.
 *
 * No document content is transmitted to any external service.
 * This preserves attorney-client privilege.
 *
 * The analysis is simpler than the full multi-agent frontier pipeline
 * (no debate, no adversarial challenge, no verification) but provides:
 * - Document type detection
 * - Key clause extraction with risk flags
 * - Plain-language summary
 * - Actionable recommendations
 *
 * Cost: $0 per document (local inference).
 */

import { config } from '../config.js';
import type { ClawProfile } from './types.js';

// ── Result Types ─────────────────────────────────────────────────────────

export interface LocalAnalysisResult {
  /** Plain-language document summary */
  summary: string;
  /** Detected document type (NDA, contract, etc.) */
  documentType: string;
  /** Key clauses identified */
  clauses: ClauseAnalysis[];
  /** Risk flags with severity */
  risks: RiskItem[];
  /** Actionable recommendations */
  recommendations: string[];
  /** Always present — reminds users this was local analysis */
  confidenceNote: string;
  /** Model used for analysis */
  model: string;
}

export interface ClauseAnalysis {
  title: string;
  /** Exact clause text (quoted from document) */
  text: string;
  /** What to watch for */
  concern: string;
  severity: 'info' | 'minor' | 'major' | 'critical';
}

export interface RiskItem {
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Where in the document */
  citation: string;
}

// ── System Prompt ────────────────────────────────────────────────────────

const LOCAL_ANALYSIS_PROMPT = `You are a legal document analyst. Analyze the provided document and return a structured JSON response.

Your analysis must include:
1. A plain-language summary (2-3 sentences, no jargon)
2. The document type (e.g., "NDA", "Employment Agreement", "Terms of Service")
3. Key clauses with exact text quotes, concerns, and severity ratings
4. Risk items with descriptions, severity, and citations
5. Actionable recommendations

Severity levels:
- clauses: "info" | "minor" | "major" | "critical"
- risks: "low" | "medium" | "high" | "critical"

Respond with ONLY valid JSON matching this structure:
{
  "summary": "string",
  "documentType": "string",
  "clauses": [{ "title": "string", "text": "string", "concern": "string", "severity": "string" }],
  "risks": [{ "description": "string", "severity": "string", "citation": "string" }],
  "recommendations": ["string"]
}

Be thorough but concise. Quote exact text when citing clauses. Focus on issues that matter most given the client's jurisdiction and concerns.`;

// ── Analysis Function ────────────────────────────────────────────────────

/**
 * Analyze a document entirely on-device using a local model.
 * Uses Ollama's OpenAI-compatible API.
 *
 * @throws If the local model is unreachable or returns invalid output
 */
export async function analyzeLocally(
  documentText: string,
  filename: string,
  profile: ClawProfile,
): Promise<LocalAnalysisResult> {
  const modelName = config.claw.localAnalysisModel || config.claw.localModel;

  if (!modelName) {
    throw new Error('No local model configured. Set MARBLE_LOCAL_MODEL in .env');
  }

  const baseUrl = config.claw.localModelUrl.replace(/\/$/, '');

  // Truncate document to ~8000 chars for smaller models
  // Larger models (70B) can handle more but this keeps latency reasonable
  const maxChars = modelName.includes('70b') || modelName.includes('72b') ? 16000 : 8000;
  const excerpt = documentText.slice(0, maxChars);
  const truncated = documentText.length > maxChars;

  const userMessage = [
    `DOCUMENT: ${filename}`,
    `CLIENT: ${profile.company} (${profile.industry}, ${profile.jurisdiction})`,
    `CONCERNS: ${profile.concerns.join(', ')}`,
    `RISK APPETITE: ${profile.preferences.riskAppetite}`,
    truncated ? `\nNOTE: Document truncated to first ${maxChars} characters (${documentText.length} total).` : '',
    `\n--- DOCUMENT TEXT ---\n${excerpt}`,
  ].join('\n');

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: LOCAL_ANALYSIS_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(120_000), // 2 min timeout for local inference
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Local model returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model?: string;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Local model returned empty response');
  }

  // Parse JSON response
  let parsed: {
    summary?: string;
    documentType?: string;
    clauses?: ClauseAnalysis[];
    risks?: RiskItem[];
    recommendations?: string[];
  };

  try {
    // Try direct parse first
    parsed = JSON.parse(content);
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Last resort: find JSON object
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        throw new Error('Local model did not return valid JSON');
      }
    }
  }

  return {
    summary: parsed.summary ?? `Analysis of ${filename}`,
    documentType: parsed.documentType ?? 'Document',
    clauses: (parsed.clauses ?? []).map(c => ({
      title: c.title ?? 'Untitled Clause',
      text: c.text ?? '',
      concern: c.concern ?? '',
      severity: validateSeverity(c.severity, 'info'),
    })),
    risks: (parsed.risks ?? []).map(r => ({
      description: r.description ?? '',
      severity: validateRiskSeverity(r.severity, 'medium'),
      citation: r.citation ?? '',
    })),
    recommendations: parsed.recommendations ?? [],
    confidenceNote: 'This document was analyzed entirely on-device using a local model. No content was transmitted externally. For complex legal matters, verify findings with qualified counsel.',
    model: data.model ?? modelName,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function validateSeverity(
  s: string | undefined,
  fallback: 'info' | 'minor' | 'major' | 'critical',
): 'info' | 'minor' | 'major' | 'critical' {
  const valid = ['info', 'minor', 'major', 'critical'];
  return valid.includes(s ?? '') ? (s as 'info' | 'minor' | 'major' | 'critical') : fallback;
}

function validateRiskSeverity(
  s: string | undefined,
  fallback: 'low' | 'medium' | 'high' | 'critical',
): 'low' | 'medium' | 'high' | 'critical' {
  const valid = ['low', 'medium', 'high', 'critical'];
  return valid.includes(s ?? '') ? (s as 'low' | 'medium' | 'high' | 'critical') : fallback;
}

/**
 * Extract findings summary from local analysis result.
 * Maps local severity to the standard findings format.
 */
export function extractLocalFindings(
  result: LocalAnalysisResult,
): { critical: number; major: number; minor: number } {
  let critical = 0;
  let major = 0;
  let minor = 0;

  for (const clause of result.clauses) {
    if (clause.severity === 'critical') critical++;
    else if (clause.severity === 'major') major++;
    else minor++;
  }

  for (const risk of result.risks) {
    if (risk.severity === 'critical') critical++;
    else if (risk.severity === 'high') major++;
    else minor++;
  }

  return { critical, major, minor };
}
