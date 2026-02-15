/**
 * Card Hover Effects — Subtle editorial polish.
 *
 * Replaced holographic shimmer with a soft light sweep.
 * Also loads Inter + Cormorant Garamond fonts. The @keyframes are injected once via a <style> tag.
 */

let injected = false;

/** Inject the hover keyframes + Inter font into the document once. */
export function injectHolographicStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Inter:wght@400;500;600;700&display=swap');
    @keyframes holoShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes selectedPulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(26, 26, 26, 0.08); }
      50% { box-shadow: 0 0 0 3px rgba(26, 26, 26, 0.15); }
    }
  `;
  document.head.appendChild(style);
}

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
