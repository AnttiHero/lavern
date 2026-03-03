/**
 * Working-screen animation variants & CSS keyframes.
 *
 * Only exports that are actually imported elsewhere are kept.
 * Unused variants (streamStagger, phaseEnter, toolUsedEntrance,
 * activeThinkingEntrance, debateThreadExpand, agentChipActive) were
 * removed in the v16 polish pass.
 */

/** Stream card entrance — slide in from left, fade */
export const streamCardEntrance = {
  hidden: { opacity: 0, x: -12, scale: 0.98 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
};

// Keyframes now live in app.css — no JS injection needed.
/** @deprecated No-op. Keyframes consolidated into app.css. */
export function injectWorkingKeyframes() {}
