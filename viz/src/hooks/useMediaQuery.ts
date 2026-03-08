/**
 * useMediaQuery — Responsive breakpoint hook.
 *
 * Wraps `window.matchMedia` so inline-style components can conditionally
 * apply overrides: `const { isMobile } = useResponsive()`.
 *
 * On desktop (>1024px) all booleans are false → zero style changes.
 */

import { useState, useEffect } from 'react';

const BREAKPOINTS = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1024px)',
  desktop: '(min-width: 1025px)',
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

export function useMediaQuery(breakpoint: Breakpoint): boolean {
  const query = BREAKPOINTS[breakpoint];
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return breakpoint === 'desktop';
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useResponsive() {
  const isMobile = useMediaQuery('mobile');
  const isTablet = useMediaQuery('tablet');
  return { isMobile, isTablet };
}
