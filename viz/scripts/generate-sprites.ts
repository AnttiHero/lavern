/**
 * Sprite Sheet Generator — Procedural pixel art for The Shem's isometric office.
 *
 * Generates:
 *   public/sprites/agents/agents.png + agents.json    — 9 character sprite sheets
 *   public/sprites/rooms/tiles.png   + tiles.json     — isometric floor tiles
 *   public/sprites/rooms/furniture.png + furniture.json — office furniture
 *   public/sprites/ui/ui.png         + ui.json        — speech bubbles, icons
 *
 * Run: npx tsx scripts/generate-sprites.ts
 */

import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT_DIR = path.resolve(import.meta.dirname, '../public/sprites');

// ── Color Palette ─────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, { body: string; accent: string; skin: string }> = {
  'orchestrator':               { body: '#FFD700', accent: '#B8960F', skin: '#F5D0A9' },
  'design-reviewer':            { body: '#4FC3F7', accent: '#2196F3', skin: '#F5D0A9' },
  'ethics-auditor':             { body: '#EF5350', accent: '#C62828', skin: '#D4A574' },
  'transformation-specialist':  { body: '#66BB6A', accent: '#388E3C', skin: '#F5D0A9' },
  'meaning-guardian':           { body: '#AB47BC', accent: '#7B1FA2', skin: '#8D5524' },
  'synthesis-editor':           { body: '#FF7043', accent: '#D84315', skin: '#F5D0A9' },
  'service-designer':           { body: '#26C6DA', accent: '#00838F', skin: '#D4A574' },
  'plain-language-specialist':  { body: '#FFA726', accent: '#E65100', skin: '#F5D0A9' },
  'client-proxy':               { body: '#EC407A', accent: '#AD1457', skin: '#8D5524' },
};

const ROOM_COLORS: Record<string, { floor: string; floorLight: string; wall: string; wallDark: string; accent: string }> = {
  intake:                { floor: '#2a3a5e', floorLight: '#334872', wall: '#1e2d4a', wallDark: '#162040', accent: '#4FC3F7' },
  parallel_analysis:     { floor: '#2a3a5e', floorLight: '#334872', wall: '#1e2d4a', wallDark: '#162040', accent: '#66BB6A' },
  debate_1:              { floor: '#3a2a1a', floorLight: '#4a3828', wall: '#2e2015', wallDark: '#221810', accent: '#FFA726' },
  ethics_gate:           { floor: '#3a1a1a', floorLight: '#4a2828', wall: '#2e1515', wallDark: '#221010', accent: '#EF5350' },
  transformation:        { floor: '#1a3a1a', floorLight: '#284a28', wall: '#152e15', wallDark: '#102210', accent: '#66BB6A' },
  parallel_verification: { floor: '#1a1a3a', floorLight: '#28284a', wall: '#15152e', wallDark: '#101022', accent: '#AB47BC' },
  debate_2:              { floor: '#3a2a1a', floorLight: '#4a3828', wall: '#2e2015', wallDark: '#221810', accent: '#FFA726' },
  meaning_gate:          { floor: '#3a1a3a', floorLight: '#4a284a', wall: '#2e152e', wallDark: '#221022', accent: '#AB47BC' },
  synthesis:             { floor: '#3a3a1a', floorLight: '#4a4a28', wall: '#2e2e15', wallDark: '#222210', accent: '#FF7043' },
  final_gate:            { floor: '#1a3a2a', floorLight: '#284a38', wall: '#152e20', wallDark: '#102218', accent: '#FFD700' },
};

// ── Utility ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.floor(r * f)},${Math.floor(g * f)},${Math.floor(b * f)})`;
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.min(255, Math.floor(r + (255 - r) * amount))},${Math.min(255, Math.floor(g + (255 - g) * amount))},${Math.min(255, Math.floor(b + (255 - b) * amount))})`;
}

interface SpriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
}

function saveSheet(canvas: Canvas, frames: Record<string, SpriteFrame>, dir: string, name: string) {
  fs.mkdirSync(path.join(OUT_DIR, dir), { recursive: true });

  const pngPath = path.join(OUT_DIR, dir, `${name}.png`);
  const jsonPath = path.join(OUT_DIR, dir, `${name}.json`);

  fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));

  const meta = {
    frames,
    meta: {
      image: `${name}.png`,
      format: 'RGBA8888',
      size: { w: canvas.width, h: canvas.height },
      scale: 1,
    },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(meta, null, 2));
  console.log(`  → ${pngPath} (${canvas.width}×${canvas.height}, ${Object.keys(frames).length} frames)`);
}

// ── Agent Sprites ─────────────────────────────────────────────────────────

const AGENT_W = 32;
const AGENT_H = 48;
const DIRECTIONS = ['se', 'sw', 'ne', 'nw'] as const;

function drawAgentFrame(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  colors: { body: string; accent: string; skin: string },
  direction: typeof DIRECTIONS[number],
  walkFrame: number, // 0 = idle, 1-4 = walk cycle
) {
  const cx = x + AGENT_W / 2;
  const baseY = y + AGENT_H;
  const facingRight = direction === 'se' || direction === 'ne';
  const facingDown = direction === 'se' || direction === 'sw';

  // Shadow (ellipse on ground)
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 2, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  const legSpread = walkFrame === 0 ? 0 : Math.sin((walkFrame / 4) * Math.PI * 2) * 4;
  ctx.fillStyle = darken(colors.body, 0.3);

  // Left leg
  ctx.fillRect(cx - 5 - legSpread, baseY - 16, 4, 14);
  // Right leg
  ctx.fillRect(cx + 1 + legSpread, baseY - 16, 4, 14);

  // Shoes
  ctx.fillStyle = '#222';
  ctx.fillRect(cx - 6 - legSpread, baseY - 3, 5, 3);
  ctx.fillRect(cx + 1 + legSpread, baseY - 3, 5, 3);

  // Body (torso — jacket/shirt)
  ctx.fillStyle = colors.body;
  // Main torso
  ctx.fillRect(cx - 8, baseY - 30, 16, 16);
  // Shoulders
  ctx.fillRect(cx - 10, baseY - 30, 20, 4);

  // Accent stripe (belt/trim)
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - 8, baseY - 16, 16, 2);

  // Arms
  ctx.fillStyle = colors.body;
  const armSwing = walkFrame === 0 ? 0 : Math.sin((walkFrame / 4) * Math.PI * 2) * 3;
  // Left arm
  ctx.fillRect(cx - 12, baseY - 28 + armSwing, 4, 12);
  // Right arm
  ctx.fillRect(cx + 8, baseY - 28 - armSwing, 4, 12);

  // Hands
  ctx.fillStyle = colors.skin;
  ctx.fillRect(cx - 12, baseY - 17 + armSwing, 4, 3);
  ctx.fillRect(cx + 8, baseY - 17 - armSwing, 4, 3);

  // Head
  ctx.fillStyle = colors.skin;
  ctx.fillRect(cx - 6, baseY - 42, 12, 12);

  // Hair (varies by facing direction for depth illusion)
  ctx.fillStyle = darken(colors.body, 0.5);
  ctx.fillRect(cx - 7, baseY - 44, 14, 5);
  if (!facingDown) {
    ctx.fillRect(cx - 7, baseY - 44, 14, 8); // More hair visible from behind
  }

  // Face (only when facing camera)
  if (facingDown) {
    // Eyes
    ctx.fillStyle = '#222';
    const eyeX = facingRight ? 1 : -1;
    ctx.fillRect(cx - 3 + eyeX, baseY - 38, 2, 2);
    ctx.fillRect(cx + 2 + eyeX, baseY - 38, 2, 2);
    // Mouth
    ctx.fillRect(cx - 1 + eyeX, baseY - 34, 3, 1);
  }

  // Collar/neckline
  ctx.fillStyle = lighten(colors.body, 0.3);
  ctx.fillRect(cx - 3, baseY - 31, 6, 2);
}

function generateAgentSheets() {
  console.log('Generating agent sprites...');
  const agents = Object.keys(AGENT_COLORS);
  const framesPerAgent = 1 + DIRECTIONS.length * 4; // 1 idle + 4 dirs × 4 walk
  const cols = framesPerAgent;
  const rows = agents.length;

  const canvas = createCanvas(cols * AGENT_W, rows * AGENT_H);
  const ctx = canvas.getContext('2d');
  const frames: Record<string, SpriteFrame> = {};

  agents.forEach((role, rowIdx) => {
    const colors = AGENT_COLORS[role];
    let col = 0;

    // Idle frame (facing SE)
    const ix = col * AGENT_W;
    const iy = rowIdx * AGENT_H;
    drawAgentFrame(ctx, ix, iy, colors, 'se', 0);
    frames[`${role}-idle`] = {
      frame: { x: ix, y: iy, w: AGENT_W, h: AGENT_H },
      sourceSize: { w: AGENT_W, h: AGENT_H },
      spriteSourceSize: { x: 0, y: 0, w: AGENT_W, h: AGENT_H },
    };
    col++;

    // Walk frames for each direction
    for (const dir of DIRECTIONS) {
      for (let f = 1; f <= 4; f++) {
        const fx = col * AGENT_W;
        const fy = rowIdx * AGENT_H;
        drawAgentFrame(ctx, fx, fy, colors, dir, f);
        frames[`${role}-walk-${dir}-${f}`] = {
          frame: { x: fx, y: fy, w: AGENT_W, h: AGENT_H },
          sourceSize: { w: AGENT_W, h: AGENT_H },
          spriteSourceSize: { x: 0, y: 0, w: AGENT_W, h: AGENT_H },
        };
        col++;
      }
    }
  });

  saveSheet(canvas, frames, 'agents', 'agents');
}

// ── Room Tiles ────────────────────────────────────────────────────────────

const TILE_W = 64;
const TILE_H = 32;

function drawIsoDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);         // top
  ctx.lineTo(x + w, y + h / 2);     // right
  ctx.lineTo(x + w / 2, y + h);     // bottom
  ctx.lineTo(x, y + h / 2);         // left
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawWallLeft(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, fill: string, fillDark: string) {
  // Left-facing wall (parallelogram leaning left)
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y);                          // top-left of diamond
  ctx.lineTo(x + TILE_W / 2, y - TILE_H / 2); // top (diamond top)
  ctx.lineTo(x + TILE_W / 2, y - TILE_H / 2 - h); // wall top
  ctx.lineTo(x, y - h);                      // wall top-left
  ctx.closePath();
  ctx.fill();

  // Darker edge
  ctx.fillStyle = fillDark;
  ctx.fillRect(x, y - h, 2, h);
}

function drawWallRight(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, fill: string, fillDark: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + TILE_W / 2, y - TILE_H / 2);      // diamond top
  ctx.lineTo(x + TILE_W, y);                         // diamond right
  ctx.lineTo(x + TILE_W, y - h);                     // wall top-right
  ctx.lineTo(x + TILE_W / 2, y - TILE_H / 2 - h);   // wall top
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = fillDark;
  ctx.fillRect(x + TILE_W - 2, y - h, 2, h);
}

function generateTileSheets() {
  console.log('Generating room tiles...');
  const roomTypes = Object.keys(ROOM_COLORS);
  // Each room type: 1 floor tile + 1 floor-light tile + 1 wall-left + 1 wall-right = 4
  const cols = 4;
  const wallH = 40;
  const frameH = TILE_H + wallH; // tiles + wall space above
  const canvas = createCanvas(cols * TILE_W, roomTypes.length * frameH);
  const ctx = canvas.getContext('2d');
  const frames: Record<string, SpriteFrame> = {};

  roomTypes.forEach((type, row) => {
    const c = ROOM_COLORS[type];
    const yBase = row * frameH + wallH; // offset down for wall space

    // Floor tile (dark)
    drawIsoDiamond(ctx, 0, yBase, TILE_W, TILE_H, c.floor, darken(c.floor, 0.2));
    frames[`tile-${type}`] = {
      frame: { x: 0, y: row * frameH, w: TILE_W, h: frameH },
      sourceSize: { w: TILE_W, h: frameH },
      spriteSourceSize: { x: 0, y: 0, w: TILE_W, h: frameH },
    };

    // Floor tile (light — alternate checkerboard)
    drawIsoDiamond(ctx, TILE_W, yBase, TILE_W, TILE_H, c.floorLight, darken(c.floorLight, 0.15));
    frames[`tile-${type}-light`] = {
      frame: { x: TILE_W, y: row * frameH, w: TILE_W, h: frameH },
      sourceSize: { w: TILE_W, h: frameH },
      spriteSourceSize: { x: 0, y: 0, w: TILE_W, h: frameH },
    };

    // Wall left
    const wlx = TILE_W * 2;
    drawIsoDiamond(ctx, wlx, yBase, TILE_W, TILE_H, c.floor);
    drawWallLeft(ctx, wlx, yBase + TILE_H / 2, wallH, c.wall, c.wallDark);
    frames[`wall-${type}-left`] = {
      frame: { x: wlx, y: row * frameH, w: TILE_W, h: frameH },
      sourceSize: { w: TILE_W, h: frameH },
      spriteSourceSize: { x: 0, y: 0, w: TILE_W, h: frameH },
    };

    // Wall right
    const wrx = TILE_W * 3;
    drawIsoDiamond(ctx, wrx, yBase, TILE_W, TILE_H, c.floor);
    drawWallRight(ctx, wrx, yBase + TILE_H / 2, wallH, c.wall, c.wallDark);
    frames[`wall-${type}-right`] = {
      frame: { x: wrx, y: row * frameH, w: TILE_W, h: frameH },
      sourceSize: { w: TILE_W, h: frameH },
      spriteSourceSize: { x: 0, y: 0, w: TILE_W, h: frameH },
    };
  });

  saveSheet(canvas, frames, 'rooms', 'tiles');
}

// ── Furniture ─────────────────────────────────────────────────────────────

interface FurnitureDef {
  name: string;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
}

const FURNITURE: FurnitureDef[] = [
  {
    name: 'desk',
    w: 64, h: 48,
    draw: (ctx, x, y) => {
      // Isometric desk
      ctx.fillStyle = '#8B6914';
      // Desktop surface (diamond)
      drawIsoDiamond(ctx, x + 4, y + 10, 56, 20, '#A0782C', '#8B6914');
      // Left leg
      ctx.fillStyle = '#6B4E10';
      ctx.fillRect(x + 8, y + 20, 4, 20);
      // Right leg
      ctx.fillRect(x + 52, y + 20, 4, 20);
      // Front edge thickness
      ctx.fillStyle = '#7B5E18';
      ctx.fillRect(x + 8, y + 20, 48, 4);
    },
  },
  {
    name: 'computer',
    w: 32, h: 40,
    draw: (ctx, x, y) => {
      // Monitor
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 4, y + 4, 24, 18);
      // Screen
      ctx.fillStyle = '#1a3a2a';
      ctx.fillRect(x + 6, y + 6, 20, 14);
      // Screen glow lines
      ctx.fillStyle = '#4FC3F7';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + 8, y + 8 + i * 3, 16, 1);
      }
      // Stand
      ctx.fillStyle = '#555';
      ctx.fillRect(x + 13, y + 22, 6, 6);
      // Base
      ctx.fillRect(x + 8, y + 28, 16, 3);
      // Keyboard
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 4, y + 33, 24, 5);
      ctx.fillStyle = '#666';
      for (let kx = 0; kx < 5; kx++) {
        ctx.fillRect(x + 6 + kx * 4, y + 34, 3, 3);
      }
    },
  },
  {
    name: 'bookshelf',
    w: 48, h: 80,
    draw: (ctx, x, y) => {
      // Frame
      ctx.fillStyle = '#5D3A1A';
      ctx.fillRect(x + 2, y + 2, 44, 76);
      // Shelves
      ctx.fillStyle = '#7B4E2A';
      for (let s = 0; s < 4; s++) {
        ctx.fillRect(x + 4, y + 4 + s * 19, 40, 3);
      }
      // Books (colored spines)
      const bookColors = ['#EF5350', '#4FC3F7', '#66BB6A', '#FFA726', '#AB47BC', '#FF7043'];
      for (let s = 0; s < 3; s++) {
        for (let b = 0; b < 6; b++) {
          ctx.fillStyle = bookColors[(s + b) % bookColors.length];
          ctx.fillRect(x + 6 + b * 6, y + 7 + s * 19, 5, 15);
        }
      }
    },
  },
  {
    name: 'conference-table',
    w: 96, h: 48,
    draw: (ctx, x, y) => {
      // Large isometric table
      drawIsoDiamond(ctx, x + 8, y + 8, 80, 32, '#6B4E10', '#5A3D08');
      // Thickness
      ctx.fillStyle = '#5A3D08';
      ctx.beginPath();
      ctx.moveTo(x + 8 + 40, y + 8 + 32);
      ctx.lineTo(x + 8 + 80, y + 8 + 16);
      ctx.lineTo(x + 8 + 80, y + 8 + 20);
      ctx.lineTo(x + 8 + 40, y + 8 + 36);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 8 + 40, y + 8 + 32);
      ctx.lineTo(x + 8, y + 8 + 16);
      ctx.lineTo(x + 8, y + 8 + 20);
      ctx.lineTo(x + 8 + 40, y + 8 + 36);
      ctx.closePath();
      ctx.fill();
      // Papers on table
      ctx.fillStyle = '#f0f0e0';
      ctx.fillRect(x + 34, y + 18, 12, 8);
      ctx.fillRect(x + 50, y + 16, 10, 7);
    },
  },
  {
    name: 'gavel',
    w: 32, h: 32,
    draw: (ctx, x, y) => {
      // Gavel base
      ctx.fillStyle = '#5D3A1A';
      ctx.fillRect(x + 8, y + 20, 16, 8);
      // Handle
      ctx.fillStyle = '#7B4E2A';
      ctx.fillRect(x + 14, y + 8, 4, 16);
      // Head
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(x + 8, y + 4, 16, 8);
      // Strike plate
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 24, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    name: 'filing-cabinet',
    w: 32, h: 48,
    draw: (ctx, x, y) => {
      // Cabinet body
      ctx.fillStyle = '#555';
      ctx.fillRect(x + 4, y + 4, 24, 40);
      // Drawers
      ctx.fillStyle = '#666';
      for (let d = 0; d < 3; d++) {
        ctx.fillRect(x + 6, y + 6 + d * 13, 20, 11);
        // Handle
        ctx.fillStyle = '#999';
        ctx.fillRect(x + 13, y + 10 + d * 13, 6, 2);
        ctx.fillStyle = '#666';
      }
    },
  },
  {
    name: 'chair',
    w: 24, h: 32,
    draw: (ctx, x, y) => {
      // Seat
      ctx.fillStyle = '#334';
      drawIsoDiamond(ctx, x + 2, y + 16, 20, 10, '#2a2a3e', '#222238');
      // Back
      ctx.fillStyle = '#2a2a3e';
      ctx.fillRect(x + 4, y + 4, 4, 16);
      ctx.fillRect(x + 4, y + 2, 16, 4);
      // Legs
      ctx.fillStyle = '#555';
      ctx.fillRect(x + 5, y + 26, 2, 4);
      ctx.fillRect(x + 17, y + 26, 2, 4);
    },
  },
  {
    name: 'whiteboard',
    w: 48, h: 56,
    draw: (ctx, x, y) => {
      // Frame
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 4, y + 4, 40, 36);
      // White surface
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x + 6, y + 6, 36, 32);
      // Some scribbles
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 14);
      ctx.lineTo(x + 30, y + 12);
      ctx.moveTo(x + 10, y + 20);
      ctx.lineTo(x + 36, y + 19);
      ctx.moveTo(x + 10, y + 26);
      ctx.lineTo(x + 25, y + 25);
      ctx.stroke();
      // Stand legs
      ctx.fillStyle = '#666';
      ctx.fillRect(x + 10, y + 40, 3, 14);
      ctx.fillRect(x + 35, y + 40, 3, 14);
    },
  },
  {
    name: 'microscope',
    w: 32, h: 40,
    draw: (ctx, x, y) => {
      // Base
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 6, y + 28, 20, 8);
      // Stand
      ctx.fillStyle = '#555';
      ctx.fillRect(x + 14, y + 10, 4, 20);
      // Eyepiece
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 10, y + 4, 12, 8);
      // Lens
      ctx.fillStyle = '#4FC3F7';
      ctx.fillRect(x + 13, y + 26, 6, 4);
    },
  },
  {
    name: 'outbox',
    w: 40, h: 32,
    draw: (ctx, x, y) => {
      // Tray
      ctx.fillStyle = '#555';
      drawIsoDiamond(ctx, x + 4, y + 12, 32, 16, '#444', '#333');
      // Papers sticking out
      ctx.fillStyle = '#f0f0e0';
      ctx.save();
      ctx.translate(x + 14, y + 6);
      ctx.rotate(-0.1);
      ctx.fillRect(0, 0, 12, 16);
      ctx.restore();
      ctx.fillStyle = '#e8e8d8';
      ctx.save();
      ctx.translate(x + 18, y + 4);
      ctx.rotate(0.05);
      ctx.fillRect(0, 0, 12, 16);
      ctx.restore();
      // "DONE" stamp
      ctx.fillStyle = '#66BB6A';
      ctx.fillRect(x + 16, y + 10, 14, 5);
    },
  },
];

function generateFurnitureSheet() {
  console.log('Generating furniture sprites...');
  // Layout: one row of furniture items
  const totalW = FURNITURE.reduce((sum, f) => sum + f.w, 0);
  const maxH = Math.max(...FURNITURE.map(f => f.h));
  const canvas = createCanvas(totalW, maxH);
  const ctx = canvas.getContext('2d');
  const frames: Record<string, SpriteFrame> = {};

  let curX = 0;
  for (const furn of FURNITURE) {
    furn.draw(ctx, curX, maxH - furn.h); // align to bottom
    frames[furn.name] = {
      frame: { x: curX, y: maxH - furn.h, w: furn.w, h: furn.h },
      sourceSize: { w: furn.w, h: furn.h },
      spriteSourceSize: { x: 0, y: 0, w: furn.w, h: furn.h },
    };
    curX += furn.w;
  }

  saveSheet(canvas, frames, 'rooms', 'furniture');
}

// ── UI Sprites ────────────────────────────────────────────────────────────

function generateUISheet() {
  console.log('Generating UI sprites...');
  const canvas = createCanvas(256, 64);
  const ctx = canvas.getContext('2d');
  const frames: Record<string, SpriteFrame> = {};

  // Speech bubble background (9-slice ready)
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  // Main rect
  const bx = 0, by = 0, bw = 80, bh = 40;
  ctx.beginPath();
  ctx.moveTo(bx + 4, by);
  ctx.lineTo(bx + bw - 4, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 4);
  ctx.lineTo(bx + bw, by + bh - 4);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 4, by + bh);
  // Pointer
  ctx.lineTo(bx + bw / 2 + 6, by + bh);
  ctx.lineTo(bx + bw / 2, by + bh + 8);
  ctx.lineTo(bx + bw / 2 - 6, by + bh);
  ctx.lineTo(bx + 4, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 4);
  ctx.lineTo(bx, by + 4);
  ctx.quadraticCurveTo(bx, by, bx + 4, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  frames['speech-bubble'] = {
    frame: { x: 0, y: 0, w: 80, h: 48 },
    sourceSize: { w: 80, h: 48 },
    spriteSourceSize: { x: 0, y: 0, w: 80, h: 48 },
  };

  // Severity badges
  const badges = [
    { name: 'badge-red', color: '#EF5350' },
    { name: 'badge-yellow', color: '#FFA726' },
    { name: 'badge-green', color: '#66BB6A' },
  ];
  let bxOff = 84;
  for (const badge of badges) {
    ctx.fillStyle = badge.color;
    ctx.beginPath();
    ctx.arc(bxOff + 8, 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Courier New';
    ctx.fillText('!', bxOff + 5, 12);
    frames[badge.name] = {
      frame: { x: bxOff, y: 0, w: 16, h: 16 },
      sourceSize: { w: 16, h: 16 },
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
    };
    bxOff += 20;
  }

  // Status icons
  const statuses = [
    { name: 'status-idle', color: '#888' },
    { name: 'status-working', color: '#66BB6A' },
    { name: 'status-talking', color: '#4FC3F7' },
    { name: 'status-walking', color: '#FFA726' },
  ];
  let sxOff = 148;
  for (const st of statuses) {
    ctx.fillStyle = st.color;
    ctx.beginPath();
    ctx.arc(sxOff + 6, 6, 6, 0, Math.PI * 2);
    ctx.fill();
    frames[st.name] = {
      frame: { x: sxOff, y: 0, w: 12, h: 12 },
      sourceSize: { w: 12, h: 12 },
      spriteSourceSize: { x: 0, y: 0, w: 12, h: 12 },
    };
    sxOff += 16;
  }

  saveSheet(canvas, frames, 'ui', 'ui');
}

// ── Main ──────────────────────────────────────────────────────────────────

console.log('=== The Shem — Sprite Sheet Generator ===\n');
generateAgentSheets();
generateTileSheets();
generateFurnitureSheet();
generateUISheet();
console.log('\nDone! All sprite sheets generated.');
