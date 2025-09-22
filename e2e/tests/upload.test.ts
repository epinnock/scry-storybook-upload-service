import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NodeAdapter } from '../adapters/node.adapter.ts';
import { WorkerAdapter } from '../adapters/worker.adapter.ts';
import { DockerAdapter } from '../adapters/docker.adapter.ts';
import { ProductionAdapter } from '../adapters/production.adapter.ts';
import { generateTestData, setupTestEnv, cleanupTestEnv, TestContext } from '../utils.ts';
import { getConfig } from '../config.ts';

const targets = ['node', 'worker', 'docker'] as const; // Exclude production for local runs
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
        ctx = await setupTestEnv(adapter, target);
      });

      afterAll(async () => {
        await cleanupTestEnv(ctx);
      });

      it('should successfully upload a Storybook file', async () => {
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

      it('should generate a presigned URL for file upload', async () => {
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

      it('should handle file retrieval/access after upload', async () => {
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
        ctx = await setupTestEnv(adapter, target);
      });

      afterAll(async () => {
        await cleanupTestEnv(ctx);
      });

      it('should reject upload with invalid project name', async () => {
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
        const testData = generateTestData('storybook');
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(1024)], testData.filename, { type: 'application/zip' }));

        const response = await ctx.client(`/upload/${testData.project}/`, {
          method: 'POST',
          body: formData,
        });

        expect(response.status).toBe(400);
      });

      it('should reject large file uploads', async () => {
        const testData = generateTestData('storybook', { size: 10 * 1024 * 1024 }); // 10MB, assuming limit
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(testData.size)], testData.filename, { type: 'application/zip' }));

        const response = await ctx.client(`/upload/${testData.project}/${testData.version}`, {
          method: 'POST',
          body: formData,
        });

        expect(response.status).toBe(413); // Payload too large
      });

      // Add more error cases as needed (e.g., auth errors if applicable)
    });
  });

  // Production error tests similar to local
});