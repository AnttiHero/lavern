import { z } from 'zod';

export const RubricEvaluationStatusSchema = z.enum([
  'satisfied',
  'needs_revision',
  'max_iterations_reached',
  'failed',
  'grader_error',
]);

export type RubricEvaluationStatus = z.infer<typeof RubricEvaluationStatusSchema>;

export const RubricCriterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(true),
});

export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  defaultMaxIterations: z.number().int().min(1).max(20).default(2),
  criteria: z.array(RubricCriterionSchema).min(1),
});

export type RubricDefinition = z.infer<typeof RubricDefinitionSchema>;

export const RubricCriterionEvaluationSchema = z.object({
  criterionId: z.string().min(1),
  name: z.string().min(1),
  passed: z.boolean(),
  evidence: z.string().min(1),
  gap: z.string().optional(),
});

export type RubricCriterionEvaluation = z.infer<typeof RubricCriterionEvaluationSchema>;

export const RubricEvaluationSchema = z.object({
  id: z.string().min(1),
  rubricId: z.string().min(1),
  step: z.string().min(1),
  iteration: z.number().int().min(1),
  maxIterations: z.number().int().min(1).max(20),
  status: RubricEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  artifactSummary: z.string().min(1),
  explanation: z.string().min(1),
  criteria: z.array(RubricCriterionEvaluationSchema),
  timestamp: z.string().min(1),
});

export type RubricEvaluation = z.infer<typeof RubricEvaluationSchema>;

