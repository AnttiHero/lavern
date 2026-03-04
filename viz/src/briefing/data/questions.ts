/**
 * Briefing questions per workflow type.
 *
 * Each workflow has a tailored set of intake questions
 * that mirror how a law firm would conduct a first meeting.
 *
 * impactNote: shown to the user after they answer, explaining WHY
 * the context matters. Makes providing context feel rewarding.
 */

export interface BriefingQuestion {
  id: string;
  text: string;
  hint?: string;
  required: boolean;
  multiline: boolean;
  category: 'context' | 'scope' | 'constraints' | 'objectives';
  impactNote?: string;
}

export const WORKFLOW_QUESTIONS: Record<string, BriefingQuestion[]> = {
  'roundtable': [
    {
      id: 'matter-description',
      text: 'Describe the document you need reviewed or improved.',
      hint: 'What is the document, and what do you need — review, redraft, simplification, or something else?',
      required: true,
      multiline: true,
      category: 'context',
      impactNote: 'This shapes every agent\'s analysis — the more specific, the sharper their work.',
    },
    {
      id: 'audience',
      text: 'Who is the primary audience?',
      hint: 'Consumers, small business owners, employees, enterprise clients...',
      required: true,
      multiline: false,
      category: 'context',
      impactNote: 'Knowing your audience helps us calibrate readability targets and tone.',
    },
    {
      id: 'pain-points',
      text: 'What issues have you noticed with the current version?',
      hint: 'Unclear language, compliance gaps, missing sections, outdated terms...',
      required: false,
      multiline: true,
      category: 'scope',
      impactNote: 'Known issues tell agents where to focus their review effort.',
    },
    {
      id: 'constraints',
      text: 'Any regulatory or compliance constraints?',
      hint: 'Specific jurisdictions, industry regulations, internal policies...',
      required: false,
      multiline: true,
      category: 'constraints',
      impactNote: 'Regulatory context prevents changes that could create compliance issues.',
    },
    {
      id: 'success-criteria',
      text: 'What does success look like?',
      hint: 'Measurable outcomes, deadlines, stakeholder requirements...',
      required: false,
      multiline: true,
      category: 'objectives',
      impactNote: 'Clear success criteria let agents verify their work against your expectations.',
    },
  ],

  'review': [
    {
      id: 'contract-type',
      text: 'What type of contract is this?',
      hint: 'SaaS agreement, employment contract, NDA, vendor agreement...',
      required: true,
      multiline: false,
      category: 'context',
      impactNote: 'Contract type activates specialized review templates and risk frameworks.',
    },
    {
      id: 'party-position',
      text: 'Which party do you represent, and what is your position?',
      hint: 'Are you the drafter, counterparty, or a neutral advisor?',
      required: true,
      multiline: true,
      category: 'context',
      impactNote: 'Your position determines which clauses to strengthen vs. which to challenge.',
    },
    {
      id: 'key-concerns',
      text: 'What terms or clauses concern you most?',
      hint: 'Liability caps, IP ownership, termination rights, data handling...',
      required: false,
      multiline: true,
      category: 'scope',
      impactNote: 'Flagged concerns get prioritized in the review and receive deeper analysis.',
    },
    {
      id: 'deal-context',
      text: 'What is the broader deal context?',
      hint: 'Deal size, timeline pressure, relationship with counterparty...',
      required: false,
      multiline: true,
      category: 'context',
      impactNote: 'Deal context helps calibrate how aggressive or conciliatory to be.',
    },
    {
      id: 'risk-appetite',
      text: 'What is your risk appetite?',
      hint: 'Conservative (flag everything), balanced, or aggressive...',
      required: false,
      multiline: false,
      category: 'constraints',
      impactNote: 'Risk appetite sets the threshold for what gets flagged vs. accepted.',
    },
  ],

  'adversarial': [
    {
      id: 'research-question',
      text: 'What legal question needs answering?',
      hint: 'Be as specific as possible about the issue...',
      required: true,
      multiline: true,
      category: 'context',
      impactNote: 'A precise question produces a focused memo; a vague one produces a survey.',
    },
    {
      id: 'jurisdiction',
      text: 'Which jurisdiction(s) are relevant?',
      hint: 'US federal, specific states, EU, UK, multiple...',
      required: true,
      multiline: false,
      category: 'context',
      impactNote: 'Jurisdiction determines which legal authorities and precedents are analyzed.',
    },
    {
      id: 'factual-background',
      text: 'What are the key facts?',
      hint: 'Relevant facts, parties involved, timeline of events...',
      required: false,
      multiline: true,
      category: 'scope',
      impactNote: 'Facts let agents apply law to your specific situation, not just in theory.',
    },
    {
      id: 'desired-outcome',
      text: 'What outcome are you hoping to support?',
      hint: 'The position or argument you want to evaluate...',
      required: false,
      multiline: true,
      category: 'objectives',
      impactNote: 'Knowing your preferred outcome helps agents test its viability honestly.',
    },
  ],

  'counsel': [
    {
      id: 'question',
      text: 'What is your legal question?',
      hint: 'Describe what you need help with...',
      required: true,
      multiline: true,
      category: 'context',
      impactNote: 'The clearer your question, the more actionable the answer.',
    },
    {
      id: 'context',
      text: 'Any relevant context?',
      hint: 'Background information, specific circumstances...',
      required: false,
      multiline: true,
      category: 'context',
      impactNote: 'Context transforms a generic answer into advice tailored to your situation.',
    },
    {
      id: 'urgency',
      text: 'How urgent is this?',
      hint: 'Immediate, this week, no deadline...',
      required: false,
      multiline: false,
      category: 'constraints',
      impactNote: 'Urgency helps us balance thoroughness with speed.',
    },
  ],

  'pre-engagement': [
    {
      id: 'client-name',
      text: 'Client name and entity type?',
      hint: 'Individual, corporation, partnership, non-profit...',
      required: true,
      multiline: false,
      category: 'context',
      impactNote: 'Entity type determines which regulatory frameworks apply.',
    },
    {
      id: 'matter-type',
      text: 'What type of matter is this?',
      hint: 'Transaction, litigation, advisory, regulatory...',
      required: true,
      multiline: false,
      category: 'context',
      impactNote: 'Matter type selects the right workflow and team composition.',
    },
    {
      id: 'matter-description',
      text: 'Describe the matter briefly.',
      hint: 'Overview of the engagement and expected scope...',
      required: true,
      multiline: true,
      category: 'scope',
      impactNote: 'A clear scope description prevents scope creep and sets proper expectations.',
    },
    {
      id: 'conflicts',
      text: 'Any potential conflicts of interest?',
      hint: 'Adverse parties, prior representations...',
      required: false,
      multiline: true,
      category: 'constraints',
      impactNote: 'Early conflict identification prevents costly surprises mid-engagement.',
    },
  ],

  default: [
    {
      id: 'matter-description',
      text: 'Describe the matter you need help with.',
      hint: 'Provide as much context as possible...',
      required: true,
      multiline: true,
      category: 'context',
      impactNote: 'More detail here means more relevant, actionable results.',
    },
    {
      id: 'objectives',
      text: 'What are your primary objectives?',
      hint: 'What outcome are you hoping for?',
      required: true,
      multiline: true,
      category: 'objectives',
      impactNote: 'Clear objectives let agents measure their work against what matters to you.',
    },
    {
      id: 'constraints',
      text: 'Any constraints or deadlines?',
      hint: 'Timeline, budget, regulatory, jurisdictional...',
      required: false,
      multiline: true,
      category: 'constraints',
      impactNote: 'Constraints shape practical recommendations, not just theoretical ones.',
    },
  ],
};

// Backward-compatible alias for old workflow ID
WORKFLOW_QUESTIONS['legal-design'] = WORKFLOW_QUESTIONS['roundtable'];
