/**
 * CustomCursor — Global custom cursor for the entire app.
 *
 * Dot: small filled circle, follows mouse instantly.
 * Trail: larger blurred circle, follows with spring-like lag (the "shadow").
 * Hover over clickable: dot becomes open circle (ring), same size.
 * Dark pages: white dot / white trail.
 *
 * Desktop only — hidden on touch devices via pointer media query.
 * The native cursor is hidden via CSS in app.css.
 */

import { useEffect, useRef, useCallback } from 'react';

/** Selectors that count as "clickable" for circle-cursor expansion. */
const CLICKABLE = 'a, button, [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"]), label[for], summary, .cursor-pointer';

interface Props {
  /** 'light' = black cursor on light bg, 'dark' = white cursor on dark bg */
  variant?: 'light' | 'dark';
}

export function CustomCursor({ variant = 'light' }: Props) {
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const trailPos = useRef({ x: -100, y: -100 });
  const hovering = useRef(false);
  const rafRef = useRef(0);
  const visible = useRef(false);

  const isDark = variant === 'dark';
  const dotColor = isDark ? 'rgba(250, 249, 246, 0.9)' : 'rgba(26, 26, 26, 0.9)';
  const ringColor = isDark ? 'rgba(250, 249, 246, 0.45)' : 'rgba(26, 26, 26, 0.45)';
  const trailColor = isDark ? 'rgba(250, 249, 246, 0.06)' : 'rgba(26, 26, 26, 0.06)';

  const applyStyle = useCallback(() => {
    const dot = dotRef.current;
    const trail = trailRef.current;
    if (!dot || !trail) return;

    const isHover = hovering.current;
    const vis = visible.current ? '1' : '0';

    // Dot — follows mouse instantly
    dot.style.left = `${mousePos.current.x - 4}px`;
    dot.style.top = `${mousePos.current.y - 4}px`;
    dot.style.backgroundColor = isHover ? 'transparent' : dotColor;
    dot.style.border = isHover ? `1.5px solid ${ringColor}` : 'none';
    dot.style.opacity = vis;

    // Trail — follows with lag
    const dx = mousePos.current.x - trailPos.current.x;
    const dy = mousePos.current.y - trailPos.current.y;
    trailPos.current.x += dx * 0.12;
    trailPos.current.y += dy * 0.12;
    trail.style.left = `${trailPos.current.x - 16}px`;
    trail.style.top = `${trailPos.current.y - 16}px`;
    trail.style.opacity = vis;
  }, [dotColor, ringColor]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      applyStyle();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [applyStyle]);

  // Mouse move listener
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (!visible.current) {
        visible.current = true;
      }
    };
    const onLeave = () => {
      visible.current = false;
      if (dotRef.current) dotRef.current.style.opacity = '0';
      if (trailRef.current) trailRef.current.style.opacity = '0';
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Hover detection for clickable elements
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(CLICKABLE)) {
        hovering.current = true;
      }
    };
    const onOut = (e: MouseEvent) => {
      const target = e.relatedTarget as Element | null;
      if (!target?.closest?.(CLICKABLE)) {
        hovering.current = false;
      }
    };

    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  return (
    <>
      {/* Dot — small filled circle */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 8,
          height: 8,
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 99999,
          transition: 'background-color 0.35s ease, border 0.35s ease',
          opacity: 0,
        }}
      />
      {/* Trail — blurred circle that lags behind */}
      <div
        ref={trailRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: trailColor,
          filter: 'blur(8px)',
          pointerEvents: 'none',
          zIndex: 99998,
          opacity: 0,
        }}
      />
    </>
  );
}
