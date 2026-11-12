import { z } from 'zod';

const sampleSchema = z.object({
  image: z.string().min(1),
  label: z.enum(['accepted', 'draft', 'rejected']),
  notes: z.string().optional(),
});

const baselineSchema = z.object({
  version: z.number().int().positive(),
  status: z.string().optional(),
  description: z.string().optional(),
  gates: z.object({
    threshold: z.number(),
    minContentSimilarity: z.number(),
    minEdgeSimilarity: z.number(),
  }).optional(),
  samples: z.array(sampleSchema),
});

export type QualityBaseline = z.infer<typeof baselineSchema>;

export interface BaselineMeasurement {
  label: 'accepted' | 'draft' | 'rejected';
  overallSimilarity: number;
  contentSimilarity: number;
  edgeSimilarity: number;
}

export function parseQualityBaseline(input: unknown): QualityBaseline {
  return baselineSchema.parse(input);
}

export function recommendQualityGates(samples: BaselineMeasurement[]) {
  const accepted = samples.filter((sample) => sample.label === 'accepted');
  if (accepted.length === 0) {
    throw new Error('At least one accepted sample is required for calibration');
  }

  return {
    threshold: Math.min(...accepted.map((sample) => sample.overallSimilarity)),
    minContentSimilarity: Math.min(...accepted.map((sample) => sample.contentSimilarity)),
    minEdgeSimilarity: Math.min(...accepted.map((sample) => sample.edgeSimilarity)),
  };
}
