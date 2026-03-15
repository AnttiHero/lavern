/**
 * DemoNarration -- Thin banner showing the current demo stage.
 *
 * Displayed during demo mode at the top of each view to help
 * viewers understand what they're seeing.
 */

const GOLD = '#96875f';

interface Props {
  step: 1 | 2 | 3;
  detail?: string;
}

const LABELS: Record<number, { title: string; description: string }> = {
  1: {
    title: 'PARTNER CONSULTATION',
    description: 'You brief Catherine on the case. She assembles the right team.',
  },
  2: {
    title: 'TEAM AT WORK',
    description: 'Specialists analyze, debate, and verify the document in real time',
  },
  3: {
    title: 'THE DELIVERABLE',
    description: 'Transformed document with full process transparency',
  },
};

export function DemoNarration({ step, detail }: Props) {
  const { title, description } = LABELS[step];

  return (
    <div style={S.banner}>
      <div style={S.stepBadge}>STEP {step} OF 3</div>
      <div style={S.content}>
        <span style={S.title}>{title}</span>
        <span style={S.dot}>{' \u00b7 '}</span>
        <span style={S.description}>{detail || description}</span>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 20px',
    backgroundColor: 'rgba(150, 135, 95, 0.08)',
    borderBottom: `1px solid rgba(150, 135, 95, 0.15)`,
    marginBottom: 16,
    animation: 'partnerTextFadeIn 0.6s ease both',
  },
  stepBadge: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: GOLD,
    backgroundColor: 'rgba(150, 135, 95, 0.12)',
    padding: '3px 8px',
    borderRadius: 3,
    flexShrink: 0,
  },
  content: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    color: '#4a4a4a',
    letterSpacing: 0.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  title: {
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  dot: {
    opacity: 0.4,
  },
  description: {
    fontWeight: 400,
  },
};
