/**
 * Card Hover Effects — Subtle editorial polish.
 *
 * Replaced holographic shimmer with a soft light sweep.
 * Also loads Inter + Cormorant Garamond fonts. The @keyframes are injected once via a <style> tag.
 */

// Keyframes + font import now live in app.css / index.html — no JS injection needed.
/** @deprecated No-op. Keyframes consolidated into app.css. */
export function injectHolographicStyles(): void {}

/** Subtle light sweep overlay styles (place as a child div with pointerEvents: 'none'). */
export const holoOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 12,
  background:
    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 65%, transparent 100%)',
  backgroundSize: '200% 100%',
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity 0.3s ease',
};

/** Overlay styles when hovered — makes sweep visible + animated. */
export const holoOverlayHover: React.CSSProperties = {
  ...holoOverlay,
  opacity: 1,
  animation: 'holoShimmer 1s ease-in-out',
  animationIterationCount: '1',
};

/** Card emphasis when selected — subtle ring, no neon glow. */
export const selectedGlow: React.CSSProperties = {
  boxShadow: '0 0 0 2px rgba(26, 26, 26, 0.12)',
};
