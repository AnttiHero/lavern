/**
 * Team OG Image Renderer — produces a 1200×630 PNG of a TEAM lineup,
 * showing the FRONT card of each member (1-6 agents) on a single canvas.
 *
 * Layout adapts to count:
 *   1 agent → one large card, centered (460×540)
 *   2       → two cards side by side (440×540)
 *   3       → three in a row (340×540)
 *   4       → 2×2 grid (compact landscape cards 460×260)
 *   5-6     → 3×2 grid (compact landscape cards 340×260)
 *
 * Compact card variant: avatar + name + tagline + top-3 skills + footer.
 * No radar (would be illegible at small sizes), no personality, no bars —
 * the goal is to communicate "who's on the team," not the deep-stats view.
 *
 * Stack: shares fonts + el helper with og-image.ts.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, 'fonts');

type SatoriNode = unknown;

let fontsCache: Array<{ name: string; data: Buffer; weight: 400 | 500 | 700; style: 'normal' | 'italic' }> | null = null;
function loadFonts() {
  if (fontsCache) return fontsCache;
  fontsCache = [
    { name: 'Inter',              data: readFileSync(join(FONTS_DIR, 'Inter-Regular.ttf')),              weight: 400, style: 'normal' },
    { name: 'Inter',              data: readFileSync(join(FONTS_DIR, 'Inter-Bold.ttf')),                 weight: 700, style: 'normal' },
    { name: 'Cormorant Garamond', data: readFileSync(join(FONTS_DIR, 'CormorantGaramond-Regular.ttf')), weight: 500, style: 'normal' },
    { name: 'Cormorant Garamond', data: readFileSync(join(FONTS_DIR, 'CormorantGaramond-Italic.ttf')),  weight: 500, style: 'italic' },
  ];
  return fontsCache;
}

const el = (type: string, style: Record<string, unknown>, children?: unknown, extraProps?: Record<string, unknown>): SatoriNode =>
  ({ type, key: null, props: { style, children, ...(extraProps ?? {}) } });

function capitalise(s: string): string {
  return s.split(/[\s-]/).map(w => w.length ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

// ── Member input ───────────────────────────────────────────────────────

export interface TeamMemberForOg {
  displayName: string;
  tagline: string;
  category?: string;
  seniority?: string;
  costTier?: string;
  billingRateUsd?: number;
  practiceAreas?: string[];
  skills?: Record<string, number>;
  avatarUrl: string;
  /** Pre-fetched data URI for the avatar (used by patchAvatar in renderer). */
  avatarDataUri?: string;
}

const SKILL_PRETTY: Record<string, string> = {
  precision: 'Precision', creativity: 'Creativity', speed: 'Speed', depth: 'Depth',
  negotiation: 'Negotiation', communication: 'Communication', research: 'Research', risk: 'Risk',
};

function topSkills(skills: Record<string, number> | undefined, n: number): Array<{ key: string; value: number }> {
  if (!skills) return [];
  return Object.entries(skills)
    .map(([key, value]) => ({ key, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

// ── Pieces ──────────────────────────────────────────────────────────────

function pill(label: string, color: string, bg: string, fontSize = 10): SatoriNode {
  return el('div', {
    display: 'flex', alignItems: 'center',
    background: bg, color,
    padding: '3px 9px', borderRadius: 999,
    fontSize, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
  }, label);
}

function practicePill(label: string, fontSize = 10): SatoriNode {
  return el('div', {
    display: 'flex',
    background: '#E8EFF5',
    color: '#2D6A8F',
    padding: '3px 9px', borderRadius: 999,
    fontSize, fontWeight: 500,
  }, label);
}

function skillChip(label: string, value: number): SatoriNode {
  return el('div', {
    display: 'flex', alignItems: 'baseline', gap: 4,
    fontFamily: 'Inter',
  }, [
    el('span', {
      fontSize: 16, fontWeight: 700, color: '#1A140A', fontFamily: 'Cormorant Garamond',
    }, String(value)),
    el('span', {
      fontSize: 8, color: 'rgba(43,36,24,0.6)', letterSpacing: 0.8, textTransform: 'uppercase',
    }, label),
  ]);
}

// ── Card variants ───────────────────────────────────────────────────────

/** Tall portrait card. Used for 1-3 member layouts. */
function buildPortraitCard(agent: TeamMemberForOg, width: number, height: number, scale: number): SatoriNode {
  const avatarSize = Math.round(78 * scale);
  const nameSize = Math.round(22 * scale);
  const taglineSize = Math.max(11, Math.round(13 * scale));
  const top3 = topSkills(agent.skills, 3);

  const children: unknown[] = [
    // Top pills
    el('div', {
      display: 'flex', justifyContent: 'space-between', width: '100%',
    }, [
      pill(agent.costTier || 'opus', '#8B5A1F', '#FBF1DC'),
      pill(capitalise(agent.seniority || 'partner'), '#3A2F1E', '#F2EBD8'),
    ]),

    // Avatar
    el('div', {
      display: 'flex', justifyContent: 'center', width: '100%', marginTop: 14,
    }, el('div', {
      width: avatarSize, height: avatarSize, borderRadius: avatarSize,
      background: '#F2EBD8', border: '1px solid #E0D6BC',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }, el('img', { width: avatarSize, height: avatarSize, objectFit: 'cover' }))),

    // Name
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: nameSize, fontWeight: 500,
      color: '#1A140A', lineHeight: 1.1, marginTop: 12,
      textAlign: 'center', width: '100%',
    }, agent.displayName),

    // Tagline
    el('div', {
      fontSize: taglineSize, color: 'rgba(43,36,24,0.6)', textAlign: 'center', width: '100%',
      marginTop: 4, lineHeight: 1.35, fontStyle: 'italic', fontFamily: 'Cormorant Garamond',
      paddingLeft: 6, paddingRight: 6,
    }, agent.tagline),

    // Top-3 skills row
    top3.length > 0 && el('div', {
      display: 'flex', justifyContent: 'space-around', alignItems: 'baseline',
      width: '100%', marginTop: 18,
      paddingTop: 12, borderTop: '1px solid #ECE3CC',
    }, top3.map(s => skillChip(SKILL_PRETTY[s.key] ?? s.key, s.value))),
  ].filter(Boolean);

  // Practice area pills
  if (agent.practiceAreas && agent.practiceAreas.length > 0) {
    children.push(el('div', {
      display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center',
      width: '100%', marginTop: 12,
    }, agent.practiceAreas.slice(0, 2).map(p => practicePill(p))));
  }

  // Footer — rate + category
  children.push(el('div', {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginTop: 'auto', paddingTop: 10,
    borderTop: '1px solid #ECE3CC',
  }, [
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: Math.round(17 * scale), color: '#1A140A', fontWeight: 500,
    }, agent.billingRateUsd ? `$${agent.billingRateUsd.toLocaleString()}/hr` : 'Pro bono'),
    el('div', {
      fontSize: 10, color: '#2D6A8F', fontWeight: 500, letterSpacing: 0.5,
    }, capitalise(agent.category || 'Lawyer')),
  ]));

  return el('div', {
    width, height,
    background: 'linear-gradient(180deg, #FBF7EE 0%, #F5EFDF 100%)',
    border: '1px solid #DCD2BB',
    borderRadius: 16,
    padding: '18px 20px',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 18px 36px rgba(0,0,0,0.35)',
  }, children);
}

/** Compact landscape card. Used for 4-6 member layouts. */
function buildLandscapeCard(agent: TeamMemberForOg, width: number, height: number): SatoriNode {
  const avatarSize = 56;
  const top2 = topSkills(agent.skills, 2);

  return el('div', {
    width, height,
    background: 'linear-gradient(180deg, #FBF7EE 0%, #F5EFDF 100%)',
    border: '1px solid #DCD2BB',
    borderRadius: 14,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 24px rgba(0,0,0,0.3)',
  }, [
    // Top row: avatar + name/tagline
    el('div', {
      display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'center', width: '100%',
    }, [
      el('div', {
        width: avatarSize, height: avatarSize, borderRadius: avatarSize,
        background: '#F2EBD8', border: '1px solid #E0D6BC',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        flexShrink: 0,
      }, el('img', { width: avatarSize, height: avatarSize, objectFit: 'cover' })),
      el('div', {
        display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0,
      }, [
        el('div', {
          fontFamily: 'Cormorant Garamond', fontSize: 18, fontWeight: 500, color: '#1A140A', lineHeight: 1.15,
        }, agent.displayName),
        el('div', {
          fontSize: 10, color: 'rgba(43,36,24,0.55)', marginTop: 2,
          fontFamily: 'Inter', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600,
        }, `${capitalise(agent.seniority || 'partner')} · ${capitalise(agent.category || 'Lawyer')}`),
      ]),
    ]),

    // Tagline
    el('div', {
      fontSize: 11, color: 'rgba(43,36,24,0.7)', marginTop: 10,
      lineHeight: 1.35, fontStyle: 'italic', fontFamily: 'Cormorant Garamond',
    }, agent.tagline.length > 90 ? agent.tagline.slice(0, 88) + '…' : agent.tagline),

    // Top-2 skills
    top2.length > 0 && el('div', {
      display: 'flex', gap: 14, marginTop: 'auto', paddingTop: 10,
      borderTop: '1px solid #ECE3CC',
    }, top2.map(s => skillChip(SKILL_PRETTY[s.key] ?? s.key, s.value))),
  ].filter(Boolean));
}

// ── Layout ──────────────────────────────────────────────────────────────

interface LayoutSpec {
  card: 'portrait' | 'landscape';
  width: number;
  height: number;
  scale: number;
  /** Items per row, used to wrap. */
  perRow: number;
  gap: number;
}

function pickLayout(count: number): LayoutSpec {
  if (count === 1) return { card: 'portrait', width: 460, height: 540, scale: 1.0, perRow: 1, gap: 0 };
  if (count === 2) return { card: 'portrait', width: 440, height: 540, scale: 1.0, perRow: 2, gap: 32 };
  if (count === 3) return { card: 'portrait', width: 340, height: 540, scale: 0.85, perRow: 3, gap: 22 };
  if (count === 4) return { card: 'landscape', width: 460, height: 230, scale: 1.0, perRow: 2, gap: 22 };
  // 5 or 6
  return { card: 'landscape', width: 340, height: 230, scale: 0.9, perRow: 3, gap: 18 };
}

// ── Scene ───────────────────────────────────────────────────────────────

function buildScene(
  agents: TeamMemberForOg[],
  ownerName: string,
  title: string,
): SatoriNode {
  const layout = pickLayout(agents.length);

  // Build cards
  const cards = agents.map(a => layout.card === 'portrait'
    ? buildPortraitCard(a, layout.width, layout.height, layout.scale)
    : buildLandscapeCard(a, layout.width, layout.height));

  // Group into rows.
  const rows: SatoriNode[] = [];
  for (let i = 0; i < cards.length; i += layout.perRow) {
    rows.push(el('div', {
      display: 'flex', flexDirection: 'row',
      gap: layout.gap,
      justifyContent: 'center',
    }, cards.slice(i, i + layout.perRow)));
  }

  const grid = el('div', {
    display: 'flex', flexDirection: 'column', gap: 18,
    alignItems: 'center', justifyContent: 'center',
  }, rows);

  // Header strip — title + owner.
  const titleStrip = el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%',
  }, [
    el('div', {
      fontSize: 10, letterSpacing: 4, color: 'rgba(245,239,223,0.55)', fontWeight: 700,
      textTransform: 'uppercase',
    }, ownerName ? `${ownerName}'s lineup · Lavern` : 'A Lavern Lineup'),
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: 28, fontWeight: 500,
      color: '#FAF7F0', marginTop: 6, fontStyle: 'italic',
      textAlign: 'center', maxWidth: 1100,
    }, title || 'My Team'),
  ]);

  return el('div', {
    width: 1200, height: 630,
    display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(135deg, #0A0806 0%, #14100A 60%, #1A140A 100%)',
    fontFamily: 'Inter',
    padding: '28px 24px 16px',
    alignItems: 'center', justifyContent: 'space-between',
    position: 'relative',
  }, [
    titleStrip,
    grid,
    // Wordmark — bottom-center
    el('div', {
      display: 'flex', justifyContent: 'center',
      fontSize: 10, letterSpacing: 5, color: 'rgba(245,239,223,0.4)',
      fontFamily: 'Cormorant Garamond',
    }, agents.length === 1 ? 'LAVERN' : `LAVERN · ${agents.length} MEMBERS`),
  ]);
}

// ── Avatar fetch + tree patch ───────────────────────────────────────────

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`avatar fetch failed: HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${ct};base64,${buf.toString('base64')}`;
}

/** Walk the satori tree and patch each `<img>` in order with the supplied URIs. */
function patchAllAvatarSrcs(node: unknown, srcs: string[]): void {
  let cursor = 0;
  function walk(n: unknown): void {
    if (cursor >= srcs.length) return;
    if (!n || typeof n !== 'object') return;
    const obj = n as { type?: string; props?: { src?: string; children?: unknown } };
    if (obj.type === 'img' && obj.props) {
      obj.props.src = srcs[cursor++];
      return;
    }
    if (obj.props?.children) {
      const kids = Array.isArray(obj.props.children) ? obj.props.children : [obj.props.children];
      for (const kid of kids) walk(kid);
    }
  }
  walk(node);
}

const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ── Public renderer ─────────────────────────────────────────────────────

export async function renderTeamOgPng(
  agents: TeamMemberForOg[],
  ownerName: string,
  title: string,
): Promise<Buffer> {
  if (agents.length === 0) throw new Error('Cannot render an empty team.');
  if (agents.length > 6) agents = agents.slice(0, 6);

  const fonts = loadFonts();

  // Fetch all avatars in parallel; fall back to transparent on failure.
  const avatarUris = await Promise.all(agents.map(async a => {
    try { return await fetchAsDataUri(a.avatarUrl); }
    catch { return TRANSPARENT_PNG; }
  }));

  const tree = buildScene(agents, ownerName, title);
  patchAllAvatarSrcs(tree, avatarUris);

  const svg = await satori(tree as never, {
    width: 1200, height: 630,
    fonts: fonts as never,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  }).render().asPng();

  return Buffer.from(png);
}
