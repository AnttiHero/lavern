/**
 * DiceBear Notionists variant lists.
 *
 * Each avatar feature has a finite set of variants.
 * We list the most visually distinct ones for the builder UI.
 * Full docs: https://www.dicebear.com/styles/notionists/
 */

export interface AvatarFeature {
  key: string;
  label: string;
  variants: string[];       // variant IDs (e.g., 'variant01')
  allowNone: boolean;       // whether "none" is a valid option
}

export const AVATAR_FEATURES: AvatarFeature[] = [
  {
    key: 'hair',
    label: 'Hair',
    allowNone: false,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
      'variant06', 'variant07', 'variant08', 'variant09', 'variant10',
      'variant11', 'variant12', 'variant13', 'variant14', 'variant15',
      'variant16', 'variant17', 'variant18', 'variant19', 'variant20',
      'variant21', 'variant22', 'variant23', 'variant24', 'variant25',
      'variant26', 'variant27', 'variant28', 'variant29', 'variant30',
      'variant31', 'variant32', 'variant33', 'variant34', 'variant35',
      'variant36', 'variant37', 'variant38', 'variant39', 'variant40',
      'variant41', 'variant42', 'variant43', 'variant44', 'variant45',
      'variant46', 'variant47', 'variant48', 'variant49', 'variant50',
    ],
  },
  {
    key: 'eyes',
    label: 'Eyes',
    allowNone: false,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
    ],
  },
  {
    key: 'lips',
    label: 'Mouth',
    allowNone: false,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
      'variant06', 'variant07', 'variant08', 'variant09', 'variant10',
      'variant11', 'variant12', 'variant13', 'variant14', 'variant15',
      'variant16', 'variant17', 'variant18', 'variant19', 'variant20',
      'variant21', 'variant22', 'variant23', 'variant24', 'variant25',
      'variant26', 'variant27', 'variant28', 'variant29', 'variant30',
    ],
  },
  {
    key: 'nose',
    label: 'Nose',
    allowNone: false,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
      'variant06', 'variant07', 'variant08', 'variant09', 'variant10',
      'variant11', 'variant12', 'variant13', 'variant14', 'variant15',
      'variant16', 'variant17', 'variant18', 'variant19', 'variant20',
    ],
  },
  {
    key: 'brows',
    label: 'Brows',
    allowNone: false,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
      'variant06', 'variant07', 'variant08', 'variant09', 'variant10',
      'variant11', 'variant12', 'variant13',
    ],
  },
  {
    key: 'beard',
    label: 'Beard',
    allowNone: true,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
      'variant06', 'variant07', 'variant08', 'variant09', 'variant10',
      'variant11', 'variant12',
    ],
  },
  {
    key: 'glasses',
    label: 'Glasses',
    allowNone: true,
    variants: [
      'variant01', 'variant02', 'variant03', 'variant04', 'variant05',
      'variant06', 'variant07', 'variant08', 'variant09', 'variant10',
      'variant11',
    ],
  },
];

/** Build the full avatarExtra URL param string from selected variants. */
export function buildAvatarExtra(selections: Record<string, string | null>): string {
  return Object.entries(selections)
    .filter(([, v]) => v !== undefined)
    .map(([key, val]) => `${key}=${val ?? ''}`)
    .join('&');
}

/** Build full DiceBear avatar URL. */
export function avatarUrl(seed: string, extra?: string): string {
  const base = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  return extra ? `${base}&${extra}` : base;
}
