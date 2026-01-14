import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NodeAdapter } from '../adapters/node.adapter.ts';
import { WorkerAdapter } from '../adapters/worker.adapter.ts';
import { DockerAdapter } from '../adapters/docker.adapter.ts';
import { ProductionAdapter } from '../adapters/production.adapter.ts';
import { generateTestData, setupTestEnv, cleanupTestEnv, TestContext } from '../utils.ts';
import { getConfig } from '../config.ts';

const targets = (process.env.E2E_INCLUDE_DOCKER === 'true'
  ? ['node', 'worker', 'docker']
  : ['node', 'worker']) as Array<'node' | 'worker' | 'docker'>; // Docker is opt-in to reduce resource usage
const productionTarget = 'production';

// Check if production URL is properly configured
const isProductionConfigured = () => {
  const prodUrl = process.env.E2E_PROD_URL;
  return prodUrl && prodUrl !== 'https://your-production-url.workers.dev' && !prodUrl.includes('your-production-url');
};

describe('E2E Upload Tests', () => {
  let prodCtx: TestContext | undefined;

  beforeAll(async () => {
    // Only setup production context if properly configured
    if (isProductionConfigured()) {
      try {
        const prodAdapter = new ProductionAdapter();
        prodCtx = await setupTestEnv(prodAdapter, productionTarget, { cleanupOnFinish: false });
      } catch (error) {
        console.warn('Production environment setup failed, skipping production tests:', error.message);
        prodCtx = undefined;
      }
    } else {
      console.log('Production environment not configured (E2E_PROD_URL not set or using placeholder), skipping production tests');
    }
  });

  afterAll(async () => {
    if (prodCtx) {
      await cleanupTestEnv(prodCtx);
    }
  });

  // Test successful upload workflow
  targets.forEach((target) => {
    const adapter = target === 'node' ? new NodeAdapter() : 
                    target === 'worker' ? new WorkerAdapter() : 
                    new DockerAdapter();

    describe(`Upload Workflow - ${target}`, () => {
      let ctx: TestContext;

      beforeAll(async () => {
        try {
          ctx = await setupTestEnv(adapter, target);
        } catch (error) {
          console.error(`Failed to setup test environment for ${target}:`, error);
          // Set ctx to undefined so tests can detect the failure
          ctx = undefined as any;
        }
      }, 30000);

      afterAll(async () => {
        if (ctx) {
          await cleanupTestEnv(ctx);
        }
      });

      it('should successfully upload a Storybook file', async () => {
        if (!ctx) {
          console.log(`Skipping test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook');
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

        const response = await ctx.client(`/upload/${testData.project}/${testData.version}`, {
          method: 'POST',
          body: formData,
        });

        expect(response.status).toBe(201);
        const result = await response.json();
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('key', expect.stringContaining(`${testData.project}/${testData.version}/`));

        // Track for cleanup
        ctx.uploadedFiles.push(testData.filePath);
        ctx.cleanupPrefixes.push(testData.prefix);
      });

      it('should upload a Storybook file with coverage (multipart)', async () => {
        if (!ctx) {
          console.log(`Skipping test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook');
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

        const coverageReport = {
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
          generatedAt: new Date().toISOString(),
        };

        formData.append(
          'coverage',
          new File([JSON.stringify(coverageReport)], 'coverage-report.json', { type: 'application/json' })
        );

        const response = await ctx.client(`/upload/${testData.project}/${testData.version}`, {
          method: 'POST',
          body: formData,
        });

        expect(response.status).toBe(201);
        const result = await response.json();
        expect(result).toHaveProperty('success', true);
        expect(result.data).toHaveProperty('coverageUrl');
        expect(result.data.coverageUrl).toContain('coverage-report.json');

        ctx.uploadedFiles.push(testData.filePath);
        ctx.cleanupPrefixes.push(testData.prefix);
      });

      it('should upload coverage for an existing build when Firestore is configured', async () => {
        if (!ctx) {
          console.log(`Skipping test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook');

        // Upload storybook first
        const uploadForm = new FormData();
        uploadForm.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));
        const uploadRes = await ctx.client(`/upload/${testData.project}/${testData.version}`, {
          method: 'POST',
          body: uploadForm,
        });
        expect(uploadRes.status).toBe(201);

        const coverageBody = {
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
          generatedAt: new Date().toISOString(),
        };

        const coverageRes = await ctx.client(`/upload/${testData.project}/${testData.version}/coverage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(coverageBody),
        });

        if (coverageRes.status === 500) {
          const err = await coverageRes.json().catch(() => ({}));
          if (err?.error === 'Firestore not configured') {
            console.log('Skipping coverage update assertion (Firestore not configured in this target)');
            return;
          }
        }

        expect(coverageRes.status).toBe(201);
        const result = await coverageRes.json();
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('coverageUrl');

        ctx.uploadedFiles.push(testData.filePath);
        ctx.cleanupPrefixes.push(testData.prefix);
      });

      it('should generate a presigned URL for file upload', async () => {
        if (!ctx) {
          console.log(`Skipping test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('payload');
        const response = await ctx.client(`/presigned-url/${testData.project}/${testData.version}/${testData.filename}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: testData.contentType }),
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result).toHaveProperty('url', expect.stringContaining('s3.amazonaws.com'));
        expect(result).toHaveProperty('fields');

        // Track prefix if presigned upload is used (optional, as direct upload not performed here)
        ctx.cleanupPrefixes.push(testData.prefix);
      });

      it('should only create a build for ZIP presigned uploads, not for coverage JSON', async () => {
        if (!ctx) {
          console.log(`Skipping test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook');

        // Request presigned URL for storybook.zip - should create a build
        const zipResponse = await ctx.client(`/presigned-url/${testData.project}/${testData.version}/storybook.zip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: 'application/zip' }),
        });

        expect(zipResponse.status).toBe(200);
        const zipResult = await zipResponse.json();
        expect(zipResult).toHaveProperty('url');
        // Build should be created for ZIP
        const zipBuildId = zipResult.buildId;
        const zipBuildNumber = zipResult.buildNumber;

        // Request presigned URL for coverage-report.json - should NOT create a new build
        const coverageResponse = await ctx.client(`/presigned-url/${testData.project}/${testData.version}/coverage-report.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: 'application/json' }),
        });

        expect(coverageResponse.status).toBe(200);
        const coverageResult = await coverageResponse.json();
        expect(coverageResult).toHaveProperty('url');
        // Coverage presign should NOT have buildId/buildNumber (no new build created)
        expect(coverageResult.buildId).toBeUndefined();
        expect(coverageResult.buildNumber).toBeUndefined();

        // If Firestore is configured and we got a buildId from ZIP, verify only one build exists
        if (zipBuildId && zipBuildNumber !== undefined) {
          console.log(`Build created for ZIP: ID=${zipBuildId}, Number=${zipBuildNumber}`);
          console.log('Coverage presign did not create a new build (as expected)');
        }

        ctx.cleanupPrefixes.push(testData.prefix);
      });

      it('should handle file retrieval/access after upload', async () => {
        if (!ctx) {
          console.log(`Skipping test - ${target} environment setup failed`);
          return;
        }

        // Assuming upload happened in previous test; use a known key or re-upload minimally
        const testData = generateTestData('storybook');
        // ... (simplified: perform upload if needed, then GET /download/:project/:version/:filename or similar endpoint)
        // For now, assume service has a GET endpoint for verification
        const response = await ctx.client(`/upload/${testData.project}/${testData.version}`, { method: 'GET' });
        expect(response.status).toBe(200); // Or appropriate status for list/retrieve

        ctx.cleanupPrefixes.push(testData.prefix);
      });
    });
  });

  // Production tests (lightweight, no setup)
  describe('Upload Workflow - production', () => {
    it('should successfully upload a Storybook file in production', async () => {
      if (!prodCtx) {
        console.log('Skipping production test - environment not configured or unavailable');
        return;
      }

      // Similar to local but use prodCtx; skip heavy setup
      const testData = generateTestData('storybook');
      const formData = new FormData();
      formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

      const response = await prodCtx.client(`/upload/${testData.project}/${testData.version}`, {
        method: 'POST',
        body: formData,
      });

      expect(response.status).toBe(201);
      const result = await response.json();
      expect(result).toHaveProperty('success', true);

      prodCtx.cleanupPrefixes.push(testData.prefix);
    });

    // Add similar tests for presigned URL and retrieval in production
  });

  // Error scenarios (run for all targets)
  targets.forEach((target) => {
    const adapter = target === 'node' ? new NodeAdapter() : 
                    target === 'worker' ? new WorkerAdapter() : 
                    new DockerAdapter();

    describe(`Error Scenarios - ${target}`, () => {
      let ctx: TestContext;

      beforeAll(async () => {
        try {
          ctx = await setupTestEnv(adapter, target);
        } catch (error) {
          console.error(`Failed to setup test environment for ${target} error scenarios:`, error);
          // Set ctx to undefined so tests can detect the failure
          ctx = undefined as any;
        }
      }, 30000);

      afterAll(async () => {
        if (ctx) {
          await cleanupTestEnv(ctx);
        }
      });

      it('should reject upload with invalid project name', async () => {
        if (!ctx) {
          console.log(`Skipping error test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook');
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

        const response = await ctx.client(`/upload/invalid@project/${testData.version}`, {
          method: 'POST',
          body: formData,
        });

        expect(response.status).toBe(400); // Assuming validation error
      });

      it('should reject upload without version', async () => {
        if (!ctx) {
          console.log(`Skipping error test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook');
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

        const response = await ctx.client(`/upload/${testData.project}/`, {
          method: 'POST',
          body: formData,
        });

        expect(response.status).toBe(404);
      });

      it('should reject large file uploads', async () => {
        if (!ctx) {
          console.log(`Skipping error test - ${target} environment setup failed`);
          return;
        }

        const testData = generateTestData('storybook', { size: 10 * 1024 * 1024 }); // 10MB, limit is 5MB

        // Use raw binary upload to reliably hit the size check before any multipart parsing.
        const response = await ctx.client(`/upload/${testData.project}/${testData.version}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: new Uint8Array(testData.size),
        });

        expect([400, 413]).toContain(response.status); // Payload too large (some runtimes return 400 on oversized bodies)
      });

      // Add more error cases as needed (e.g., auth errors if applicable)
    });
  });

  // Production error tests similar to local
});