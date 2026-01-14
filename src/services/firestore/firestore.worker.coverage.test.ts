import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirestoreServiceWorker } from './firestore.worker.js';

describe('FirestoreServiceWorker.updateBuildCoverage()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PATCHes the build doc with a nested coverage mapValue', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const svc = new FirestoreServiceWorker({
      projectId: 'firebase-proj',
      clientEmail: 'test@example.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\\nZm9v\\n-----END PRIVATE KEY-----',
      serviceAccountId: 'upload-service',
    });

    // Bypass token generation logic.
    (svc as any).accessToken = 'test-token';
    (svc as any).tokenExpiry = Date.now() + 60_000;

    await svc.updateBuildCoverage('my-project', 'build-123', {
      reportUrl: 'https://r2.example/my-project/v1/coverage-report.json',
      summary: {
        componentCoverage: 0.9,
        propCoverage: 0.8,
        variantCoverage: 0.7,
        passRate: 0.95,
        totalComponents: 10,
        componentsWithStories: 9,
        failingStories: 1,
      },
      qualityGate: {
        passed: true,
        checks: [{ name: 'passRate', threshold: 0.9, actual: 0.95, passed: true }],
      },
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toContain('/documents/projects/my-project/builds/build-123');
    expect(url).toContain('updateMask.fieldPaths=coverage');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    const body = JSON.parse(init.body);
    const coverage = body.fields.coverage;

    // Validate some nested conversions
    expect(coverage.mapValue.fields.reportUrl.stringValue).toContain('coverage-report.json');
    expect(coverage.mapValue.fields.summary.mapValue.fields.totalComponents.integerValue).toBe('10');
    expect(coverage.mapValue.fields.summary.mapValue.fields.componentCoverage.doubleValue).toBe(0.9);

    const checks = coverage.mapValue.fields.qualityGate.mapValue.fields.checks.arrayValue.values;
    expect(checks).toHaveLength(1);
    expect(checks[0].mapValue.fields.name.stringValue).toBe('passRate');
  });
});
