/**
 * ImportAgentModal — bring a shared agent into your roster.
 *
 * Two paths:
 *   1. Paste a Lavern share URL (e.g. http://localhost:3000/#/a/<token>)
 *      → we extract the token, GET /api/agents/share/<token>, validate + add
 *   2. Drop a JSON file (lavern-agent-v1 export)
 *      → parse + validate + add
 *
 * Both paths surface a preview before the user confirms.
 */

import { useState, useCallback, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { AgentProfile, AgentProvenance } from '../../types/agent-profile.js';

interface Props {
  onClose: () => void;
  onImported: (profile: AgentProfile, provenance?: AgentProvenance) => void;
}

function extractTokenFromUrl(input: string): string | null {
  const trimmed = input.trim();
  // Accept full URL or bare token
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  const m = /\/a\/([A-Za-z0-9_-]+)/.exec(trimmed);
  return m ? m[1] : null;
}

export function ImportAgentModal({ onClose, onImported }: Props) {
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ profile: AgentProfile; ownerName?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUrl = useCallback(async () => {
    setError(null);
    const token = extractTokenFromUrl(urlInput);
    if (!token) { setError('That doesn\'t look like a Lavern share URL or token.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/share/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Share not found or revoked.' : `HTTP ${res.status}`);
      const data = await res.json() as { profile: AgentProfile; ownerName: string };
      setPreview({ profile: data.profile, ownerName: data.ownerName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setBusy(false);
    }
  }, [urlInput]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { _format?: string; profile?: AgentProfile };
      if (parsed._format !== 'lavern-agent-v1') {
        throw new Error('That file is not a Lavern agent export (missing _format: "lavern-agent-v1").');
      }
      if (!parsed.profile?.displayName) {
        throw new Error('That file is missing a valid agent profile.');
      }
      setPreview({ profile: parsed.profile });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File parse failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmImport = useCallback(() => {
    if (!preview) return;
    onImported(preview.profile, preview.profile.provenance);
  }, [preview, onImported]);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={styles.closeBtn}>×</button>
        <div style={styles.header}>
          <div style={styles.title}>Import an agent</div>
          <div style={styles.sub}>
            Paste a Lavern share URL or drop a JSON file.
          </div>
        </div>

        {!preview && (
          <>
            <div style={styles.section}>
              <label style={styles.label}>Share URL or token</label>
              <div style={styles.row}>
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://lavern.ai/#/a/abc123…"
                  style={styles.input}
                  onKeyDown={e => { if (e.key === 'Enter') handleUrl(); }}
                />
                <button onClick={handleUrl} disabled={busy || !urlInput.trim()} style={styles.fetchBtn}>
                  {busy ? 'Loading…' : 'Fetch'}
                </button>
              </div>
            </div>

            <div style={styles.divider}>or</div>

            <div style={styles.section}>
              <label style={styles.label}>JSON file</label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={styles.fileBtn}
              >
                Choose JSON file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
          </>
        )}

        {preview && (
          <div style={styles.previewBox}>
            <div style={styles.previewLabel}>You're about to import</div>
            <div style={styles.previewName}>{preview.profile.displayName}</div>
            <div style={styles.previewArchetype}>{preview.profile.personality.archetype}</div>
            {preview.profile.tagline && (
              <div style={styles.previewTagline}>"{preview.profile.tagline}"</div>
            )}
            {preview.ownerName && (
              <div style={styles.previewOwner}>shared by {preview.ownerName}</div>
            )}

            <div style={styles.previewActions}>
              <button onClick={confirmImport} style={styles.importConfirmBtn}>
                Add to my roster →
              </button>
              <button onClick={() => setPreview(null)} style={styles.secondaryBtn}>
                Try another
              </button>
            </div>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

// keep imports live
void colors;
void radii;
void spacing;

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(8,6,4,0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 24,
  },
  modal: {
    background: '#1A140A',
    color: '#F5EFDF',
    borderRadius: 8,
    padding: '32px 32px 28px',
    width: '100%', maxWidth: 480,
    border: '1px solid rgba(232,132,92,0.2)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    position: 'relative',
    display: 'flex', flexDirection: 'column', gap: 20,
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 14,
    background: 'transparent', border: 'none', color: 'rgba(245,239,223,0.55)',
    fontSize: 28, cursor: 'pointer', padding: 4, lineHeight: 1,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 6 },
  title: {
    fontFamily: fonts.serif, fontSize: 28, fontWeight: 500, color: '#FAF7F0',
  },
  sub: { fontSize: 13, color: 'rgba(245,239,223,0.6)', lineHeight: 1.5 },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: {
    fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
    color: 'rgba(245,239,223,0.55)', fontWeight: 600,
  },
  row: { display: 'flex', gap: 8 },
  input: {
    flex: 1, padding: '10px 12px',
    background: '#0E0A06', color: '#F5EFDF',
    border: '1px solid rgba(245,239,223,0.15)', borderRadius: 4,
    fontSize: 13,
  },
  fetchBtn: {
    background: '#E8845C', color: '#1A140A',
    padding: '0 18px', fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', fontWeight: 700,
    border: 'none', borderRadius: 4, cursor: 'pointer',
  },
  fileBtn: {
    background: 'transparent', color: '#F5EFDF',
    border: '1px dashed rgba(245,239,223,0.3)', borderRadius: 4,
    padding: '12px 18px', cursor: 'pointer',
    fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  divider: {
    fontSize: 11, color: 'rgba(245,239,223,0.4)',
    textAlign: 'center', letterSpacing: 1.5, textTransform: 'uppercase',
  },
  previewBox: {
    padding: 20,
    background: 'rgba(232,132,92,0.06)',
    border: '1px solid rgba(232,132,92,0.2)',
    borderRadius: 6,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  previewLabel: {
    fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
    color: '#E8845C', fontWeight: 600,
  },
  previewName: {
    fontFamily: fonts.serif, fontSize: 24, color: '#FAF7F0', fontWeight: 500,
  },
  previewArchetype: {
    fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    color: '#E8845C', marginTop: 2,
  },
  previewTagline: {
    fontFamily: fonts.serif, fontStyle: 'italic',
    fontSize: 16, color: 'rgba(245,239,223,0.7)', marginTop: 4,
  },
  previewOwner: {
    fontSize: 11, color: 'rgba(245,239,223,0.5)', marginTop: 4, fontStyle: 'italic',
  },
  previewActions: { display: 'flex', gap: 10, marginTop: 16 },
  importConfirmBtn: {
    flex: 1,
    background: '#E8845C', color: '#1A140A',
    padding: '12px 18px', fontSize: 12, letterSpacing: 1.2,
    textTransform: 'uppercase', fontWeight: 700,
    border: 'none', borderRadius: 4, cursor: 'pointer',
  },
  secondaryBtn: {
    background: 'transparent', color: '#F5EFDF',
    border: '1px solid rgba(245,239,223,0.25)', borderRadius: 4,
    padding: '12px 18px', cursor: 'pointer',
    fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(196,93,62,0.12)',
    border: '1px solid rgba(196,93,62,0.35)',
    borderRadius: 4, fontSize: 12, color: '#FFB3A1',
  },
};
