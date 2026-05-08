/**
 * Jude Claw — easter-egg agent. Companion to the Goblin.
 *
 * A nod to a competitor that hired a famous actor as the face of their
 * legal AI. Jude Claw has the face. He has nothing else.
 */

import type { AgentProfile } from '../../types/agent-profile.js';

export const JUDE_CLAW_PROFILE: AgentProfile = {
  role: '',
  displayName: 'Jude Claw 🗿',
  tagline: 'He looks the part.',
  category: 'lawyer',
  seniority: 'partner',
  costTier: 'opus',
  billingRateUsd: 5000,
  skills: {
    precision:     1,
    creativity:    1,
    speed:         1,
    depth:         1,
    negotiation:   1,
    communication: 1,
    research:      1,
    risk:          1,
  },
  personality: {
    archetype: 'The Face',
    traits: {
      'conservative-vs-creative':     5,
      'thorough-vs-fast':             5,
      'risk-averse-vs-tolerant':      5,
      'formal-vs-approachable':       5,
      'adversarial-vs-collaborative': 5,
    },
    workStyle: 'Hired for his face.',
  },
  practiceAreas: ['appearing in commercials'],
  strengths: [
    'Symmetrical face.',
    'Excellent jawline.',
    'Funny name.',
  ],
  limitations: [
    'Knows nothing about law.',
    'Is useless in legal work.',
    'Costs more than the entire associate team.',
  ],
  optional: true,
  defaultSelected: false,
  avatarSeed: 'jude-claw',
  avatarExtra: 'beard=&hair=variant19&lips=variant03&eyes=variant02',
};
