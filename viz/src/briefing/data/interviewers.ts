/**
 * Interviewer personas — four distinct characters who conduct the Q&A.
 *
 * Each persona has:
 *   - SVG portrait (80x80 editorial line-art, thin strokes, monochrome)
 *   - Name, title, tagline
 *   - Acknowledgment templates keyed by question ID (personality-flavored)
 *
 * Portraits are abstract editorial line-art in the style of The New Yorker /
 * Monocle illustrations — thin strokes (1.5-2px), monochrome #1A1A1A, no fills.
 */

export interface InterviewerPersona {
  id: string;
  name: string;
  title: string;
  tagline: string;
  /** 80×80 SVG string for portrait (line-art) */
  portrait: string;
  /** Per-question acknowledgment templates. Falls back to `default`. */
  acknowledgments: Record<string, (answer: string) => string>;
}

// ── SVG Portraits ────────────────────────────────────────────────────────
// Abstract editorial line-art: thin strokes, monochrome, no fills.
// Each is a distinct silhouette conveying personality through posture and hair.

const PORTRAIT_MARGARET = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#1A1A1A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <ellipse cx="40" cy="28" rx="14" ry="16"/>
  <!-- Hair: pulled back, structured -->
  <path d="M26 24 C26 14, 40 8, 54 14"/>
  <path d="M26 24 C24 18, 28 12, 36 10"/>
  <path d="M54 14 C56 18, 54 24, 54 28"/>
  <!-- Eyes: focused, precise -->
  <line x1="33" y1="26" x2="38" y2="26"/>
  <line x1="42" y1="26" x2="47" y2="26"/>
  <circle cx="35.5" cy="26" r="0.8"/>
  <circle cx="44.5" cy="26" r="0.8"/>
  <!-- Subtle smile -->
  <path d="M36 34 Q40 37 44 34"/>
  <!-- Collar: structured, formal -->
  <path d="M30 44 L34 50 L40 46 L46 50 L50 44"/>
  <!-- Shoulders -->
  <path d="M22 56 C26 48, 34 44, 40 46 C46 44, 54 48, 58 56"/>
  <!-- Earrings (small dots) -->
  <circle cx="26" cy="30" r="1.2"/>
  <circle cx="54" cy="30" r="1.2"/>
</svg>`;

const PORTRAIT_JAMES = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#1A1A1A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <ellipse cx="40" cy="28" rx="14" ry="16"/>
  <!-- Hair: wavy, distinguished grey -->
  <path d="M26 22 C28 12, 40 8, 52 12 C54 16, 54 22, 54 24"/>
  <path d="M28 18 C32 14, 38 13, 44 14"/>
  <path d="M44 14 C48 14, 52 16, 52 20"/>
  <!-- Eyes: warm, crinkled -->
  <path d="M32 25 Q35.5 23.5 38 25"/>
  <path d="M42 25 Q45.5 23.5 48 25"/>
  <circle cx="35" cy="25.5" r="0.8"/>
  <circle cx="45" cy="25.5" r="0.8"/>
  <!-- Warm smile -->
  <path d="M34 34 Q40 39 46 34"/>
  <!-- Collar: open, relaxed -->
  <path d="M32 44 L36 52 L40 48"/>
  <path d="M48 44 L44 52 L40 48"/>
  <!-- Shoulders: broad -->
  <path d="M18 58 C24 48, 32 44, 40 46 C48 44, 56 48, 62 58"/>
  <!-- Glasses -->
  <rect x="31" y="22" width="8" height="6" rx="2"/>
  <rect x="41" y="22" width="8" height="6" rx="2"/>
  <line x1="39" y1="25" x2="41" y2="25"/>
</svg>`;

const PORTRAIT_AMARA = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#1A1A1A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <ellipse cx="40" cy="28" rx="14" ry="16"/>
  <!-- Hair: natural, volumetric -->
  <path d="M24 26 C22 14, 32 4, 40 4 C48 4, 58 14, 56 26"/>
  <path d="M24 26 C24 22, 26 16, 30 12"/>
  <path d="M56 26 C56 22, 54 16, 50 12"/>
  <path d="M30 8 C36 6, 44 6, 50 8"/>
  <!-- Eyes: analytical, attentive -->
  <line x1="33" y1="26" x2="38" y2="26"/>
  <line x1="42" y1="26" x2="47" y2="26"/>
  <circle cx="35.5" cy="26" r="1"/>
  <circle cx="44.5" cy="26" r="1"/>
  <!-- Brow: slight arch (thoughtful) -->
  <path d="M32 23 Q35 21 39 23"/>
  <path d="M41 23 Q45 21 48 23"/>
  <!-- Composed expression -->
  <path d="M37 34 Q40 36 43 34"/>
  <!-- Collar: high, academic -->
  <path d="M28 44 L32 46 L40 44 L48 46 L52 44"/>
  <line x1="40" y1="44" x2="40" y2="50"/>
  <!-- Shoulders -->
  <path d="M20 58 C26 48, 34 44, 40 44 C46 44, 54 48, 60 58"/>
</svg>`;

const PORTRAIT_RAFAEL = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#1A1A1A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <ellipse cx="40" cy="28" rx="13" ry="15"/>
  <!-- Hair: modern, textured crop -->
  <path d="M27 24 C27 14, 34 10, 40 10 C46 10, 53 14, 53 24"/>
  <path d="M29 18 C32 13, 38 11, 44 12"/>
  <path d="M44 12 C48 13, 51 16, 52 20"/>
  <!-- Light stubble lines -->
  <line x1="34" y1="38" x2="36" y2="38" stroke-width="0.8"/>
  <line x1="38" y1="39" x2="40" y2="39" stroke-width="0.8"/>
  <line x1="42" y1="38" x2="44" y2="38" stroke-width="0.8"/>
  <!-- Eyes: direct, energetic -->
  <line x1="33" y1="26" x2="38" y2="26"/>
  <line x1="42" y1="26" x2="47" y2="26"/>
  <circle cx="35.5" cy="26" r="0.8"/>
  <circle cx="44.5" cy="26" r="0.8"/>
  <!-- Slight grin -->
  <path d="M35 34 Q40 37 45 33"/>
  <!-- Collar: modern, no tie -->
  <path d="M30 44 C34 42, 38 44, 40 46"/>
  <path d="M50 44 C46 42, 42 44, 40 46"/>
  <path d="M34 44 L36 50"/>
  <path d="M46 44 L44 50"/>
  <!-- Shoulders: athletic -->
  <path d="M18 58 C24 46, 34 44, 40 44 C46 44, 56 46, 62 58"/>
</svg>`;

// ── Acknowledgment Templates ─────────────────────────────────────────────
// Each persona responds to answered questions differently.
// Templates are keyed by question ID; `default` is the fallback.

function margaretAcks(): Record<string, (a: string) => string> {
  return {
    'matter-description': () => `Noted. I've identified the key dimensions \u2014 let's ensure we cover each one precisely.`,
    'audience': (a) => `${a.split(/[,;]/)[0]?.trim() || 'That audience'} \u2014 I'll ensure we calibrate formality and accessibility to match.`,
    'contract-type': (a) => `${a.trim()} \u2014 I'm activating the appropriate review protocols.`,
    'party-position': () => `Understood. Your position will shape our entire analytical framework.`,
    'research-question': () => `The question is well-framed. This gives our team a clear mandate.`,
    'jurisdiction': (a) => `${a.trim()} jurisdiction noted. We'll apply the correct authorities.`,
    'question': () => `Clear. Our agents will approach this from every relevant angle.`,
    'client-name': () => `Noted. Pre-engagement due diligence will begin immediately.`,
    'default': () => `Acknowledged. Let's continue building the record.`,
  };
}

function jamesAcks(): Record<string, (a: string) => string> {
  return {
    'matter-description': () => `That's really helpful context \u2014 I can already see where to focus. Let's keep going.`,
    'audience': (a) => `${a.split(/[,;]/)[0]?.trim() || 'Great audience'} \u2014 we'll make sure the language really connects with them.`,
    'contract-type': (a) => `${a.trim()}, got it. I've worked on plenty of these \u2014 you're in good hands.`,
    'party-position': () => `That's important. Knowing where you stand changes how we read every clause.`,
    'research-question': () => `Excellent question. That's going to give the research team a lot to work with.`,
    'jurisdiction': (a) => `${a.trim()} \u2014 perfect, I know the landscape there well. Let's continue.`,
    'question': () => `Wonderful. I think we can get you a really solid answer on this.`,
    'client-name': () => `Thanks for that. We'll run the usual checks \u2014 nothing to worry about.`,
    'default': () => `Great, that's really useful. What else can you tell me?`,
  };
}

function amaraAcks(): Record<string, (a: string) => string> {
  return {
    'matter-description': () => `I see several analytical vectors here. Let me ensure we capture the complete picture.`,
    'audience': (a) => `${a.split(/[,;]/)[0]?.trim() || 'That readership'} \u2014 interesting. This affects our linguistic complexity metrics significantly.`,
    'contract-type': (a) => `${a.trim()} \u2014 this triggers a specific set of review heuristics I want to apply.`,
    'party-position': () => `A critical variable. Positional analysis will inform every subsequent assessment.`,
    'research-question': () => `A well-scoped research question. The precision here will improve our results substantially.`,
    'jurisdiction': (a) => `${a.trim()} \u2014 noted. The regulatory landscape there has several nuances worth capturing.`,
    'question': () => `Good. I want our analysis to address this from at least three independent angles.`,
    'client-name': () => `Recorded. The pre-engagement analysis will be comprehensive.`,
    'default': () => `Good data point. Let me probe a bit deeper on the next item.`,
  };
}

function rafaelAcks(): Record<string, (a: string) => string> {
  return {
    'matter-description': () => `Got it \u2014 that gives us a solid starting point. Let's keep the momentum going.`,
    'audience': (a) => `${a.split(/[,;]/)[0]?.trim() || 'Nice'} \u2014 we'll make sure everything lands clearly with that audience.`,
    'contract-type': (a) => `${a.trim()} \u2014 cool, loading up the right playbook for this one.`,
    'party-position': () => `That changes the whole lens \u2014 every clause gets read differently. Good to know.`,
    'research-question': () => `Sharp question. That's exactly what we need to get the agents moving.`,
    'jurisdiction': (a) => `${a.trim()} \u2014 locked in. We'll zero in on the right authorities.`,
    'question': () => `Great \u2014 the agents are going to have a field day with this. Let's keep rolling.`,
    'client-name': () => `Noted \u2014 we'll run the checks quickly so you're not waiting around.`,
    'default': () => `Nice, that helps. Let's keep it moving \u2014 what's next?`,
  };
}

// ── Persona Definitions ──────────────────────────────────────────────────

export const INTERVIEWER_PERSONAS: InterviewerPersona[] = [
  {
    id: 'margaret-chen',
    name: 'Margaret Chen',
    title: 'Senior Partner',
    tagline: 'Precise, thorough, nothing overlooked.',
    portrait: PORTRAIT_MARGARET,
    acknowledgments: margaretAcks(),
  },
  {
    id: 'james-whitfield',
    name: 'James Whitfield',
    title: 'Managing Partner',
    tagline: 'Warm, reassuring, makes it easy.',
    portrait: PORTRAIT_JAMES,
    acknowledgments: jamesAcks(),
  },
  {
    id: 'amara-osei',
    name: 'Dr. Amara Osei',
    title: 'Of Counsel',
    tagline: 'Analytical, insightful, sees patterns.',
    portrait: PORTRAIT_AMARA,
    acknowledgments: amaraAcks(),
  },
  {
    id: 'rafael-torres',
    name: 'Rafael Torres',
    title: 'Junior Partner',
    tagline: 'Direct, energetic, keeps things moving.',
    portrait: PORTRAIT_RAFAEL,
    acknowledgments: rafaelAcks(),
  },
];

/** Lookup by ID for quick access. */
export function getInterviewer(id: string): InterviewerPersona | undefined {
  return INTERVIEWER_PERSONAS.find(p => p.id === id);
}
