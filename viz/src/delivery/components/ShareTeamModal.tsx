/**
 * ShareTeamModal — opt-in share UI for the team that ran the engagement.
 *
 * Mirrors ShareAgentModal but operates on a list of agent profiles. Single
 * generated PNG: front cards of every member in a grid, on the dark Lavern
 * canvas. Token is rotatable; owner can revoke any time.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';

interface Props {
  agents: AgentProfile[];
  defaultTitle?: string;
  onClose: () => void;
}

const MIN_AGENTS = 1;
const MAX_AGENTS = 6;

export function ShareTeamModal({ agents, defaultTitle, onClose }: Props) {
  const [token, setToken] = useState<string>('');
  const [title, setTitle] = useState<string>(defaultTitle ?? 'My Team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // We trim to first 6 — the OG renderer only shows up to 6 anyway.
  const teamForShare = agents.slice(0, MAX_AGENTS);
  const hasEnough = teamForShare.length >= MIN_AGENTS;
  const droppedCount = Math.max(0, agents.length - MAX_AGENTS);

  const shareUrl = token ? `${window.location.origin}/#/t/${token}` : '';
  const ogImageUrl = token ? `/api/teams/share/${token}/og.png` : '';
  const linkedInText = teamForShare.length === 1
    ? `Meet my team on Lavern. Just ${teamForShare[0].displayName} for now.`
    : `Meet my ${teamForShare.length}-person team on Lavern.`;
  const linkedInUrl = token
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    : '';

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Strip role-only fields the server validator doesn't accept.
      const sanitized = teamForShare.map(p => ({
        displayName: p.displayName,
        tagline: p.tagline,
        category: p.category,
        seniority: p.seniority,
        costTier: p.costTier,
        billingRateUsd: p.billingRateUsd,
        skills: p.skills,
        personality: {
          archetype: p.personality.archetype,
          traits: p.personality.traits ?? {},
          workStyle: p.personality.workStyle,
        },
        practiceAreas: p.practiceAreas ?? [],
        strengths: p.strengths ?? [],
        limitations: p.limitations ?? [],
        avatarSeed: (p as { avatarSeed?: string }).avatarSeed,
      }));
      const res = await fetch('/api/teams/share', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: sanitized, title: title.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      const data = await res.json() as { token: string };
      setToken(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setBusy(false);
    }
  }, [teamForShare, title]);

  const revoke = useCallback(async () => {
    if (!token) return;
    if (!confirm('Revoke the share link? Anyone with the URL will see "not found".')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/teams/share/${encodeURIComponent(token)}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToken('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(false);
    }
  }, [token]);

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

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close">×</button>

        <div style={styles.header}>
          <div style={styles.title}>Share your team</div>
          <div style={styles.sub}>
            {token
              ? `${teamForShare.length} agent${teamForShare.length === 1 ? '' : 's'} on the lineup. Share on LinkedIn, copy a link, or revoke any time.`
              : `One image, all ${teamForShare.length} member${teamForShare.length === 1 ? '' : 's'}. Front cards only — clean and shareable.`}
          </div>
          {droppedCount > 0 && (
            <div style={styles.warning}>
              The card shows the first 6 of {agents.length} members.
            </div>
          )}
        </div>

        {/* Member chips — what's about to be on the card */}
        <div style={styles.chipsWrap}>
          {teamForShare.map((a, i) => (
            <div key={i} style={styles.memberChip}>
              <div style={styles.chipName}>{a.displayName}</div>
              <div style={styles.chipMeta}>{a.seniority} · {a.category}</div>
            </div>
          ))}
        </div>

        {/* Title input — only before generate */}
        {!token && (
          <div style={styles.titleRow}>
            <label htmlFor="share-team-title" style={styles.titleLabel}>Card title (optional)</label>
            <input
              id="share-team-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Fund Formation Squad"
              maxLength={120}
              style={styles.titleInput}
            />
          </div>
        )}

        {/* OG-image preview */}
        {token && (
          <div style={styles.previewWrap}>
            <img
              src={ogImageUrl}
              alt="Team share card preview"
              style={styles.preview}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={styles.previewLabel}>This is what LinkedIn shows.</div>
          </div>
        )}

        {!token && (
          <button
            onClick={generate}
            disabled={busy || !hasEnough}
            style={{ ...styles.generateBtn, opacity: (busy || !hasEnough) ? 0.5 : 1 }}
          >
            {busy ? 'Rendering card…' : 'Generate share card →'}
          </button>
        )}

        {token && (
          <>
            <div style={styles.urlRow}>
              <input value={shareUrl} readOnly style={styles.urlInput} onFocus={e => e.target.select()} />
              <button onClick={copyUrl} style={styles.copyBtn}>{copied ? 'Copied' : 'Copy'}</button>
            </div>

            <div style={styles.copyTextSection}>
              <div style={styles.copyTextLabel}>Suggested LinkedIn text</div>
              <div style={styles.copyTextBox}>{linkedInText}</div>
              <button onClick={copyText} style={styles.smallBtn}>
                {copied ? 'Copied' : 'Copy text + link'}
              </button>
            </div>

            <div style={styles.actions}>
              <a href={linkedInUrl} target="_blank" rel="noopener noreferrer" style={styles.linkedInBtn}>
                Share on LinkedIn →
              </a>
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

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(8,6,4,0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 24,
  },
  modal: {
    background: '#1A140A', color: '#F5EFDF',
    borderRadius: radii.md,
    padding: '32px 32px 28px',
    width: '100%', maxWidth: 600,
    maxHeight: '92vh', overflowY: 'auto',
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
  title: { fontFamily: fonts.serif, fontSize: 28, fontWeight: 500, color: '#FAF7F0' },
  sub: { fontSize: 13, color: 'rgba(245,239,223,0.6)', lineHeight: 1.5 },
  warning: {
    fontSize: 11, color: '#E8845C', marginTop: 4,
    fontStyle: 'italic',
  },
  chipsWrap: {
    display: 'flex', flexWrap: 'wrap', gap: 8,
    padding: '12px 14px',
    background: 'rgba(245,239,223,0.04)',
    border: '1px solid rgba(245,239,223,0.08)',
    borderRadius: 6,
  },
  memberChip: {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '6px 10px',
    background: 'rgba(232,132,92,0.06)',
    borderRadius: 4,
    border: '1px solid rgba(232,132,92,0.18)',
  },
  chipName: { fontSize: 12, color: '#F5EFDF', fontWeight: 500 },
  chipMeta: {
    fontSize: 9, color: 'rgba(245,239,223,0.5)',
    textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  },
  titleRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  titleLabel: {
    fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase',
    color: 'rgba(245,239,223,0.55)', fontWeight: 600,
  },
  titleInput: {
    padding: '10px 12px',
    background: '#0E0A06', color: '#F5EFDF',
    border: '1px solid rgba(245,239,223,0.15)', borderRadius: 4,
    fontSize: 14, fontFamily: fonts.sans,
  },
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
    fontFamily: fonts.mono, fontSize: 12,
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
  copyTextBox: { fontSize: 14, color: '#F5EFDF', lineHeight: 1.5 },
  smallBtn: {
    alignSelf: 'flex-start', marginTop: 4,
    background: 'transparent', color: '#E8845C',
    border: 'none', cursor: 'pointer', fontSize: 11,
    letterSpacing: 1, textTransform: 'uppercase', padding: '4px 0',
  },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 6 },
  linkedInBtn: {
    flex: '1 0 auto',
    background: '#0A66C2', color: 'white',
    padding: '11px 18px', textDecoration: 'none',
    fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600,
    borderRadius: 4, textAlign: 'center',
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

void spacing; void colors;
