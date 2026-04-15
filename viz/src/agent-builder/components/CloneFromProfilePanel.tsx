/**
 * CloneFromProfilePanel — paste a bio or drop a CV, get an agent back.
 *
 * Flow:
 *   1. User pastes profile text OR drops/uploads a CV (PDF/DOCX).
 *   2. If file: POST /api/documents/parse → extract fullText.
 *   3. POST /api/agents/clone with { profileText } → agent JSON.
 *   4. Hand the parsed agent back to the parent (hub) which loads it
 *      into the builder wizard.
 *
 * Soft limits: 20–6000 chars. The backend enforces the same range.
 */

import { useState, useCallback, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

const MIN_CHARS = 20;
const MAX_CHARS = 6000;
const ACCEPTED_TYPES = '.pdf,.docx,.doc,.txt,.md';

interface CloneData {
  displayName?: string;
  tagline?: string;
  category?: 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';
  seniority?: 'partner' | 'senior-associate' | 'associate' | 'junior' | 'specialist' | 'counsel';
  archetype?: string;
  workStyle?: string;
  practiceAreas?: string[];
  strengths?: string[];
  limitations?: string[];
  skills?: Record<string, number>;
  personality?: Record<string, number>;
}

interface Props {
  onCancel: () => void;
  onComplete: (data: CloneData) => void;
}

type Phase = 'input' | 'parsing' | 'generating' | 'error';

export function CloneFromProfilePanel({ onCancel, onComplete }: Props) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const charCount = text.length;
  const canGenerate = charCount >= MIN_CHARS && charCount <= MAX_CHARS && phase === 'input';

  const handleFile = useCallback(async (file: File) => {
    setPhase('parsing');
    setErrorMsg(null);
    setUploadedFilename(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/documents/parse', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Parse failed' }));
        throw new Error(err.error || 'Failed to parse file');
      }
      const parsed = await res.json() as { fullText?: string };
      const extracted = (parsed.fullText ?? '').trim();
      if (extracted.length < MIN_CHARS) {
        throw new Error('CV appears empty or too short — paste the text instead.');
      }
      // Trim to MAX_CHARS — prioritize the start (usually identity + experience)
      const trimmed = extracted.length > MAX_CHARS ? extracted.slice(0, MAX_CHARS) : extracted;
      setText(trimmed);
      setPhase('input');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setPhase('error');
      setUploadedFilename(null);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so same file can be re-picked
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setPhase('generating');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/agents/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ profileText: text.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Failed to generate agent');
      }
      const data = await res.json() as CloneData;
      onComplete(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed');
      setPhase('error');
    }
  }, [canGenerate, text, onComplete]);

  const busy = phase === 'parsing' || phase === 'generating';
  const busyLabel = phase === 'parsing' ? 'Reading CV\u2026' : phase === 'generating' ? 'Generating agent\u2026' : null;

  return (
    <div style={styles.panel}>
      <div style={styles.head}>
        <button onClick={onCancel} style={styles.backBtn} disabled={busy}>
          {'\u2190'} Back
        </button>
        <div style={styles.title}>Clone from a profile</div>
        <div style={{ width: 60 }} />
      </div>

      <div style={styles.intro}>
        Paste a LinkedIn "About" section, a bio, or drop a CV.
        <br />
        We'll build an agent that resembles the person — you can tweak every detail before saving.
      </div>

      {/* File drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); if (!busy) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={busy ? undefined : handleDrop}
        onClick={busy ? undefined : () => fileInputRef.current?.click()}
        style={{
          ...styles.dropZone,
          borderColor: isDragOver ? '#2d6a8f' : colors.border,
          backgroundColor: isDragOver ? 'rgba(45, 106, 143, 0.06)' : colors.bgPanel,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileInput}
          style={{ display: 'none' }}
          disabled={busy}
        />
        {uploadedFilename ? (
          <div style={styles.dropLabel}>
            <strong style={{ color: colors.text }}>{uploadedFilename}</strong>{' '}
            loaded {'\u00B7'} {charCount.toLocaleString()} chars
            <div style={styles.dropHint}>Click to replace or drop a different file</div>
          </div>
        ) : (
          <div style={styles.dropLabel}>
            <strong style={{ color: colors.text }}>Drop a CV</strong> or click to browse
            <div style={styles.dropHint}>PDF, DOCX, or plain text</div>
          </div>
        )}
      </div>

      <div style={styles.orDivider}>
        <span style={styles.orText}>or paste text</span>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value.slice(0, MAX_CHARS))}
        placeholder="Paste a LinkedIn About section, a short bio, or your CV text here&hellip;"
        rows={10}
        disabled={busy}
        style={styles.textarea}
      />

      <div style={styles.footer}>
        <span style={{
          ...styles.charCount,
          color: charCount < MIN_CHARS ? colors.textMuted
               : charCount > MAX_CHARS * 0.9 ? '#b43c28'
               : colors.textSecondary,
        }}>
          {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars
          {charCount > 0 && charCount < MIN_CHARS ? ` \u00B7 need ${MIN_CHARS - charCount} more` : ''}
        </span>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          style={{
            ...styles.generateBtn,
            opacity: canGenerate ? 1 : 0.45,
            cursor: canGenerate ? 'pointer' : 'not-allowed',
          }}
        >
          {busyLabel ?? 'Generate agent \u2192'}
        </button>
      </div>

      {errorMsg && (
        <div style={styles.error}>{errorMsg}</div>
      )}

      <div style={styles.privacyNote}>
        Profile text is sent to Claude to build the agent card. Nothing is stored server-side.
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    maxWidth: 720,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backBtn: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: 500,
    color: colors.text,
    letterSpacing: -0.2,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.6,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  dropZone: {
    padding: '28px 20px',
    border: '1.5px dashed',
    borderRadius: radii.md,
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  dropLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textSecondary,
  },
  dropHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  orDivider: {
    textAlign: 'center',
    position: 'relative',
    margin: `${spacing.xs}px 0`,
  },
  orText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    backgroundColor: colors.bg,
    padding: '0 12px',
    position: 'relative',
    zIndex: 1,
  },
  textarea: {
    width: '100%',
    padding: '14px 16px',
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    resize: 'vertical',
    boxSizing: 'border-box',
    minHeight: 180,
    lineHeight: 1.55,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  charCount: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  generateBtn: {
    padding: '11px 24px',
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2d6a8f',
    border: 'none',
    borderRadius: radii.md,
    transition: 'opacity 0.2s',
  },
  error: {
    padding: '10px 14px',
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: '#b43c28',
    backgroundColor: 'rgba(180, 60, 40, 0.08)',
    border: '1px solid rgba(180, 60, 40, 0.25)',
  },
  privacyNote: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
};
