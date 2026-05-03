/**
 * OG Image Renderer — produces a 1200×627 PNG card for an agent.
 *
 * The unfurl preview LinkedIn / Twitter / Slack show when someone shares
 * `/a/<token>`. The card has to make people stop scrolling.
 *
 * Stack:
 *   - satori — JSX-like element tree → SVG, ~30 ms
 *   - @resvg/resvg-js — SVG → PNG, ~10 ms
 *
 * Aesthetic: Lavern editorial-cinematic — #080808 bg, #E8845C accent,
 * Cormorant Garamond serif for the name, Inter sans for the supporting
 * type. Avatar large on the left, name + archetype right, receipt quote
 * below, three top stats as a small constellation, Lavern wordmark
 * lower right.
 *
 * Provenance drives the small overline:
 *   - self      → "Self-portrait"
 *   - firm      → "Cloned from {firmName}"
 *   - scratch   → "Built from scratch"
 *   - goblin    → "Summoned from the cellar"
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Local type alias — satori accepts any tree of these element-shape objects.
// We avoid pulling in @types/react just for this single typename.
type SatoriNode = unknown;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, 'fonts');

// Lazy-load fonts once per process
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
  if (!prov) return ownerName ? `Made by ${ownerName} on Lavern` : 'Made on Lavern';
  switch (prov.kind) {
    case 'self':    return ownerName ? `${ownerName} cloned themselves` : 'Self-portrait';
    case 'firm':    return prov.firmName ? `Cloned from ${prov.firmName}` : 'Cloned from a firm';
    case 'scratch': return ownerName ? `${ownerName} built this agent` : 'Built from scratch';
    case 'goblin':  return 'Summoned from the cellar';
  }
}

// ── Top-3 skill picker ──────────────────────────────────────────────────

const SKILL_LABELS: Record<string, string> = {
  precision: 'Precision', creativity: 'Creativity', speed: 'Speed', depth: 'Depth',
  negotiation: 'Negotiation', communication: 'Communication', research: 'Research', risk: 'Risk',
};

function topThreeSkills(skills: Record<string, number>): { label: string; value: number }[] {
  return Object.entries(skills)
    .map(([key, value]) => ({ label: SKILL_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

// ── JSX-like element tree (no JSX runtime; using satori's helper shape) ──

interface AgentForOg {
  displayName: string;
  archetype: string;
  tagline: string;
  seenOnSite?: string;
  skills: Record<string, number>;
  avatarUrl: string;
  provenance?: AgentProvenance;
}

/** Build the satori element tree. Returns an object that satori accepts. */
function buildCardElement(agent: AgentForOg, ownerName: string): SatoriNode {
  const overline = provenanceOverline(agent.provenance, ownerName);
  const top3 = topThreeSkills(agent.skills);
  const quote = (agent.seenOnSite || agent.tagline || '').slice(0, 220);

  // satori accepts an element-shape object (h() style). We construct it
  // manually to avoid pulling in a JSX runtime in pure backend code.
  // Each element: { type, props: { style, children } }
  const el = (type: string, style: Record<string, unknown>, children?: unknown): SatoriNode =>
    ({ type, key: null, props: { style, children } });

  return el('div', {
    width: 1200, height: 627,
    display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(135deg, #0A0806 0%, #14100A 100%)',
    color: '#F5EFDF',
    padding: '52px 64px',
    fontFamily: 'Inter',
    position: 'relative',
  }, [
    // Provenance overline (top)
    el('div', {
      fontSize: 16, letterSpacing: 4, textTransform: 'uppercase',
      color: '#E8845C', fontWeight: 700,
    }, overline),

    // Main row: avatar left, name + tagline right
    el('div', {
      display: 'flex', flexDirection: 'row',
      marginTop: 36, gap: 40,
      alignItems: 'flex-start', flex: 1,
    }, [
      // Avatar
      el('div', {
        width: 200, height: 200,
        borderRadius: '50%',
        background: '#1A140A',
        border: '2px solid rgba(232,132,92,0.4)',
        display: 'flex',
        overflow: 'hidden',
        flexShrink: 0,
      }, el('img', { width: 200, height: 200, objectFit: 'cover' })),

      // Name + tagline column
      el('div', {
        display: 'flex', flexDirection: 'column', flex: 1, gap: 8,
      }, [
        el('div', {
          fontFamily: 'Cormorant Garamond',
          fontSize: 78, fontWeight: 500, lineHeight: 1.0,
          color: '#FAF7F0', letterSpacing: -1,
        }, agent.displayName),
        el('div', {
          fontSize: 18, letterSpacing: 2, textTransform: 'uppercase',
          color: '#E8845C', fontWeight: 700, marginTop: 4,
        }, agent.archetype),
        el('div', {
          fontFamily: 'Cormorant Garamond', fontStyle: 'italic',
          fontSize: 26, color: 'rgba(245,239,223,0.78)',
          lineHeight: 1.35, marginTop: 14,
        }, `"${quote}"`),
      ]),
    ]),

    // Bottom row: top-3 stats left, Lavern wordmark right
    el('div', {
      display: 'flex', flexDirection: 'row',
      justifyContent: 'space-between', alignItems: 'flex-end',
      marginTop: 28,
    }, [
      el('div', {
        display: 'flex', flexDirection: 'row', gap: 32,
      }, top3.map(s => el('div', {
        display: 'flex', flexDirection: 'column', gap: 2,
      }, [
        el('div', { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(245,239,223,0.5)' }, s.label),
        el('div', { fontFamily: 'Cormorant Garamond', fontSize: 36, color: '#FAF7F0', lineHeight: 1 }, `${s.value}/10`),
      ]))),
      el('div', {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
      }, [
        el('div', { fontFamily: 'Cormorant Garamond', fontSize: 26, color: '#FAF7F0', letterSpacing: 2, fontWeight: 500 }, 'LAVERN'),
        el('div', { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(232,132,92,0.7)' }, 'lavern.ai'),
      ]),
    ]),
  ]);
}

// ── Public renderer ─────────────────────────────────────────────────────

/**
 * Fetch an image URL and return it as a data: URI so satori can size it
 * synchronously. PNG and JPEG only — DiceBear PNG endpoint works perfectly.
 */
async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`avatar fetch failed: HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${ct};base64,${buf.toString('base64')}`;
}

/**
 * Render an agent share card as a 1200×627 PNG buffer.
 * The avatarUrl can be any HTTP(S) URL (DiceBear PNG, /goblin.png served by us).
 * We pre-fetch and embed as a data URI so satori can size it synchronously.
 */
export async function renderAgentOgPng(agent: AgentForOg, ownerName: string): Promise<Buffer> {
  const fonts = loadFonts();

  // Pre-fetch avatar so satori knows its dimensions without a remote call.
  let avatarDataUri: string;
  try {
    avatarDataUri = await fetchAsDataUri(agent.avatarUrl);
  } catch {
    // Fall back to a 1×1 transparent PNG if the avatar fetch fails — better
    // than 500ing the OG endpoint.
    avatarDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }

  const tree = buildCardElement(agent, ownerName);
  patchAvatarSrc(tree, avatarDataUri);

  const svg = await satori(tree as never, {
    width: 1200, height: 627,
    fonts: fonts as never,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  }).render().asPng();

  return Buffer.from(png);
}

/** Walk the tree and set src on the first <img> element we find. */
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
