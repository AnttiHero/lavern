/**
 * Trophy definitions for the briefing context-score milestones.
 *
 * Each trophy maps to a milestone threshold (25/50/75/100).
 * Icons are SVG path data for law-themed line-art badges.
 */

export interface TrophyDefinition {
  id: string;
  threshold: number;
  label: string;
  description: string;
  /** SVG markup (24×24 viewBox, monochrome #1A1A1A strokes) */
  svg: string;
}

export const TROPHY_DEFINITIONS: TrophyDefinition[] = [
  {
    id: 'case-opened',
    threshold: 25,
    label: 'Case Opened',
    description: 'Your matter is on the record.',
    svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8.5" cy="8" r="3.5" stroke="currentColor" stroke-width="1.4"/>
      <line x1="11" y1="10.5" x2="11" y2="20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M11 15h5.5a2.5 2.5 0 0 0 0-5H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M11 18h4a2 2 0 0 0 0-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'brief-filed',
    threshold: 50,
    label: 'Brief Filed',
    description: 'Solid foundation for your team.',
    svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" stroke-width="1.4"/>
      <line x1="8.5" y1="7" x2="15.5" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="8.5" y1="10.5" x2="15.5" y2="10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="8.5" y1="14" x2="13" y2="14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M5 4.5h-1.5a1 1 0 0 0-1 1v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'case-strengthened',
    threshold: 75,
    label: 'Case Strengthened',
    description: 'Your agents will do exceptional work.',
    svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="3" x2="12" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="5" y1="8" x2="19" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M5 8l-1.5 7h5L7 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M19 8l1.5 7h-5L17 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="12" y1="8" x2="12" y2="21" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'fully-briefed',
    threshold: 100,
    label: 'Fully Briefed',
    description: 'Maximum context. Maximum quality.',
    svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L8 6h8l-4-4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      <rect x="4" y="6" width="16" height="2.5" rx="0.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="6.5" y1="8.5" x2="6.5" y2="18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="10" y1="8.5" x2="10" y2="18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="14" y1="8.5" x2="14" y2="18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="17.5" y1="8.5" x2="17.5" y2="18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="3" y="18" width="18" height="2.5" rx="0.5" stroke="currentColor" stroke-width="1.3"/>
    </svg>`,
  },
];
