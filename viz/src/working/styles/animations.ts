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
    transition: { duration: 0.3, ease: 'easeOut' },
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
