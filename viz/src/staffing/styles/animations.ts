/**
 * Shared Motion (Framer Motion) animation variants.
 * Refined for editorial feel — subtle, purposeful motion.
 */

/** Stagger children entrance — wrap the grid in a motion.div with these variants. */
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

/** Individual card entrance — fade up with spring-like ease. */
export const cardEntrance = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Card hover lift — subtle 2px, not 6px. */
export const cardHover = {
  y: -2,
  transition: { duration: 0.2, ease: 'easeOut' },
};

/** Selection pop — a quick scale pulse. */
export const selectPop = {
  scale: [1, 1.03, 1],
  transition: { duration: 0.2 },
};

/** Bench agent chip slide in. */
export const benchSlideIn = {
  initial: { opacity: 0, x: -12, scale: 0.9 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 12, scale: 0.9 },
  transition: { duration: 0.2 },
};

/** Flip variants for front/back. */
export const flipFront = {
  front: { rotateY: 0 },
  back: { rotateY: 180 },
};

export const flipBack = {
  front: { rotateY: -180 },
  back: { rotateY: 0 },
};
