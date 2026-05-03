/**
 * SketchPad — A discreet doodle easter egg for the working screen.
 *
 * Spend a few minutes sketching while the agents grind. Single ink brush,
 * smooth catmull-mid-point line interpolation for buttery curves. Stroke-
 * based undo (each pen-down → pen-up is one undo step). Tucks away to a
 * 36px button; full state is preserved in memory until the WorkingView
 * unmounts.
 *
 * Pointer events handle mouse + touch + Apple Pencil uniformly.
 *
 * Controls:
 *   - Drag to draw
 *   - Cmd/Ctrl-Z (or the ↶ button) undo last stroke
 *   - Esc (or the × button) tuck away (state preserved while WorkingView lives)
 *   - Trash button → confirm-clear-all
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  onClose: () => void;
  /** Strokes from the last open session — preserved across tuck-aways. */
  initialStrokes?: Stroke[];
  /** Called whenever the user lifts the pen, so the parent can persist. */
  onStrokesChange?: (strokes: Stroke[]) => void;
}

export interface Point { x: number; y: number; }
export interface Stroke { points: Point[]; }

const INK = '#1A140A';      // Warm near-black
const INK_GLOW = 'rgba(196, 93, 62, 0.10)'; // Faint terracotta halo for warmth
const PAPER = '#FBF7EE';    // Warm cream
const PAPER_GRID = 'rgba(196, 93, 62, 0.05)';
const BRUSH_RADIUS = 1.5;   // Half-width — line is 3px

export function SketchPad({ onClose, initialStrokes = [], onStrokesChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>(initialStrokes.map(s => ({ points: [...s.points] })));
  const activeStrokeRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const dprRef = useRef<number>(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // Forces a re-render so we can disable Undo when there are no strokes.
  const [, forceTick] = useState(0);
  const tick = useCallback(() => forceTick(n => n + 1), []);

  // ── Canvas sizing (with HiDPI) ────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    sizeRef.current = { w: rect.width, h: rect.height };
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    redraw();
  }, []);

  // ── Smooth-line drawing (quadratic curves between midpoints) ──────────
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return;

    // Single point → render a dot.
    if (pts.length === 1) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, BRUSH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Soft halo underlay
    ctx.strokeStyle = INK_GLOW;
    ctx.lineWidth = BRUSH_RADIUS * 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();

    // Ink line on top
    ctx.strokeStyle = INK;
    ctx.lineWidth = BRUSH_RADIUS * 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    ctx.clearRect(0, 0, w, h);

    // Subtle paper grid — only behind the canvas, very faint.
    ctx.strokeStyle = PAPER_GRID;
    ctx.lineWidth = 1;
    const STEP = 32;
    ctx.beginPath();
    for (let x = STEP; x < w; x += STEP) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = STEP; y < h; y += STEP) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (activeStrokeRef.current) drawStroke(ctx, activeStrokeRef.current);
  }, [drawStroke]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas]);

  // ── Pointer drawing ────────────────────────────────────────────────────
  const ptFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    activeStrokeRef.current = { points: [ptFromEvent(e)] };
    redraw();
  }, [ptFromEvent, redraw]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !activeStrokeRef.current) return;
    const p = ptFromEvent(e);
    const last = activeStrokeRef.current.points[activeStrokeRef.current.points.length - 1];
    // Skip points too close to the previous one — keeps stroke small + smooth.
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    activeStrokeRef.current.points.push(p);
    redraw();
  }, [ptFromEvent, redraw]);

  const finalizeStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (activeStrokeRef.current && activeStrokeRef.current.points.length > 0) {
      strokesRef.current.push(activeStrokeRef.current);
      onStrokesChange?.(strokesRef.current);
    }
    activeStrokeRef.current = null;
    tick();
    redraw();
  }, [onStrokesChange, redraw, tick]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    finalizeStroke();
  }, [finalizeStroke]);

  // ── Undo / clear ───────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    onStrokesChange?.(strokesRef.current);
    tick();
    redraw();
  }, [onStrokesChange, redraw, tick]);

  const clearAll = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    if (!confirm('Clear the sketch?')) return;
    strokesRef.current = [];
    onStrokesChange?.(strokesRef.current);
    tick();
    redraw();
  }, [onStrokesChange, redraw, tick]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const isUndo = (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey;
      if (isUndo) { e.preventDefault(); undo(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, undo]);

  const strokeCount = strokesRef.current.length;
  const canUndo = strokeCount > 0;

  return (
    <div
      style={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Sketchpad"
    >
      <div style={styles.shell}>
        {/* Top bar — title + tools + close */}
        <div style={styles.topBar}>
          <div style={styles.titleGroup}>
            <span style={styles.titleSerif}>Sketch</span>
            <span style={styles.titleMeta}>
              {strokeCount === 0 ? 'a quiet moment' : `${strokeCount} stroke${strokeCount === 1 ? '' : 's'}`}
            </span>
          </div>
          <div style={styles.tools}>
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              style={{ ...styles.toolBtn, opacity: canUndo ? 1 : 0.3, cursor: canUndo ? 'pointer' : 'default' }}
              aria-label="Undo last stroke"
              title="Undo (⌘Z)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14L4 9l5-5"/>
                <path d="M4 9h11a5 5 0 0 1 0 10h-2"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={!canUndo}
              style={{ ...styles.toolBtn, opacity: canUndo ? 1 : 0.3, cursor: canUndo ? 'pointer' : 'default' }}
              aria-label="Clear everything"
              title="Clear all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
              </svg>
            </button>
            <div style={styles.toolDivider} />
            <button
              type="button"
              onClick={onClose}
              style={styles.tuckBtn}
              aria-label="Tuck the sketchpad away"
              title="Tuck away (Esc)"
            >
              Tuck away ↘
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} style={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {strokeCount === 0 && !drawingRef.current && (
            <div style={styles.emptyHint}>Doodle while the team works.</div>
          )}
        </div>

        {/* Footer hint */}
        <div style={styles.footer}>
          <span style={styles.footerHint}>One brush · ⌘Z to undo · Esc to tuck away</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(20, 18, 14, 0.55)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: spacing.lg,
    animation: 'sketchpad-fade-in 0.18s ease',
  },
  shell: {
    width: 'min(960px, 100%)',
    height: 'min(680px, 90vh)',
    backgroundColor: PAPER,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    boxShadow: '0 30px 80px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.border}`,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, transparent 100%)',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  titleSerif: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: 500,
    color: colors.text,
    letterSpacing: -0.2,
    fontStyle: 'italic' as const,
  },
  titleMeta: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textDim,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    fontWeight: 600,
  },
  tools: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  toolBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    transition: 'all 0.15s ease',
  },
  toolDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.border,
    margin: `0 ${spacing.xs}px`,
  },
  tuckBtn: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.6,
    color: colors.textSecondary,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '7px 12px',
    minHeight: 32,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  canvasWrap: {
    flex: 1,
    position: 'relative' as const,
    backgroundColor: PAPER,
    overflow: 'hidden' as const,
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    cursor: 'crosshair',
    touchAction: 'none' as const,
  },
  emptyHint: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none' as const,
    fontFamily: fonts.serif,
    fontSize: 18,
    fontStyle: 'italic' as const,
    color: 'rgba(26,20,10,0.18)',
    letterSpacing: 0.2,
    userSelect: 'none' as const,
  },
  footer: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'center',
    background: 'linear-gradient(0deg, rgba(255,255,255,0.6) 0%, transparent 100%)',
  },
  footerHint: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    fontWeight: 600,
  },
};
