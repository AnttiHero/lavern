/**
 * Clawern dark theme — local constants.
 *
 * Do NOT import these into the shared staffing/styles/tokens.ts.
 * The main app uses a warm light palette; Clawern uses the same
 * dark cinematic language as the marketing site (lavern.ai/claw).
 *
 * Background: #080808  Text: #FAF9F6  Accent: #E8845C
 */

export const CLAW = {
  // Backgrounds
  bg:           '#080808',
  surface:      'rgba(250,249,246,0.03)',
  surfaceHover: 'rgba(250,249,246,0.05)',
  panel:        'rgba(250,249,246,0.04)',
  input:        'rgba(250,249,246,0.06)',

  // Borders
  border:       'rgba(250,249,246,0.08)',
  borderStrong: 'rgba(250,249,246,0.14)',

  // Text
  text:          '#FAF9F6',
  textSecondary: 'rgba(250,249,246,0.65)',
  textMuted:     'rgba(250,249,246,0.35)',
  textDim:       'rgba(250,249,246,0.18)',

  // Accent — warm orange, matches lavern.ai/claw
  accent:       '#E8845C',
  accentBg:     'rgba(232,132,92,0.08)',
  accentBorder: 'rgba(232,132,92,0.2)',

  // Amber — for budget/forecast/gold items
  amber:        '#C9A84C',
  amberBg:      'rgba(201,168,76,0.08)',
  amberBorder:  'rgba(201,168,76,0.18)',

  // Semantic
  success:      '#5C9E6E',
  successBg:    'rgba(92,158,110,0.08)',
  danger:       '#C45D3E',
  dangerBg:     'rgba(196,93,62,0.07)',
  dangerBorder: 'rgba(196,93,62,0.22)',
  warning:      '#C9A84C',
} as const;
