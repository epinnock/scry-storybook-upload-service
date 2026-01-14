import { z } from 'zod';
import type { BuildCoverage, CoverageSummary, QualityGateResult } from '../services/firestore/firestore.types.js';

/**
 * A normalized summary we store on Firestore build documents.
 */
export const CoverageSummarySchema = z.object({
  componentCoverage: z.number(),
  propCoverage: z.number(),
  variantCoverage: z.number(),
  passRate: z.number(),
  totalComponents: z.number(),
  componentsWithStories: z.number(),
  failingStories: z.number(),
});

export const QualityGateCheckSchema = z.object({
  name: z.string(),
  threshold: z.number(),
  actual: z.number(),
  passed: z.boolean(),
});

export const QualityGateResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(QualityGateCheckSchema),
});

/**
 * "Spec" style payload (explicit summary fields).
 *
 * We keep this permissive via passthrough to allow adding new fields
 * without breaking older clients.
 */
export const CoverageInputSpecSchema = z
  .object({
    reportUrl: z.string().url().optional(),
    summary: CoverageSummarySchema,
    qualityGate: QualityGateResultSchema,
    generatedAt: z.string(),
  })
  .passthrough();

/**
 * "Nested" style payload (summary.metrics + summary.health), which appears in the spec examples.
 */
export const CoverageInputNestedSchema = z
  .object({
    reportUrl: z.string().url().optional(),
    summary: z
      .object({
        metrics: z
          .object({
            componentCoverage: z.number(),
            propCoverage: z.number(),
            variantCoverage: z.number(),
          })
          .passthrough(),
        health: z
          .object({
            passRate: z.number(),
            failingStories: z.number(),
          })
          .passthrough(),
        totalComponents: z.number(),
        componentsWithStories: z.number(),
      })
      .passthrough(),
    qualityGate: QualityGateResultSchema,
    generatedAt: z.string(),
  })
  .passthrough();

/**
 * Any accepted input shape.
 */
export const CoverageInputSchema = z.union([CoverageInputSpecSchema, CoverageInputNestedSchema]);

export type CoverageInput = z.infer<typeof CoverageInputSchema>;

export type NormalizeCoverageOptions = {
  /**
   * The R2 URL where the raw JSON was uploaded.
   *
   * This is used as the canonical BuildCoverage.reportUrl.
   */
  reportUrl: string;
};

/**
 * Normalize multiple client coverage payload shapes into the stable Firestore shape.
 */
export function normalizeCoverageInput(input: unknown, options: NormalizeCoverageOptions): BuildCoverage {
  const parsed = CoverageInputSchema.parse(input);

  // Distinguish nested vs spec style by checking presence of summary.metrics.
  const anyParsed: any = parsed;

  const summary: CoverageSummary = anyParsed.summary?.metrics
    ? {
        componentCoverage: anyParsed.summary.metrics.componentCoverage,
        propCoverage: anyParsed.summary.metrics.propCoverage,
        variantCoverage: anyParsed.summary.metrics.variantCoverage,
        passRate: anyParsed.summary.health.passRate,
        totalComponents: anyParsed.summary.totalComponents,
        componentsWithStories: anyParsed.summary.componentsWithStories,
        failingStories: anyParsed.summary.health.failingStories,
      }
    : (anyParsed.summary as CoverageSummary);

  const qualityGate: QualityGateResult = anyParsed.qualityGate;

  return {
    reportUrl: options.reportUrl,
    summary,
    qualityGate,
    generatedAt: anyParsed.generatedAt,
  };
}
