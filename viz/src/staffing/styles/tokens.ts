/**
 * Design Tokens — Warm Editorial palette.
 *
 * Inspired by: Harvey (ink-on-ivory), Monocle (restrained editorial),
 * Apple (premium sans-serif), AI 2027 (serif authority on paper).
 *
 * Principle: restraint signals quality. Color is punctuation, not decoration.
 */

export const colors = {
  // Backgrounds — warm paper tones
  bg: '#FAF9F6',
  bgCard: '#FFFFFF',
  bgCardHover: '#FFFFFF',
  bgPanel: '#F5F4F0',
  bgInput: '#F0EFEB',
  bgAlt: '#F5F3EE',

  // Borders — soft warm greys
  border: '#E5E3DD',
  borderHover: '#C5C3BD',
  borderSelected: '#1A1A1A',

  // Accent — single warm accent (terracotta/copper)
  accent: '#C45D3E',
  accentLight: 'rgba(196, 93, 62, 0.08)',
  accentMid: 'rgba(196, 93, 62, 0.15)',
  accentMuted: 'rgba(196, 93, 62, 0.5)',

  // Cost tiers — muted, desaturated
  opus: '#8B6914',
  opusBg: 'rgba(139, 105, 20, 0.07)',
  sonnet: '#2E7D9C',
  sonnetBg: 'rgba(46, 125, 156, 0.07)',
  haiku: '#4A7C50',
  haikuBg: 'rgba(74, 124, 80, 0.07)',

  // Text — warm darks
  text: '#1A1A1A',
  textSecondary: '#4A4A4A',
  textMuted: '#6B6B67',
  textDim: '#767670',

  // Semantic — desaturated
  success: '#4A7C50',
  successBg: 'rgba(74, 124, 80, 0.07)',
  warning: '#B8860B',
  warningBg: 'rgba(184, 134, 11, 0.07)',
  danger: '#C45D3E',

  // Category colors — muted editorial
  lawyer: '#2E7D9C',
  specialist: '#7B5EA7',
  infrastructure: '#9C7B3E',
  orchestrator: '#C45D3E',
};

export const fonts = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "'Cormorant Garamond', 'Georgia', 'Times New Roman', serif",
  mono: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
};

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
};

/** Map cost tier to color */
export function tierColor(tier: string): string {
  if (tier === 'opus') return colors.opus;
  if (tier === 'sonnet') return colors.sonnet;
  if (tier === 'haiku') return colors.haiku;
  return colors.textMuted;
}

/** Map cost tier to background color */
export function tierBg(tier: string): string {
  if (tier === 'opus') return colors.opusBg;
  if (tier === 'sonnet') return colors.sonnetBg;
  if (tier === 'haiku') return colors.haikuBg;
  return 'rgba(122,122,118,0.07)';
}

/** Map category to color */
export function categoryColor(cat: string): string {
  if (cat === 'lawyer') return colors.lawyer;
  if (cat === 'specialist') return colors.specialist;
  if (cat === 'infrastructure') return colors.infrastructure;
  if (cat === 'orchestrator') return colors.orchestrator;
  return colors.textMuted;
}
