/**
 * OfficeScene — Main Phaser scene for the isometric office.
 *
 * Renders 10 themed rooms in a grid layout using Kenney isometric sprites.
 * Each room has:
 * - Floor tiles (checkerboard)
 * - Two walls (back-left, back-right) drawn as Graphics
 * - Kenney furniture sprites placed at fixed slots
 * - Agent characters that move between rooms via tweens
 *
 * Rooms are drawn in a 3-col × 4-row grid with the final gate centered.
 */

import Phaser from 'phaser';
import type { ShemEvent, WorkflowStep } from '../types/events.js';
import {
  STEP_LABELS, AGENT_COLORS, AGENT_LABELS,
} from '../types/events.js';

/* ═══ Constants ═══════════════════════════════════════════════════════════ */

const TILE_W = 128;   // Kenney tiles are 256×512 but we'll use sprite scaling
const TILE_H = 64;

const ROOM_TILES_X = 6;
const ROOM_TILES_Y = 6;

const WALL_H = 180;
const FLOOR_THICK = 10;

const ROOM_GAP_X = 100;
const ROOM_GAP_Y = 80;

/** Scale for Kenney 256×512 sprites to fit our tile grid */
const SPRITE_SCALE = 0.42;
const CHAR_SCALE = 0.35;

/* ═══ Types ═══════════════════════════════════════════════════════════════ */

interface RoomDef {
  step: WorkflowStep;
  label: string;
  col: number;
  row: number;
  accent: number;
  floorColor: number;
  floorAlt: number;
  wallL: number;
  wallR: number;
  furniture: { name: string; tx: number; ty: number }[];
}

interface RoomState {
  def: RoomDef;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

interface AgentState {
  role: string;
  sprite: Phaser.GameObjects.Container;
  bodyGfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  statusDot: Phaser.GameObjects.Graphics;
  color: number;
  status: string;
  currentRoom: WorkflowStep;
}

/* ═══ Room Definitions ════════════════════════════════════════════════════ */

const ROOMS: RoomDef[] = [
  { step: 'intake',                label: STEP_LABELS.intake,                col: 0, row: 0, accent: 0x4FC3F7, floorColor: 0x8899AA, floorAlt: 0x7A8B9C, wallL: 0x8E94A8, wallR: 0xB0B6CC, furniture: [
    { name: 'longTableDecoratedChairs', tx: 3, ty: 3 }, { name: 'libraryChair', tx: 1, ty: 1 }, { name: 'bookcaseBooks', tx: 5, ty: 1 }, { name: 'candleStand', tx: 1, ty: 4 }] },
  { step: 'parallel_analysis',     label: STEP_LABELS.parallel_analysis,     col: 1, row: 0, accent: 0x66BB6A, floorColor: 0x7A9B7A, floorAlt: 0x6C8D6C, wallL: 0x7E9A82, wallR: 0xA0BCA6, furniture: [
    { name: 'bookcaseBooks', tx: 5, ty: 0 }, { name: 'longTableChairs', tx: 3, ty: 3 }, { name: 'displayCaseBooks', tx: 1, ty: 1 }, { name: 'bookStand', tx: 1, ty: 4 }] },
  { step: 'debate_1',              label: STEP_LABELS.debate_1,              col: 2, row: 0, accent: 0xFFA726, floorColor: 0xB09878, floorAlt: 0xA28A6A, wallL: 0xA89880, wallR: 0xCCBCA4, furniture: [
    { name: 'longTableLarge', tx: 3, ty: 3 }, { name: 'libraryChair', tx: 1, ty: 1 }, { name: 'candleStandDouble', tx: 5, ty: 1 }, { name: 'bookStand', tx: 1, ty: 5 }] },
  { step: 'ethics_gate',           label: STEP_LABELS.ethics_gate,           col: 0, row: 1, accent: 0xEF5350, floorColor: 0xAA8888, floorAlt: 0x9C7A7A, wallL: 0xA88888, wallR: 0xCCAAAA, furniture: [
    { name: 'bookcaseWideBooks', tx: 5, ty: 0 }, { name: 'longTableDecorated', tx: 3, ty: 3 }, { name: 'candleStandDouble', tx: 1, ty: 1 }, { name: 'displayCase', tx: 1, ty: 5 }] },
  { step: 'transformation',        label: STEP_LABELS.transformation,        col: 1, row: 1, accent: 0x66BB6A, floorColor: 0x88AA88, floorAlt: 0x7A9C7A, wallL: 0x88A88C, wallR: 0xAACCAE, furniture: [
    { name: 'longTableDecoratedChairsBooks', tx: 3, ty: 3 }, { name: 'bookcaseHalfBooks', tx: 5, ty: 0 }, { name: 'bookStandEmpty', tx: 1, ty: 1 }, { name: 'crate', tx: 1, ty: 5 }] },
  { step: 'parallel_verification', label: STEP_LABELS.parallel_verification, col: 2, row: 1, accent: 0xAB47BC, floorColor: 0x9988AA, floorAlt: 0x8B7A9C, wallL: 0x9888A8, wallR: 0xBAAACC, furniture: [
    { name: 'displayCase', tx: 5, ty: 1 }, { name: 'longTableChairs', tx: 3, ty: 3 }, { name: 'bookcaseGlass', tx: 1, ty: 1 }, { name: 'candleStand', tx: 1, ty: 5 }] },
  { step: 'debate_2',              label: STEP_LABELS.debate_2,              col: 0, row: 2, accent: 0xFFA726, floorColor: 0xB0A078, floorAlt: 0xA2926A, wallL: 0xA8A080, wallR: 0xCCC4A4, furniture: [
    { name: 'longTableLarge', tx: 3, ty: 3 }, { name: 'libraryChair', tx: 1, ty: 1 }, { name: 'candleStand', tx: 5, ty: 1 }, { name: 'bookStand', tx: 1, ty: 5 }] },
  { step: 'meaning_gate',          label: STEP_LABELS.meaning_gate,          col: 1, row: 2, accent: 0xAB47BC, floorColor: 0x9988AA, floorAlt: 0x8B7A9C, wallL: 0x9080A8, wallR: 0xB4A8CC, furniture: [
    { name: 'bookcaseWideBooksDesk', tx: 5, ty: 0 }, { name: 'longTableDecorated', tx: 3, ty: 3 }, { name: 'displayCaseSword', tx: 1, ty: 1 }, { name: 'candleStandDouble', tx: 1, ty: 5 }] },
  { step: 'synthesis',             label: STEP_LABELS.synthesis,             col: 2, row: 2, accent: 0xFF7043, floorColor: 0xAA9488, floorAlt: 0x9C867A, wallL: 0xA89488, wallR: 0xCCB8AA, furniture: [
    { name: 'longTableDecoratedChairsBooks', tx: 3, ty: 3 }, { name: 'bookcaseBooks', tx: 5, ty: 0 }, { name: 'crate', tx: 1, ty: 1 }, { name: 'bookStand', tx: 1, ty: 5 }] },
  { step: 'final_gate',            label: 'Final Gate',                      col: 1, row: 3, accent: 0xFFD700, floorColor: 0xAAAA88, floorAlt: 0x9C9C7A, wallL: 0xA8A888, wallR: 0xCCCCAA, furniture: [
    { name: 'longTableDecoratedChairs', tx: 3, ty: 3 }, { name: 'candleStandDouble', tx: 1, ty: 1 }, { name: 'displayCase', tx: 5, ty: 1 }] },
];

const ALL_AGENTS = [
  'design-reviewer', 'ethics-auditor', 'service-designer',
  'plain-language-specialist', 'client-proxy',
  'transformation-specialist', 'meaning-guardian', 'synthesis-editor',
];

const SKIN_TONES = [0xFFDDBB, 0xF4C8A0, 0xD4A373, 0xC49A6C, 0xA67C52, 0x8B6544];

/* ═══ Helpers ═════════════════════════════════════════════════════════════ */

function tileToScreen(tx: number, ty: number): { x: number; y: number } {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2),
  };
}

function roomOrigin(col: number, row: number): { x: number; y: number } {
  const spanX = ROOM_TILES_X * TILE_W / 2 + ROOM_TILES_Y * TILE_W / 2;
  const spanY = ROOM_TILES_X * TILE_H / 2 + ROOM_TILES_Y * TILE_H / 2 + WALL_H;
  let x = col * (spanX + ROOM_GAP_X);
  const y = row * (spanY + ROOM_GAP_Y);
  if (row === 3) x = 1 * (spanX + ROOM_GAP_X);
  return { x, y };
}

function numToHexStr(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function darken(c: number, amt = 0.3): number {
  const r = Math.max(0, ((c >> 16) & 0xff) * (1 - amt));
  const g = Math.max(0, ((c >> 8) & 0xff) * (1 - amt));
  const b = Math.max(0, (c & 0xff) * (1 - amt));
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function lighten(c: number, amt = 0.3): number {
  const r = Math.min(255, ((c >> 16) & 0xff) + (255 - ((c >> 16) & 0xff)) * amt);
  const g = Math.min(255, ((c >> 8) & 0xff) + (255 - ((c >> 8) & 0xff)) * amt);
  const b = Math.min(255, (c & 0xff) + (255 - (c & 0xff)) * amt);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/* ═══ Scene ═══════════════════════════════════════════════════════════════ */

export class OfficeScene extends Phaser.Scene {
  private rooms = new Map<string, RoomState>();
  private agents = new Map<string, AgentState>();
  private activeStep: WorkflowStep = 'intake';

  constructor() {
    super({ key: 'OfficeScene' });
  }

  /* ── Preload ────────────────────────────────────────────────────────── */

  preload(): void {
    const base = 'sprites/kenney';

    // Furniture sprites
    const furnitureNames = [
      'bookcaseBooks', 'bookcaseGlass', 'bookcaseHalfBooks', 'bookcaseWideBooks',
      'bookcaseWideBooksDesk', 'longTableChairs', 'longTableDecoratedChairs',
      'longTableDecoratedChairsBooks', 'longTable', 'longTableLarge',
      'longTableDecorated', 'libraryChair', 'bookStand', 'bookStandEmpty',
      'displayCaseBooks', 'displayCase', 'displayCaseSword', 'candleStand',
      'candleStandDouble', 'crate',
    ];

    for (const name of furnitureNames) {
      this.load.image(`${name}_S`, `${base}/furniture/${name}_S.png`);
    }

    // Character sprite sheet — load all idle and run frames for variant 0
    for (let v = 0; v < 8; v++) {
      this.load.image(`Human_${v}_Idle0`, `${base}/chars/Human_${v}_Idle0.png`);
      for (let f = 0; f < 10; f++) {
        this.load.image(`Human_${v}_Run${f}`, `${base}/chars/Human_${v}_Run${f}.png`);
      }
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */

  create(): void {
    // Build all rooms
    for (const def of ROOMS) {
      this.buildRoom(def);
    }

    // Alias 'delivered' → 'final_gate'
    const fg = this.rooms.get('final_gate');
    if (fg) this.rooms.set('delivered', fg);

    // Create agents in intake room
    ALL_AGENTS.forEach((role, i) => {
      this.createAgent(role, i);
    });

    // Fit camera to world
    this.fitCamera();

    // Enable mouse wheel zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.2, 2);
      cam.setZoom(newZoom);
    });

    // Enable camera drag
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        const cam = this.cameras.main;
        cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
        cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
      }
    });

    // Highlight intake room
    this.setActiveRoom('intake');
  }

  /* ── Build Room ─────────────────────────────────────────────────────── */

  private buildRoom(def: RoomDef): void {
    const origin = roomOrigin(def.col, def.row);

    // Draw floor
    this.drawFloor(def, origin);
    // Draw walls
    this.drawWalls(def, origin);
    // Place furniture sprites
    this.placeFurniture(def, origin);
    // Room label
    this.drawLabel(def, origin);

    // Calculate center for agent placement
    const center = tileToScreen(ROOM_TILES_X / 2, ROOM_TILES_Y / 2);

    this.rooms.set(def.step, {
      def,
      x: origin.x,
      y: origin.y,
      centerX: origin.x + center.x,
      centerY: origin.y + center.y,
    });
  }

  private drawFloor(def: RoomDef, origin: { x: number; y: number }): void {
    const gfx = this.add.graphics();

    for (let tx = 0; tx < ROOM_TILES_X; tx++) {
      for (let ty = 0; ty < ROOM_TILES_Y; ty++) {
        const pos = tileToScreen(tx, ty);
        const sx = origin.x + pos.x;
        const sy = origin.y + pos.y;
        const isLight = (tx + ty) % 2 === 0;
        const topColor = isLight ? def.floorColor : def.floorAlt;

        // Top face
        gfx.fillStyle(topColor, 1);
        gfx.beginPath();
        gfx.moveTo(sx + TILE_W / 2, sy);
        gfx.lineTo(sx + TILE_W,     sy + TILE_H / 2);
        gfx.lineTo(sx + TILE_W / 2, sy + TILE_H);
        gfx.lineTo(sx,              sy + TILE_H / 2);
        gfx.closePath();
        gfx.fillPath();

        // Right edge (3D thickness)
        gfx.fillStyle(darken(topColor, 0.25), 1);
        gfx.beginPath();
        gfx.moveTo(sx + TILE_W,     sy + TILE_H / 2);
        gfx.lineTo(sx + TILE_W / 2, sy + TILE_H);
        gfx.lineTo(sx + TILE_W / 2, sy + TILE_H + FLOOR_THICK);
        gfx.lineTo(sx + TILE_W,     sy + TILE_H / 2 + FLOOR_THICK);
        gfx.closePath();
        gfx.fillPath();

        // Left edge
        gfx.fillStyle(darken(topColor, 0.35), 1);
        gfx.beginPath();
        gfx.moveTo(sx,              sy + TILE_H / 2);
        gfx.lineTo(sx + TILE_W / 2, sy + TILE_H);
        gfx.lineTo(sx + TILE_W / 2, sy + TILE_H + FLOOR_THICK);
        gfx.lineTo(sx,              sy + TILE_H / 2 + FLOOR_THICK);
        gfx.closePath();
        gfx.fillPath();

        // Subtle grid line
        gfx.lineStyle(0.5, 0x000000, 0.06);
        gfx.beginPath();
        gfx.moveTo(sx + TILE_W / 2, sy);
        gfx.lineTo(sx + TILE_W,     sy + TILE_H / 2);
        gfx.lineTo(sx + TILE_W / 2, sy + TILE_H);
        gfx.lineTo(sx,              sy + TILE_H / 2);
        gfx.closePath();
        gfx.strokePath();
      }
    }

    gfx.setDepth(-10);
  }

  private drawWalls(def: RoomDef, origin: { x: number; y: number }): void {
    const gfx = this.add.graphics();
    const hw = TILE_W / 2;

    const corner = tileToScreen(0, 0);
    const cx = origin.x + corner.x + hw;
    const cy = origin.y + corner.y;

    const leftEnd = tileToScreen(ROOM_TILES_X, 0);
    const lx = origin.x + leftEnd.x + hw;
    const ly = origin.y + leftEnd.y;

    const rightEnd = tileToScreen(0, ROOM_TILES_Y);
    const rx = origin.x + rightEnd.x + hw;
    const ry = origin.y + rightEnd.y;

    // Back-left wall
    gfx.fillStyle(def.wallL, 1);
    gfx.beginPath();
    gfx.moveTo(cx, cy);
    gfx.lineTo(lx, ly);
    gfx.lineTo(lx, ly - WALL_H);
    gfx.lineTo(cx, cy - WALL_H);
    gfx.closePath();
    gfx.fillPath();

    // Left wall top cap
    gfx.fillStyle(darken(def.wallL, 0.15), 1);
    gfx.beginPath();
    gfx.moveTo(cx, cy - WALL_H);
    gfx.lineTo(lx, ly - WALL_H);
    gfx.lineTo(lx + 8, ly - WALL_H - 4);
    gfx.lineTo(cx + 8, cy - WALL_H - 4);
    gfx.closePath();
    gfx.fillPath();

    // Back-right wall
    gfx.fillStyle(def.wallR, 1);
    gfx.beginPath();
    gfx.moveTo(cx, cy);
    gfx.lineTo(rx, ry);
    gfx.lineTo(rx, ry - WALL_H);
    gfx.lineTo(cx, cy - WALL_H);
    gfx.closePath();
    gfx.fillPath();

    // Right wall top cap
    gfx.fillStyle(darken(def.wallR, 0.15), 1);
    gfx.beginPath();
    gfx.moveTo(cx, cy - WALL_H);
    gfx.lineTo(rx, ry - WALL_H);
    gfx.lineTo(rx - 8, ry - WALL_H - 4);
    gfx.lineTo(cx - 8, cy - WALL_H - 4);
    gfx.closePath();
    gfx.fillPath();

    // Corner cap diamond
    gfx.fillStyle(darken(def.wallL, 0.25), 1);
    gfx.beginPath();
    gfx.moveTo(cx, cy - WALL_H);
    gfx.lineTo(cx + 8, cy - WALL_H - 4);
    gfx.lineTo(cx, cy - WALL_H - 8);
    gfx.lineTo(cx - 8, cy - WALL_H - 4);
    gfx.closePath();
    gfx.fillPath();

    // Vertical corner edge
    gfx.lineStyle(2, darken(def.wallL, 0.3), 1);
    gfx.beginPath();
    gfx.moveTo(cx, cy - WALL_H);
    gfx.lineTo(cx, cy);
    gfx.strokePath();

    // Wainscoting lines
    const wainY = WALL_H * 0.35;
    gfx.lineStyle(1, lighten(def.wallL, 0.1), 0.25);
    gfx.beginPath();
    gfx.moveTo(cx, cy - wainY);
    gfx.lineTo(lx, ly - wainY);
    gfx.strokePath();

    gfx.lineStyle(1, lighten(def.wallR, 0.1), 0.2);
    gfx.beginPath();
    gfx.moveTo(cx, cy - wainY);
    gfx.lineTo(rx, ry - wainY);
    gfx.strokePath();

    // Panel lines on left wall
    for (let tx = 1; tx < ROOM_TILES_X; tx++) {
      const tp = tileToScreen(tx, 0);
      const px = origin.x + tp.x + hw;
      const py = origin.y + tp.y;
      gfx.lineStyle(0.5, lighten(def.wallL, 0.15), 0.2);
      gfx.beginPath();
      gfx.moveTo(px, py - WALL_H + 16);
      gfx.lineTo(px, py - 6);
      gfx.strokePath();
    }

    // Panel lines on right wall
    for (let ty = 1; ty < ROOM_TILES_Y; ty++) {
      const tp = tileToScreen(0, ty);
      const px = origin.x + tp.x + hw;
      const py = origin.y + tp.y;
      gfx.lineStyle(0.5, lighten(def.wallR, 0.15), 0.15);
      gfx.beginPath();
      gfx.moveTo(px, py - WALL_H + 16);
      gfx.lineTo(px, py - 6);
      gfx.strokePath();
    }

    // Accent trim on wall top
    gfx.lineStyle(3, def.accent, 0.7);
    gfx.beginPath();
    gfx.moveTo(cx, cy - WALL_H);
    gfx.lineTo(lx, ly - WALL_H);
    gfx.strokePath();

    gfx.lineStyle(2, def.accent, 0.5);
    gfx.beginPath();
    gfx.moveTo(cx, cy - WALL_H);
    gfx.lineTo(rx, ry - WALL_H);
    gfx.strokePath();

    gfx.setDepth(-20);
  }

  private placeFurniture(def: RoomDef, origin: { x: number; y: number }): void {
    for (const furn of def.furniture) {
      const pos = tileToScreen(furn.tx, furn.ty);
      const sx = origin.x + pos.x + TILE_W / 2;
      const sy = origin.y + pos.y + TILE_H / 2;

      const texKey = `${furn.name}_S`;
      if (this.textures.exists(texKey)) {
        const sprite = this.add.image(sx, sy, texKey);
        sprite.setScale(SPRITE_SCALE);
        sprite.setOrigin(0.5, 0.85);  // anchor near bottom
        sprite.setDepth(sy);
      }
    }
  }

  private drawLabel(def: RoomDef, origin: { x: number; y: number }): void {
    const labelTile = tileToScreen(ROOM_TILES_X / 2, 0);
    const lx = origin.x + labelTile.x + TILE_W / 2;
    const ly = origin.y + labelTile.y - WALL_H - 14;

    // Shadow
    this.add.text(lx + 1, ly + 1, def.label, {
      fontFamily: 'Courier New, monospace',
      fontSize: '14px',
      color: '#000000',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setAlpha(0.5).setDepth(1000);

    // Label
    this.add.text(lx, ly, def.label, {
      fontFamily: 'Courier New, monospace',
      fontSize: '14px',
      color: numToHexStr(def.accent),
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(1001);
  }

  /* ── Agents ─────────────────────────────────────────────────────────── */

  private createAgent(role: string, index: number): void {
    const color = AGENT_COLORS[role] || 0xcccccc;
    const room = this.rooms.get('intake')!;
    const pos = this.getAgentSlot(room, index);

    const container = this.add.container(pos.x, pos.y);

    // Character body (graphics — Habbo-style chibi)
    const body = this.add.graphics();
    this.drawCharacter(body, color, index);
    container.add(body);

    // Name label
    const label = this.add.text(0, 10, AGENT_LABELS[role] || role, {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: numToHexStr(color),
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    container.add(label);

    // Status dot
    const statusDot = this.add.graphics();
    statusDot.fillStyle(0x888888, 1);
    statusDot.fillCircle(18, -58, 4);
    statusDot.lineStyle(1, 0x000000, 1);
    statusDot.strokeCircle(18, -58, 4);
    container.add(statusDot);

    container.setDepth(pos.y);

    this.agents.set(role, {
      role,
      sprite: container,
      bodyGfx: body,
      label,
      statusDot,
      color,
      status: 'idle',
      currentRoom: 'intake',
    });
  }

  private drawCharacter(g: Phaser.GameObjects.Graphics, color: number, index: number): void {
    const skin = SKIN_TONES[index % SKIN_TONES.length];
    const OL = 0x222222;

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 2, 22, 8);

    // Shoes
    g.fillStyle(0x333333, 1);
    g.fillRoundedRect(-8, -6, 7, 6, 1);
    g.fillRoundedRect(1, -6, 7, 6, 1);

    // Legs
    g.fillStyle(darken(color, 0.4), 1);
    g.fillRect(-8, -20, 7, 15);
    g.fillRect(1, -20, 7, 15);
    g.lineStyle(1, OL, 1);
    g.strokeRect(-8, -20, 7, 15);
    g.strokeRect(1, -20, 7, 15);

    // Torso
    g.fillStyle(color, 1);
    g.fillRoundedRect(-10, -40, 20, 22, 3);
    g.lineStyle(1, OL, 1);
    g.strokeRoundedRect(-10, -40, 20, 22, 3);

    // Torso highlight
    g.fillStyle(lighten(color, 0.2), 0.5);
    g.fillRoundedRect(-9, -39, 10, 10, 2);

    // Arms
    g.fillStyle(darken(color, 0.1), 1);
    g.fillRoundedRect(-15, -38, 6, 16, 2);
    g.fillRoundedRect(9, -38, 6, 16, 2);
    g.lineStyle(1, OL, 1);
    g.strokeRoundedRect(-15, -38, 6, 16, 2);
    g.strokeRoundedRect(9, -38, 6, 16, 2);

    // Hands
    g.fillStyle(skin, 1);
    g.fillCircle(-12, -21, 4);
    g.fillCircle(12, -21, 4);

    // Head
    g.fillStyle(skin, 1);
    g.fillCircle(0, -52, 12);
    g.lineStyle(1, OL, 1);
    g.strokeCircle(0, -52, 12);

    // Hair
    const hairColor = [0x222222, 0x4A3728, 0x8B6914, 0xBB4444, 0x333366, 0x666666, 0xAA6633, 0x2A1B0F][index % 8];
    g.fillStyle(hairColor, 1);
    g.beginPath();
    g.arc(0, -52, 12, Math.PI, 0, false);
    g.lineTo(12, -52);
    g.arc(0, -52, 12, 0, -Math.PI * 0.15, true);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, OL, 1);
    g.beginPath();
    g.arc(0, -52, 12, Math.PI, -Math.PI * 0.15, false);
    g.strokePath();

    // Eyes
    g.fillStyle(0x222222, 1);
    g.fillRect(-6, -55, 4, 4);
    g.fillRect(2, -55, 4, 4);
    // Eye highlights
    g.fillStyle(0xFFFFFF, 1);
    g.fillRect(-5, -55, 2, 2);
    g.fillRect(3, -55, 2, 2);

    // Mouth
    g.lineStyle(1, darken(skin, 0.3), 1);
    g.beginPath();
    g.moveTo(-3, -46);
    g.lineTo(3, -46);
    g.strokePath();
  }

  private getAgentSlot(room: RoomState, index: number): { x: number; y: number } {
    const slotsPerRow = 4;
    const col = index % slotsPerRow;
    const row = Math.floor(index / slotsPerRow);
    const tileX = 1.5 + col * 1.1;
    const tileY = 2.0 + row * 1.5;
    const screen = tileToScreen(tileX, tileY);
    return {
      x: room.x + screen.x + TILE_W / 2,
      y: room.y + screen.y + TILE_H / 2,
    };
  }

  /* ── Camera ─────────────────────────────────────────────────────────── */

  private fitCamera(): void {
    // Calculate world bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const room of this.rooms.values()) {
      const tl = tileToScreen(0, 0);
      const br = tileToScreen(ROOM_TILES_X, ROOM_TILES_Y);
      minX = Math.min(minX, room.x + tl.x - 50);
      minY = Math.min(minY, room.y + tl.y - WALL_H - 50);
      maxX = Math.max(maxX, room.x + br.x + TILE_W + 50);
      maxY = Math.max(maxY, room.y + br.y + TILE_H + FLOOR_THICK + 50);
    }

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const cam = this.cameras.main;
    const zoomX = cam.width / worldW;
    const zoomY = cam.height / worldH;
    const zoom = Math.min(zoomX, zoomY, 1.0);

    cam.setZoom(zoom);
    cam.centerOn(minX + worldW / 2, minY + worldH / 2);
  }

  /* ── Event Handling ─────────────────────────────────────────────────── */

  handleEvent(event: ShemEvent): void {
    switch (event.type) {
      case 'session_start':
        this.setActiveRoom('intake');
        break;

      case 'workflow_step':
        this.setActiveRoom(event.step);
        break;

      case 'agent_start':
        this.moveAgent(event.role, this.activeStep);
        this.setAgentStatus(event.role, 'working');
        break;

      case 'agent_stop':
        this.setAgentStatus(event.role, 'idle');
        this.showSpeechBubble(event.role, `Done (${(event.durationMs / 1000).toFixed(1)}s)`);
        break;

      case 'finding_posted':
        this.setAgentStatus(event.agent, 'talking');
        this.showSpeechBubble(event.agent, `[${event.severity}] ${event.category}`);
        break;

      case 'challenge_posted':
        this.setAgentStatus(event.challenger, 'talking');
        this.showSpeechBubble(event.challenger, `Challenge!`);
        break;

      case 'debate_resolved':
        this.showRoomEffect(this.activeStep, 0x66BB6A);
        break;

      case 'gate_requested':
        this.showRoomEffect(this.activeStep, 0xFFD700);
        break;

      case 'gate_decided':
        this.showRoomEffect(this.activeStep, event.decision === 'approve' ? 0x66BB6A : 0xEF5350);
        break;

      case 'session_end':
        ALL_AGENTS.forEach((role, i) => {
          this.moveAgent(role, 'final_gate', i);
          this.setAgentStatus(role, 'celebrating');
        });
        break;
    }
  }

  private setActiveRoom(step: WorkflowStep): void {
    this.activeStep = step;
  }

  private moveAgent(role: string, step: WorkflowStep, slotOverride?: number): void {
    const agent = this.agents.get(role);
    if (!agent) return;

    const room = this.rooms.get(step);
    if (!room) return;

    const index = slotOverride ?? ALL_AGENTS.indexOf(role);
    const pos = this.getAgentSlot(room, index);

    agent.currentRoom = step;

    // Tween-based movement — smooth!
    this.tweens.add({
      targets: agent.sprite,
      x: pos.x,
      y: pos.y,
      duration: 800 + Math.random() * 400,
      ease: 'Power2',
      onUpdate: () => {
        agent.sprite.setDepth(agent.sprite.y);
      },
    });
  }

  private setAgentStatus(role: string, status: string): void {
    const agent = this.agents.get(role);
    if (!agent) return;
    agent.status = status;

    const colors: Record<string, number> = {
      idle: 0x888888,
      working: 0x66BB6A,
      talking: 0x4FC3F7,
      walking: 0xFFA726,
      celebrating: 0xFFD700,
    };

    agent.statusDot.clear();
    agent.statusDot.fillStyle(colors[status] || 0x888888, 1);
    agent.statusDot.fillCircle(18, -58, 4);
    agent.statusDot.lineStyle(1, 0x000000, 1);
    agent.statusDot.strokeCircle(18, -58, 4);

    // Celebration bounce
    if (status === 'celebrating') {
      this.tweens.add({
        targets: agent.sprite,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 300,
        yoyo: true,
        repeat: 3,
        ease: 'Bounce',
      });
    }
  }

  private showSpeechBubble(role: string, text: string): void {
    const agent = this.agents.get(role);
    if (!agent) return;

    const display = text.length > 28 ? text.slice(0, 25) + '...' : text;

    const bg = this.add.graphics();
    const txt = this.add.text(0, 0, display, {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#000000',
      wordWrap: { width: 140 },
    }).setOrigin(0.5, 0.5);

    const w = txt.width + 14;
    const h = txt.height + 10;

    bg.fillStyle(0xffffff, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    bg.lineStyle(1, 0x333333, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 5);

    // Pointer triangle
    bg.fillStyle(0xffffff, 1);
    bg.beginPath();
    bg.moveTo(-4, h / 2);
    bg.lineTo(0, h / 2 + 6);
    bg.lineTo(4, h / 2);
    bg.closePath();
    bg.fillPath();

    const bubble = this.add.container(
      agent.sprite.x,
      agent.sprite.y - 80,
      [bg, txt]
    );
    bubble.setDepth(5000);
    bubble.setAlpha(0);

    // Fade in
    this.tweens.add({
      targets: bubble,
      alpha: 1,
      y: bubble.y - 5,
      duration: 200,
      ease: 'Power2',
    });

    // Fade out after delay
    this.time.delayedCall(2500, () => {
      this.tweens.add({
        targets: bubble,
        alpha: 0,
        y: bubble.y - 10,
        duration: 300,
        ease: 'Power2',
        onComplete: () => bubble.destroy(),
      });
    });
  }

  private showRoomEffect(step: WorkflowStep, color: number): void {
    const room = this.rooms.get(step);
    if (!room) return;

    const gfx = this.add.graphics();
    gfx.fillStyle(color, 0.3);
    gfx.fillCircle(room.centerX, room.centerY, 30);
    gfx.setDepth(4000);

    this.tweens.add({
      targets: gfx,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => gfx.destroy(),
    });
  }
}
