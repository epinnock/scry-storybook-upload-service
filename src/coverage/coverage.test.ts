import { describe, it, expect } from 'vitest';
import { normalizeCoverageInput } from './coverage.js';

describe('normalizeCoverageInput()', () => {
  it('normalizes the spec-style payload into BuildCoverage', () => {
    const input = {
      reportUrl: 'https://example.invalid/original.json',
      summary: {
        componentCoverage: 0.9,
        propCoverage: 0.8,
        variantCoverage: 0.7,
        passRate: 0.95,
        totalComponents: 100,
        componentsWithStories: 80,
        failingStories: 2,
      },
      qualityGate: {
        passed: true,
        checks: [
          { name: 'componentCoverage', threshold: 0.8, actual: 0.9, passed: true },
        ],
      },
      generatedAt: '2026-01-01T00:00:00.000Z',
    };

    const normalized = normalizeCoverageInput(input, {
      reportUrl: 'https://r2.example/coverage-report.json',
    });

    expect(normalized.reportUrl).toBe('https://r2.example/coverage-report.json');
    expect(normalized.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(normalized.summary.componentCoverage).toBe(0.9);
    expect(normalized.qualityGate.passed).toBe(true);
  });

  it('normalizes the nested (metrics/health) payload into BuildCoverage', () => {
    const input = {
      summary: {
        metrics: {
          componentCoverage: 0.91,
          propCoverage: 0.81,
          variantCoverage: 0.71,
        },
        health: {
          passRate: 0.96,
          failingStories: 1,
        },
        totalComponents: 50,
        componentsWithStories: 45,
      },
      qualityGate: {
        passed: false,
        checks: [
          { name: 'passRate', threshold: 0.98, actual: 0.96, passed: false },
        ],
      },
      generatedAt: '2026-01-02T00:00:00.000Z',
    };

    const normalized = normalizeCoverageInput(input, {
      reportUrl: 'https://r2.example/coverage-report.json',
    });

    expect(normalized.summary).toEqual({
      componentCoverage: 0.91,
      propCoverage: 0.81,
      variantCoverage: 0.71,
      passRate: 0.96,
      totalComponents: 50,
      componentsWithStories: 45,
      failingStories: 1,
    });
  });

  it('throws on invalid payloads', () => {
    expect(() =>
      normalizeCoverageInput(
        {
          summary: { componentCoverage: 'nope' },
          qualityGate: { passed: true, checks: [] },
          generatedAt: '2026-01-01',
        },
        { reportUrl: 'https://r2.example/coverage-report.json' }
      )
    ).toThrow();
  });
});
