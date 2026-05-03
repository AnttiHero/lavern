/**
 * ShareAgentModal — opt-in share UI for a custom agent.
 *
 * Flow:
 *   1. Modal opens with the agent card preview
 *   2. User clicks "Generate share link" → POST /api/agents/share
 *   3. Modal reveals: share URL (copy), preview of OG image (live), LinkedIn
 *      button (opens composer with pre-filled text), JSON download
 *   4. User can revoke at any time → DELETE /api/agents/share/:token
 *
 * The LinkedIn pre-fill text varies by provenance:
 *   - self    → "I cloned myself with Lavern. Meet {name}."
 *   - firm    → "I cloned {firmName} with Lavern."
 *   - scratch → "I built {name} with Lavern."
 *   - goblin  → "I summoned a goblin with Lavern."
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { CustomAgent } from '../hooks/useCustomAgents.js';
import type { AgentProfile } from '../../types/agent-profile.js';

interface Props {
  agent: CustomAgent;
  onClose: () => void;
  /** Called with the new token after generation, so the parent can persist it. */
  onShared: (token: string) => void;
  /** Called after revoke. */
  onRevoked: () => void;
}

function shareCopyForLinkedIn(profile: AgentProfile): string {
  const p = profile.provenance;
  if (!p) return `Made an agent on Lavern. Meet ${profile.displayName}.`;
  switch (p.kind) {
    case 'self':    return `I cloned myself with Lavern. Meet ${profile.displayName} — the agent.`;
    case 'firm':    return `I cloned ${p.firmName ?? 'a firm'} with Lavern. Full team in 60 seconds.`;
    case 'scratch': return `I built ${profile.displayName} with Lavern. Here's how it runs.`;
    case 'goblin':  return `I summoned a goblin with Lavern. Don't ask.`;
  }
}

export function ShareAgentModal({ agent, onClose, onShared, onRevoked }: Props) {
  const [token, setToken] = useState<string>(agent.shareToken ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = token ? `${window.location.origin}/#/a/${token}` : '';
  const ogImageUrl = token ? `/api/agents/share/${token}/og.png` : '';
  const linkedInText = shareCopyForLinkedIn(agent.profile);
  const linkedInUrl = token
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    : '';
  // Note: LinkedIn ignores the `summary` param these days; users can paste from
  // the modal's "copy share text" instead.

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/share', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: agent.profile }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
      }
      const data = await res.json() as { token: string };
      setToken(data.token);
      onShared(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setBusy(false);
    }
  }, [agent, onShared]);

  const revoke = useCallback(async () => {
    if (!token) return;
    if (!confirm('Revoke the share link? Anyone with the URL will see "not found".')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/share/${encodeURIComponent(token)}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToken('');
      onRevoked();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(false);
    }
  }, [token, onRevoked]);

  const copyUrl = useCallback(async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [shareUrl]);

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(`${linkedInText}\n${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [linkedInText, shareUrl]);

  const downloadJson = useCallback(() => {
    const exportData = {
      _format: 'lavern-agent-v1',
      profile: agent.profile,
      sharedToken: token || undefined,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lavern-agent-${agent.profile.displayName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [agent, token]);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close">×</button>

        <div style={styles.header}>
          <div style={styles.title}>Share {agent.profile.displayName}</div>
          <div style={styles.sub}>
            {token
              ? 'Share this agent on LinkedIn, with another Lavern user, or as a JSON file.'
              : 'Generate a public link. You can revoke it any time.'}
          </div>
        </div>

        {/* OG-image preview */}
        {token && (
          <div style={styles.previewWrap}>
            <img
              src={ogImageUrl}
              alt="Share card preview"
              style={styles.preview}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={styles.previewLabel}>This is what LinkedIn shows.</div>
          </div>
        )}

        {!token && (
          <button onClick={generate} disabled={busy} style={styles.generateBtn}>
            {busy ? 'Generating…' : 'Generate share link →'}
          </button>
        )}

        {token && (
          <>
            <div style={styles.urlRow}>
              <input
                value={shareUrl}
                readOnly
                style={styles.urlInput}
                onFocus={e => e.target.select()}
              />
              <button onClick={copyUrl} style={styles.copyBtn}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={styles.copyTextSection}>
              <div style={styles.copyTextLabel}>Suggested LinkedIn text</div>
              <div style={styles.copyTextBox}>{linkedInText}</div>
              <button onClick={copyText} style={styles.smallBtn}>
                {copied ? 'Copied' : 'Copy text + link'}
              </button>
            </div>

            <div style={styles.actions}>
              <a
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.linkedInBtn}
              >
                Share on LinkedIn →
              </a>
              <button onClick={downloadJson} style={styles.secondaryBtn}>
                Download JSON
              </button>
              <button onClick={revoke} disabled={busy} style={styles.revokeBtn}>
                Revoke link
              </button>
            </div>
          </>
        )}

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

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
    borderRadius: radii.md,
    padding: '32px 32px 28px',
    width: '100%', maxWidth: 560,
    maxHeight: '92vh',
    overflowY: 'auto',
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
  previewWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  preview: {
    width: '100%', borderRadius: radii.sm, display: 'block',
    border: '1px solid rgba(232,132,92,0.15)',
  },
  previewLabel: {
    fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase',
    color: 'rgba(245,239,223,0.4)', textAlign: 'center',
  },
  generateBtn: {
    background: '#E8845C', color: '#1A140A',
    padding: '14px 22px',
    fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700,
    border: 'none', borderRadius: 4, cursor: 'pointer',
  },
  urlRow: { display: 'flex', gap: 8 },
  urlInput: {
    flex: 1, padding: '10px 12px',
    background: '#0E0A06', color: '#F5EFDF',
    border: '1px solid rgba(245,239,223,0.15)', borderRadius: 4,
    fontFamily: `'SF Mono', Menlo, monospace`, fontSize: 12,
  },
  copyBtn: {
    background: 'transparent', color: '#F5EFDF',
    border: '1px solid rgba(245,239,223,0.25)', borderRadius: 4,
    padding: '0 16px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    cursor: 'pointer', minWidth: 80,
  },
  copyTextSection: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '12px 14px',
    background: 'rgba(232,132,92,0.06)',
    borderRadius: 4, border: '1px solid rgba(232,132,92,0.15)',
  },
  copyTextLabel: {
    fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase',
    color: '#E8845C', fontWeight: 600,
  },
  copyTextBox: {
    fontSize: 14, color: '#F5EFDF', lineHeight: 1.5,
  },
  smallBtn: {
    alignSelf: 'flex-start', marginTop: 4,
    background: 'transparent', color: '#E8845C',
    border: 'none', cursor: 'pointer', fontSize: 11,
    letterSpacing: 1, textTransform: 'uppercase', padding: '4px 0',
  },
  actions: {
    display: 'flex', gap: 10, flexWrap: 'wrap',
    paddingTop: 6,
  },
  linkedInBtn: {
    flex: '1 0 auto',
    background: '#0A66C2', color: 'white',
    padding: '11px 18px', textDecoration: 'none',
    fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600,
    borderRadius: 4, textAlign: 'center',
  },
  secondaryBtn: {
    background: 'transparent', color: '#F5EFDF',
    border: '1px solid rgba(245,239,223,0.25)', borderRadius: 4,
    padding: '11px 18px', cursor: 'pointer',
    fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 500,
  },
  revokeBtn: {
    background: 'transparent', color: 'rgba(245,239,223,0.55)',
    border: '1px solid rgba(245,239,223,0.15)', borderRadius: 4,
    padding: '11px 18px', cursor: 'pointer',
    fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(196,93,62,0.12)',
    border: '1px solid rgba(196,93,62,0.35)',
    borderRadius: 4, fontSize: 12, color: '#FFB3A1',
  },
};

// keep tokens import live
void spacing;
void colors;
