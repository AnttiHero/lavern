/**
 * Working-screen framer-motion animation variants.
 * Follows the editorial restraint principle from the staffing animations.
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

/** Stream container stagger */
export const streamStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

/** Phase strip transition */
export const phaseEnter = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.3 },
};

/** Tool-used card — fast subtle entrance */
export const toolUsedEntrance = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 0.7,
    x: 0,
    transition: { duration: 0.15, ease: 'easeOut' as const },
  },
};

/** Active thinking card entrance */
export const activeThinkingEntrance = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' as const },
  },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

/** Debate thread expand */
export const debateThreadExpand = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
};

/** Agent chip active pulse (framer) */
export const agentChipActive = {
  idle: { scale: 1 },
  active: {
    scale: [1, 1.02, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
};

// ── CSS keyframe injection ─────────────────────────────────────────────

let injected = false;

/** Call once on mount to inject CSS keyframes for thinking animations. */
export function injectWorkingKeyframes() {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes thinkingDotBounce {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }
    @keyframes activeThinkingPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(184, 134, 11, 0); }
      50% { box-shadow: 0 0 0 3px rgba(184, 134, 11, 0.08); }
    }
    @keyframes openDebatePulse {
      0%, 100% { border-color: rgba(184, 134, 11, 0.3); }
      50% { border-color: rgba(184, 134, 11, 0.6); }
    }
    @keyframes activeAgentGlow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(74, 124, 80, 0); }
      50% { box-shadow: 0 0 0 3px rgba(74, 124, 80, 0.15); }
    }
  `;
  document.head.appendChild(style);
}
