/**
 * Router Schema — Zod schema for structured output from the Router.
 *
 * v5: Matches the RouterClassification interface in src/types/index.ts.
 * Used for structured output validation when calling the Router model.
 */

import { z } from 'zod';

export const RouterClassificationSchema = z.object({
  requestType: z.enum([
    'direct_answer',
    'single_specialist',
    'multi_specialist',
    'full_pipeline',
    'debate_pattern',
    'adversarial',
    'hierarchical',
  ]),
  complexity: z.enum(['low', 'medium', 'high']),
  riskLevel: z.enum(['low', 'medium', 'high']),
  selectedWorkflow: z.string(),
  selectedSpecialists: z.array(z.string()),
  requiresDebate: z.boolean(),
  requiresEthicsFirst: z.boolean(),
  requiresConsistencyCheck: z.boolean(),
  reasoning: z.string(),
});

