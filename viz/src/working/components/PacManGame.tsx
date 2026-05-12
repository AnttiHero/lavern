/**
 * PacManGame — A polished Pac-Man mini-game for the working screen.
 *
 * The hero is the Lavern "L" — a serif letter that glides through the maze
 * eating pellets. Smooth sub-pixel interpolation between grid cells gives
 * buttery 60fps movement. Four colored ghosts with chase/scatter AI.
 *
 * Controls: Arrow keys to move, Escape or X to close.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

// ── Types ──────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';
type GameState = 'ready' | 'playing' | 'won' | 'dead' | 'gameover';

interface Entity {
  /** Grid position (integer cell coords) */
  gx: number;
  gy: number;
  /** Visual position (sub-pixel, lerps toward grid pos) */
  vx: number;
  vy: number;
  dir: Direction;
}

interface Ghost extends Entity {
  color: string;
  scared: boolean;
  scaredFlash: boolean;
}

interface Pac extends Entity {
  nextDir: Direction;
  mouthPhase: number; // 0–1 oscillating
}

// ── Constants ──────────────────────────────────────────────────────────

const COLS = 15;
const ROWS = 15;
const CELL = 22;
const W = COLS * CELL;
const H = ROWS * CELL;
const HALF = CELL / 2;

// 0 = wall, 1 = pellet, 2 = empty, 3 = power pellet, 4 = ghost house
const MAZE_TEMPLATE: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,0,1,1,1,1,1,1,0],
  [0,3,0,0,1,0,1,1,1,0,1,0,0,3,0],
  [0,1,0,0,1,0,1,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,0,0,1,0,0,1,0],
  [0,1,1,1,1,0,4,4,4,0,1,1,1,1,0],
  [0,0,0,0,1,0,4,4,4,0,1,0,0,0,0],
  [0,1,1,1,1,0,0,1,0,0,1,1,1,1,0],
  [0,1,0,0,1,1,1,1,1,1,1,0,0,1,0],
  [0,1,0,0,1,0,0,0,0,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,3,0,0,1,1,1,0,1,1,1,0,0,3,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

const GHOST_COLORS = ['#FF4444', '#FFB8FF', '#44FFFF', '#FFB852'];
const M_COLOR = colors.accent; // Lavern terracotta
const WALL_FILL = '#161638';
const WALL_EDGE = '#2a2a7a';
const PELLET_COLOR = 'rgba(255, 190, 170, 0.8)';
const POWER_COLOR = '#FFFFFF';
const BG_COLOR = '#0a0a14';
const SCARED_COLOR = '#2121DE';
const SCARED_FLASH = '#FFFFFF';

const START_POS = { x: 7, y: 9 };
const GHOST_STARTS = [
  { x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }, { x: 7, y: 7 },
];

const TICK_MS = 130;           // grid movement interval
const LERP_SPEED = 0.18;      // visual interpolation per frame (0–1)
const SCARED_TICKS = 35;
const LIVES = 3;

// ── Helpers ────────────────────────────────────────────────────────────

const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
  none:  { dx: 0,  dy: 0 },
};

const ALL_DIRS: Direction[] = ['up', 'down', 'left', 'right'];

function cloneMaze(): number[][] {
  return MAZE_TEMPLATE.map(row => [...row]);
}

function countPellets(maze: number[][]): number {
  let n = 0;
  for (const row of maze) for (const c of row) if (c === 1 || c === 3) n++;
  return n;
}

function canMove(maze: number[][], x: number, y: number, dir: Direction, isPac = false): boolean {
  if (dir === 'none') return false;
  const d = DIR_DELTA[dir];
  const nx = x + d.dx;
  const ny = y + d.dy;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
  const cell = maze[ny][nx];
  if (cell === 0) return false;
  // Pac-Man cannot enter the ghost house
  if (isPac && cell === 4) return false;
  return true;
}

function opposite(dir: Direction): Direction {
  if (dir === 'up') return 'down';
  if (dir === 'down') return 'up';
  if (dir === 'left') return 'right';
  if (dir === 'right') return 'left';
  return 'none';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wallAt(maze: number[][], c: number, r: number): boolean {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
  return maze[r][c] === 0;
}

// ── Component ──────────────────────────────────────────────────────────

export function PacManGame({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Game state in refs for animation loop
  const mazeRef = useRef(cloneMaze());
  const pacRef = useRef<Pac>({
    gx: START_POS.x, gy: START_POS.y,
    vx: START_POS.x, vy: START_POS.y,
    dir: 'none', nextDir: 'none', mouthPhase: 0,
  });
  const ghostsRef = useRef<Ghost[]>(
    GHOST_STARTS.map((p, i) => ({
      gx: p.x, gy: p.y, vx: p.x, vy: p.y,
      dir: 'up' as Direction, color: GHOST_COLORS[i],
      scared: false, scaredFlash: false,
    }))
  );
  const scoreRef = useRef(0);
  const livesRef = useRef(LIVES);
  const pelletsRef = useRef(countPellets(cloneMaze()));
  const scaredRef = useRef(0);
  const deathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gameState, setGameState] = useState<GameState>('ready');
  const gsRef = useRef<GameState>('ready');
  useEffect(() => { gsRef.current = gameState; }, [gameState]);

  // ── Reset ──────────────────────────────────────────────────────────

  const resetPositions = useCallback(() => {
    pacRef.current = {
      gx: START_POS.x, gy: START_POS.y,
      vx: START_POS.x, vy: START_POS.y,
      dir: 'none', nextDir: 'none', mouthPhase: 0,
    };
    ghostsRef.current = GHOST_STARTS.map((p, i) => ({
      gx: p.x, gy: p.y, vx: p.x, vy: p.y,
      dir: 'up' as Direction, color: GHOST_COLORS[i],
      scared: false, scaredFlash: false,
    }));
    scaredRef.current = 0;
  }, []);

  const resetGame = useCallback(() => {
    const fresh = cloneMaze();
    mazeRef.current = fresh;
    pelletsRef.current = countPellets(fresh);
    scoreRef.current = 0;
    livesRef.current = LIVES;
    resetPositions();
    gsRef.current = 'playing';
    setGameState('playing');
  }, [resetPositions]);

  // ── Input ──────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }

      const gs = gsRef.current;
      if (gs === 'ready' || gs === 'gameover' || gs === 'won') {
        if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          resetGame();
          return;
        }
      }
      if (gs !== 'playing') return;
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); pacRef.current.nextDir = 'up'; break;
        case 'ArrowDown':  e.preventDefault(); pacRef.current.nextDir = 'down'; break;
        case 'ArrowLeft':  e.preventDefault(); pacRef.current.nextDir = 'left'; break;
        case 'ArrowRight': e.preventDefault(); pacRef.current.nextDir = 'right'; break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, resetGame]);

  // ── Tick (grid movement) ───────────────────────────────────────────

  const tick = useCallback(() => {
    if (gsRef.current !== 'playing') return;

    const pac = pacRef.current;
    const maze = mazeRef.current;
    const ghosts = ghostsRef.current;

    // Try queued direction, else keep current
    if (pac.nextDir !== 'none' && canMove(maze, pac.gx, pac.gy, pac.nextDir, true)) {
      pac.dir = pac.nextDir;
    }

    // Move on grid
    if (pac.dir !== 'none' && canMove(maze, pac.gx, pac.gy, pac.dir, true)) {
      const d = DIR_DELTA[pac.dir];
      pac.gx += d.dx;
      pac.gy += d.dy;
    }

    // Eat
    const cell = maze[pac.gy][pac.gx];
    if (cell === 1) {
      maze[pac.gy][pac.gx] = 2;
      scoreRef.current += 10;
      pelletsRef.current--;
    } else if (cell === 3) {
      maze[pac.gy][pac.gx] = 2;
      scoreRef.current += 50;
      pelletsRef.current--;
      scaredRef.current = SCARED_TICKS;
      for (const g of ghosts) { g.scared = true; g.scaredFlash = false; }
    }

    if (pelletsRef.current <= 0) { gsRef.current = 'won'; setGameState('won'); return; }

    // Check collision with ghosts BEFORE they move (pac walked into a ghost)
    for (const g of ghosts) {
      if (g.gx === pac.gx && g.gy === pac.gy) {
        if (g.scared) {
          scoreRef.current += 200;
          const idx = ghostsRef.current.indexOf(g);
          g.gx = GHOST_STARTS[idx].x; g.gy = GHOST_STARTS[idx].y;
          g.vx = g.gx; g.vy = g.gy;
          g.scared = false; g.scaredFlash = false; g.dir = 'up';
        } else {
          livesRef.current--;
          if (livesRef.current <= 0) { gsRef.current = 'gameover'; setGameState('gameover'); }
          else {
            gsRef.current = 'dead'; setGameState('dead');
            deathTimerRef.current = setTimeout(() => { resetPositions(); gsRef.current = 'playing'; setGameState('playing'); }, 700);
          }
          return;
        }
      }
    }

    // Scared countdown
    if (scaredRef.current > 0) {
      scaredRef.current--;
      // Flash warning in last 8 ticks
      if (scaredRef.current <= 8 && scaredRef.current > 0) {
        for (const g of ghosts) { if (g.scared) g.scaredFlash = scaredRef.current % 2 === 0; }
      }
      if (scaredRef.current <= 0) {
        for (const g of ghosts) { g.scared = false; g.scaredFlash = false; }
      }
    }

    // Move ghosts
    for (const g of ghosts) {
      const possible = ALL_DIRS.filter(d => d !== opposite(g.dir) && canMove(maze, g.gx, g.gy, d));
      if (possible.length === 0) {
        const rev = opposite(g.dir);
        if (rev !== 'none' && canMove(maze, g.gx, g.gy, rev)) possible.push(rev);
      }
      if (possible.length > 0) {
        let chosen: Direction;
        if (g.scared) {
          // Flee: maximise distance
          chosen = possible.reduce((best, d) => {
            const dd = DIR_DELTA[d];
            const bd = DIR_DELTA[best];
            const distD = Math.abs(g.gx + dd.dx - pac.gx) + Math.abs(g.gy + dd.dy - pac.gy);
            const distB = Math.abs(g.gx + bd.dx - pac.gx) + Math.abs(g.gy + bd.dy - pac.gy);
            return distD > distB ? d : best;
          });
        } else if (Math.random() < 0.55) {
          // Chase: minimise distance
          chosen = possible.reduce((best, d) => {
            const dd = DIR_DELTA[d];
            const bd = DIR_DELTA[best];
            const distD = Math.abs(g.gx + dd.dx - pac.gx) + Math.abs(g.gy + dd.dy - pac.gy);
            const distB = Math.abs(g.gx + bd.dx - pac.gx) + Math.abs(g.gy + bd.dy - pac.gy);
            return distD < distB ? d : best;
          });
        } else {
          chosen = possible[Math.floor(Math.random() * possible.length)];
        }
        g.dir = chosen;
        const dd = DIR_DELTA[chosen];
        g.gx += dd.dx;
        g.gy += dd.dy;
      }

      // Collision
      if (g.gx === pac.gx && g.gy === pac.gy) {
        if (g.scared) {
          scoreRef.current += 200;
          const idx = ghostsRef.current.indexOf(g);
          g.gx = GHOST_STARTS[idx].x; g.gy = GHOST_STARTS[idx].y;
          g.vx = g.gx; g.vy = g.gy;
          g.scared = false; g.scaredFlash = false; g.dir = 'up';
        } else {
          livesRef.current--;
          if (livesRef.current <= 0) { gsRef.current = 'gameover'; setGameState('gameover'); }
          else {
            gsRef.current = 'dead'; setGameState('dead');
            deathTimerRef.current = setTimeout(() => { resetPositions(); gsRef.current = 'playing'; setGameState('playing'); }, 700);
          }
          return;
        }
      }
    }
  }, [resetPositions]);

  // ── Draw (60fps with interpolation) ────────────────────────────────

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const maze = mazeRef.current;
    const pac = pacRef.current;
    const ghosts = ghostsRef.current;
    const gs = gsRef.current;

    frameRef.current++;

    // Interpolate visual positions toward grid positions
    pac.vx = lerp(pac.vx, pac.gx, LERP_SPEED);
    pac.vy = lerp(pac.vy, pac.gy, LERP_SPEED);
    pac.mouthPhase = (pac.mouthPhase + 0.08) % 1;
    for (const g of ghosts) {
      g.vx = lerp(g.vx, g.gx, LERP_SPEED);
      g.vy = lerp(g.vy, g.gy, LERP_SPEED);
    }

    // ── Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // ── Walls (rounded-corner tiles with edge glow)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (MAZE_TEMPLATE[r][c] !== 0) continue;

        const x = c * CELL;
        const y = r * CELL;

        // Fill
        ctx.fillStyle = WALL_FILL;
        ctx.fillRect(x, y, CELL, CELL);

        // Draw inner border edges only where adjacent to open space
        ctx.strokeStyle = WALL_EDGE;
        ctx.lineWidth = 1.5;
        if (!wallAt(MAZE_TEMPLATE, c, r - 1)) { ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + CELL, y + 0.5); ctx.stroke(); }
        if (!wallAt(MAZE_TEMPLATE, c, r + 1)) { ctx.beginPath(); ctx.moveTo(x, y + CELL - 0.5); ctx.lineTo(x + CELL, y + CELL - 0.5); ctx.stroke(); }
        if (!wallAt(MAZE_TEMPLATE, c - 1, r)) { ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + CELL); ctx.stroke(); }
        if (!wallAt(MAZE_TEMPLATE, c + 1, r)) { ctx.beginPath(); ctx.moveTo(x + CELL - 0.5, y); ctx.lineTo(x + CELL - 0.5, y + CELL); ctx.stroke(); }
      }
    }

    // ── Pellets
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * CELL + HALF;
        const cy = r * CELL + HALF;
        if (maze[r][c] === 1) {
          ctx.fillStyle = PELLET_COLOR;
          ctx.beginPath();
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (maze[r][c] === 3) {
          // Pulsing power pellet
          const pulse = 0.7 + 0.3 * Math.sin(frameRef.current * 0.08);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = POWER_COLOR;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // ── Hero: the M
    if (gs !== 'dead') {
      const px = pac.vx * CELL + HALF;
      const py = pac.vy * CELL + HALF;

      // Subtle glow
      ctx.save();
      ctx.shadowColor = M_COLOR;
      ctx.shadowBlur = 8;

      // Mouth animation: slight scale pulse
      const scale = 1 + 0.06 * Math.sin(pac.mouthPhase * Math.PI * 2);
      ctx.translate(px, py);
      ctx.scale(scale, scale);

      ctx.fillStyle = M_COLOR;
      ctx.font = `bold ${CELL}px "Cormorant Garamond", "Georgia", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('L', 0, 1);

      ctx.restore();
    }

    // ── Ghosts
    for (const g of ghosts) {
      const gx = g.vx * CELL + HALF;
      const gy = g.vy * CELL + HALF;
      const r = HALF - 2;

      const fillColor = g.scared ? (g.scaredFlash ? SCARED_FLASH : SCARED_COLOR) : g.color;

      ctx.save();
      if (!g.scared) {
        ctx.shadowColor = g.color;
        ctx.shadowBlur = 6;
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      // Dome
      ctx.arc(gx, gy - 1, r, Math.PI, 0);
      // Wavy bottom — smooth with quadratic curves
      const btm = gy + r - 1;
      ctx.lineTo(gx + r, btm);
      const segs = 3;
      const segW = (2 * r) / segs;
      for (let i = 0; i < segs; i++) {
        const sx = gx + r - i * segW;
        const ex = sx - segW;
        const mid = (sx + ex) / 2;
        const wave = i % 2 === 0 ? 4 : -2;
        ctx.quadraticCurveTo(mid, btm + wave, ex, btm);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx - 3.5, gy - 2, 3.5, 0, Math.PI * 2);
      ctx.arc(gx + 3.5, gy - 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (!g.scared) {
        const dd = DIR_DELTA[g.dir] ?? { dx: 0, dy: 0 };
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(gx - 3.5 + dd.dx * 2, gy - 2 + dd.dy * 2, 1.8, 0, Math.PI * 2);
        ctx.arc(gx + 3.5 + dd.dx * 2, gy - 2 + dd.dy * 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Scared mouth
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx - 4, gy + 3);
        for (let i = 0; i < 4; i++) {
          ctx.lineTo(gx - 4 + i * 2.7 + 1.3, gy + (i % 2 === 0 ? 1.5 : 4.5));
        }
        ctx.stroke();
      }
    }

    // ── HUD
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`SCORE  ${scoreRef.current}`, 8, H - 4);

    // Lives as mini Ls (Lavern brand mark)
    ctx.textAlign = 'right';
    ctx.fillStyle = M_COLOR;
    ctx.font = `bold 12px "Cormorant Garamond", serif`;
    for (let i = 0; i < livesRef.current; i++) {
      ctx.fillText('L', W - 6 - i * 16, H - 3);
    }

    // ── Overlay text
    if (gs === 'ready') {
      drawOverlay(ctx, 'PRESS ANY KEY', 'to start');
    } else if (gs === 'gameover') {
      drawOverlay(ctx, 'GAME OVER', `score ${scoreRef.current}`);
    } else if (gs === 'won') {
      drawOverlay(ctx, 'CLEARED!', `score ${scoreRef.current}`);
    }
  }, []);

  // ── Loop ───────────────────────────────────────────────────────────

  useEffect(() => {
    const loop = (time: number) => {
      if (gsRef.current === 'playing' && time - lastTickRef.current >= TICK_MS) {
        lastTickRef.current = time;
        tick();
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (deathTimerRef.current) clearTimeout(deathTimerRef.current);
    };
  }, [tick, draw]);

  // ── JSX ────────────────────────────────────────────────────────────

  return (
    <div style={panelStyles.overlay} onClick={onClose}>
      <div style={panelStyles.panel} onClick={e => e.stopPropagation()}>
        <div style={panelStyles.header}>
          <span style={panelStyles.title}>LAVERN MAZE</span>
          <button style={panelStyles.closeBtn} onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <canvas ref={canvasRef} width={W} height={H} style={panelStyles.canvas} />
        <div style={panelStyles.hint}>
          {gameState === 'playing' ? 'arrow keys to move' : 'press any key'}
        </div>
      </div>
    </div>
  );
}

// ── Overlay text helper ──────────────────────────────────────────────

function drawOverlay(ctx: CanvasRenderingContext2D, line1: string, line2: string) {
  // Frosted band
  ctx.fillStyle = 'rgba(10, 10, 20, 0.75)';
  ctx.fillRect(0, H / 2 - 28, W, 56);

  // Top line
  ctx.fillStyle = M_COLOR;
  ctx.font = `600 14px "SF Mono", "Fira Code", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line1, W / 2, H / 2 - 7);

  // Bottom line
  if (line2) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `10px "SF Mono", "Fira Code", monospace`;
    ctx.fillText(line2, W / 2, H / 2 + 13);
  }
}

// ── Panel styles ─────────────────────────────────────────────────────

const panelStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 8000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(4px)',
  },
  panel: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    boxShadow: '0 24px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 2.5,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: colors.textMuted,
    padding: '2px 6px',
    borderRadius: radii.sm,
    lineHeight: 1,
    transition: 'color 0.2s',
  },
  canvas: {
    display: 'block',
    margin: `${spacing.sm}px`,
    borderRadius: radii.sm,
  },
  hint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
    letterSpacing: 1,
    paddingBottom: spacing.sm,
    textTransform: 'uppercase' as const,
  },
};
