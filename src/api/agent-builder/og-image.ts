/**
 * OG Image Renderer — produces a 1200×630 PNG card for an agent.
 *
 * The unfurl preview LinkedIn / Twitter / Slack show when someone shares
 * `/a/<token>`. The composition mirrors the in-app trading card: a cream
 * card on a dark Lavern backdrop, photographed-on-display style. Card has:
 *   - Top corner pills (cost tier + seniority)
 *   - Centered avatar
 *   - Serif name + tagline
 *   - Octagonal skills radar (8 axes — the showpiece)
 *   - Practice area pills
 *   - Rate + category footer
 *
 * Right panel of canvas: provenance overline + Lavern wordmark.
 *
 * Stack: satori (JSX-like → SVG, ~30 ms) + @resvg/resvg-js (SVG → PNG).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, 'fonts');

// Satori accepts an element-tree object; we avoid pulling in JSX/React.
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

// ── Provenance overline ────────────────────────────────────────────────

interface AgentProvenance {
  kind: 'self' | 'firm' | 'scratch' | 'goblin';
  firmName?: string;
}

function provenanceOverline(prov: AgentProvenance | undefined, ownerName: string): string {
  if (!prov) return ownerName ? `Made by ${ownerName}` : 'Made on Lavern';
  switch (prov.kind) {
    case 'self':    return ownerName ? `${ownerName} cloned themselves` : 'Self-portrait';
    case 'firm':    return prov.firmName ? `Cloned from ${prov.firmName}` : 'Cloned from a firm';
    case 'scratch': return ownerName ? `${ownerName} built this agent` : 'Built from scratch';
    case 'goblin':  return 'Summoned from the cellar';
  }
}

// ── Skill radar polygon points ─────────────────────────────────────────

const SKILL_ORDER = ['precision', 'creativity', 'speed', 'depth', 'negotiation', 'communication', 'research', 'risk'] as const;
const SKILL_SHORT: Record<string, string> = {
  precision: 'PRE', creativity: 'CRE', speed: 'SP', depth: 'DEP',
  negotiation: 'NEG', communication: 'COM', research: 'RES', risk: 'RSK',
};

interface RadarGeometry {
  /** Octagonal data polygon for the actual skill values. */
  dataPoints: string;
  /** Concentric outer octagon (10/10 reference). */
  outerPoints: string;
  /** Concentric inner ring at 5/10 for visual reference. */
  midPoints: string;
  /** Label positions outside the octagon. */
  labels: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
}

function buildRadar(skills: Record<string, number>, cx: number, cy: number, radius: number): RadarGeometry {
  // 8 axes evenly spaced; 0 at top, going clockwise.
  const dataPts: [number, number][] = [];
  const outerPts: [number, number][] = [];
  const midPts: [number, number][] = [];
  const labels: RadarGeometry['labels'] = [];

  SKILL_ORDER.forEach((key, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / SKILL_ORDER.length;
    const value = (skills[key] ?? 0) / 10;
    const r = radius * value;
    dataPts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    outerPts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    midPts.push([cx + radius * 0.5 * Math.cos(angle), cy + radius * 0.5 * Math.sin(angle)]);

    // Label position — slightly outside the radar
    const lr = radius + 18;
    const lx = cx + lr * Math.cos(angle);
    const ly = cy + lr * Math.sin(angle);
    const cosA = Math.cos(angle);
    const anchor: 'start' | 'middle' | 'end' = Math.abs(cosA) < 0.2 ? 'middle' : (cosA > 0 ? 'start' : 'end');
    labels.push({ x: lx, y: ly + 4, text: SKILL_SHORT[key] ?? key.toUpperCase().slice(0, 3), anchor });
  });

  const toStr = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return {
    dataPoints: toStr(dataPts),
    outerPoints: toStr(outerPts),
    midPoints: toStr(midPts),
    labels,
  };
}

// ── Element-tree builders ──────────────────────────────────────────────

interface AgentForOg {
  displayName: string;
  archetype: string;
  tagline: string;
  seenOnSite?: string;
  skills: Record<string, number>;
  practiceAreas?: string[];
  category?: string;
  seniority?: string;
  costTier?: string;
  billingRateUsd?: number;
  avatarUrl: string;
  provenance?: AgentProvenance;
}

const el = (type: string, style: Record<string, unknown>, children?: unknown, extraProps?: Record<string, unknown>): SatoriNode =>
  ({ type, key: null, props: { style, children, ...(extraProps ?? {}) } });

function pill(label: string, color: string, bg: string, icon?: string): SatoriNode {
  const children: unknown[] = [];
  if (icon) children.push(el('span', { color, fontSize: 13, marginRight: 5 }, icon));
  children.push(el('span', { color, fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }, label));
  return el('div', {
    display: 'flex', alignItems: 'center',
    background: bg,
    padding: '6px 14px', borderRadius: 999,
  }, children);
}

function practiceAreaPill(label: string): SatoriNode {
  return el('div', {
    display: 'flex',
    background: '#E8EFF5',
    color: '#2D6A8F',
    padding: '6px 14px', borderRadius: 999,
    fontSize: 13, fontWeight: 500,
  }, label);
}

function buildCard(agent: AgentForOg): SatoriNode {
  const cx = 220, cy = 156, radius = 110;
  const radar = buildRadar(agent.skills, cx, cy, radius);

  const radarSvg = el('svg', {
    width: 440, height: 312, display: 'flex',
  }, [
    // Outer octagon
    el('polygon', { fill: 'none', stroke: '#D6CFB8', strokeWidth: 1 }, undefined, {
      points: radar.outerPoints,
    }),
    // Mid ring (5/10)
    el('polygon', { fill: 'none', stroke: '#E8E0C8', strokeWidth: 1 }, undefined, {
      points: radar.midPoints,
    }),
    // 8 spokes
    ...SKILL_ORDER.map((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / SKILL_ORDER.length;
      return el('line', { stroke: '#E8E0C8', strokeWidth: 1 }, undefined, {
        x1: cx, y1: cy,
        x2: cx + radius * Math.cos(angle),
        y2: cy + radius * Math.sin(angle),
      });
    }),
    // Data polygon (filled)
    el('polygon', {
      fill: '#B47A3A', fillOpacity: 0.55,
      stroke: '#8B5A1F', strokeWidth: 2,
    }, undefined, { points: radar.dataPoints }),
    // (Axis labels rendered as div overlay below — satori doesn't support SVG <text>)
  ], { viewBox: '0 0 440 312', xmlns: 'http://www.w3.org/2000/svg' });

  const cardChildren: unknown[] = [
    // Top corner pills
    el('div', {
      display: 'flex', justifyContent: 'space-between',
      width: '100%',
    }, [
      pill(
        agent.costTier?.toUpperCase() || 'OPUS',
        '#8B5A1F',
        '#FBF1DC',
        '◆',
      ),
      pill(
        capitalise(agent.seniority || 'Partner'),
        '#3A2F1E',
        '#F2EBD8',
        '★',
      ),
    ]),

    // Avatar
    el('div', {
      width: 132, height: 132, borderRadius: '50%',
      background: '#F2EBD8',
      border: '1px solid #E0D6BC',
      marginTop: 14, alignSelf: 'center',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }, el('img', { width: 132, height: 132, objectFit: 'cover' })),

    // Name
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: 36, fontWeight: 500,
      color: '#1A140A', lineHeight: 1.05, marginTop: 16,
      textAlign: 'center', width: '100%',
    }, agent.displayName),

    // Tagline
    el('div', {
      fontSize: 16, color: 'rgba(43,36,24,0.65)', textAlign: 'center', width: '100%',
      marginTop: 6, lineHeight: 1.35, fontStyle: 'italic', fontFamily: 'Cormorant Garamond',
    }, agent.tagline),

    // Radar (with axis labels as absolute-positioned overlay)
    el('div', {
      display: 'flex', justifyContent: 'center', width: '100%', marginTop: 6,
      position: 'relative',
    }, [
      radarSvg,
      // Axis label overlays — satori doesn't support SVG <text>, so we
      // position div labels around the polygon by computing their angles.
      ...radar.labels.map(l => {
        // Convert SVG coords to relative position inside the 440×312 wrapper
        const left = l.x;
        const top  = l.y - 8;
        const dx = l.anchor === 'middle' ? -16 : (l.anchor === 'end' ? -32 : 0);
        return el('div', {
          position: 'absolute',
          left: left + dx, top,
          fontSize: 11, fontWeight: 700, color: '#9A8E76',
          letterSpacing: 1.2,
          width: 32, textAlign: l.anchor === 'middle' ? 'center' : (l.anchor === 'end' ? 'right' : 'left'),
        }, l.text);
      }),
    ]),
  ];

  // Practice area pills (max 3)
  if (agent.practiceAreas && agent.practiceAreas.length > 0) {
    cardChildren.push(el('div', {
      display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
      width: '100%', marginTop: 4,
    }, agent.practiceAreas.slice(0, 3).map(p => practiceAreaPill(p))));
  }

  // Footer: rate + category
  cardChildren.push(el('div', {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginTop: 'auto', paddingTop: 14,
    borderTop: '1px solid #ECE3CC',
  }, [
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: 22, color: '#1A140A', fontWeight: 500,
    }, agent.billingRateUsd ? `$${agent.billingRateUsd.toLocaleString()}/hr` : 'Pro bono'),
    el('div', {
      fontSize: 13, color: '#2D6A8F', fontWeight: 500, letterSpacing: 0.5,
    }, capitalise(agent.category || 'Lawyer')),
  ]));

  return el('div', {
    width: 480, height: 580,
    background: 'linear-gradient(180deg, #FBF7EE 0%, #F5EFDF 100%)',
    border: '1px solid #DCD2BB',
    borderRadius: 18,
    padding: '24px 28px',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
  }, cardChildren);
}

function capitalise(s: string): string {
  return s.split(/[\s-]/).map(w => w.length ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

function buildSidePanel(agent: AgentForOg, ownerName: string): SatoriNode {
  const overline = provenanceOverline(agent.provenance, ownerName);
  const quote = (agent.seenOnSite || '').slice(0, 240);

  const children: unknown[] = [
    // Provenance overline
    el('div', {
      fontSize: 14, letterSpacing: 3, textTransform: 'uppercase',
      color: '#E8845C', fontWeight: 700,
    }, overline),

    // Archetype as serif h2
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: 50, fontWeight: 500,
      color: '#FAF7F0', lineHeight: 1.05, marginTop: 12, letterSpacing: -0.5,
    }, agent.archetype || agent.displayName),
  ];

  if (quote) {
    children.push(el('div', {
      fontFamily: 'Cormorant Garamond', fontStyle: 'italic',
      fontSize: 22, color: 'rgba(245,239,223,0.78)', lineHeight: 1.4,
      marginTop: 18, marginBottom: 'auto',
    }, `"${quote}"`));
  } else {
    children.push(el('div', { display: 'flex', flex: 1 }, ' '));
  }

  // Lavern wordmark at bottom
  children.push(el('div', {
    display: 'flex', flexDirection: 'column', gap: 4,
    marginTop: 24,
  }, [
    el('div', {
      fontFamily: 'Cormorant Garamond', fontSize: 30, color: '#FAF7F0',
      letterSpacing: 6, fontWeight: 500,
    }, 'LAVERN'),
    el('div', {
      fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
      color: 'rgba(232,132,92,0.85)',
    }, 'lavern.ai · share your team'),
  ]));

  return el('div', {
    flex: 1, display: 'flex', flexDirection: 'column',
    paddingLeft: 48, paddingTop: 12, paddingBottom: 12,
  }, children);
}

function buildScene(agent: AgentForOg, ownerName: string): SatoriNode {
  return el('div', {
    width: 1200, height: 630,
    display: 'flex', flexDirection: 'row',
    background: 'linear-gradient(135deg, #0A0806 0%, #14100A 60%, #1A140A 100%)',
    color: '#F5EFDF',
    padding: '40px 60px',
    fontFamily: 'Inter',
    alignItems: 'center',
  }, [
    buildCard(agent),
    buildSidePanel(agent, ownerName),
  ]);
}

// ── Public renderer ─────────────────────────────────────────────────────

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`avatar fetch failed: HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${ct};base64,${buf.toString('base64')}`;
}

function patchAvatarSrc(node: unknown, src: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as { type?: string; props?: { src?: string; children?: unknown } };
  if (n.type === 'img' && n.props) {
    n.props.src = src;
    return true;
  }
  if (n.props?.children) {
    const kids = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
    for (const kid of kids) {
      if (patchAvatarSrc(kid, src)) return true;
    }
  }
  return false;
}

export async function renderAgentOgPng(agent: AgentForOg, ownerName: string): Promise<Buffer> {
  const fonts = loadFonts();

  let avatarDataUri: string;
  try {
    avatarDataUri = await fetchAsDataUri(agent.avatarUrl);
  } catch {
    avatarDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }

  const tree = buildScene(agent, ownerName);
  patchAvatarSrc(tree, avatarDataUri);

  const svg = await satori(tree as never, {
    width: 1200, height: 630,
    fonts: fonts as never,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  }).render().asPng();

  return Buffer.from(png);
}
