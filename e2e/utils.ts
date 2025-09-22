import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { DeploymentTarget, E2EConfig, TestAdapter, ApiClient, getConfig } from './config.ts';
import { describe, it, beforeAll, afterAll } from 'vitest';

export interface TestContext {
  config: E2EConfig;
  adapter: TestAdapter;
  client: ApiClient;
  uploadedFiles: string[];
  cleanupPrefixes: string[]; // Track project/version prefixes for storage cleanup
}

export function generateTestData(
  type: 'storybook' | 'payload',
  options?: { size?: number; project?: string; version?: string; filename?: string }
): any {
  const { size = 1024, project = `test-project-${randomUUID()}`, version = '1.0.0', filename = 'test-storybook.zip' } = options || {};

  if (type === 'storybook') {
    // Generate a mock Storybook zip file
    const buffer = Buffer.alloc(size, 'A'); // Simple binary data
    const tempPath = path.join(process.cwd(), 'temp', filename);
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, buffer);
    return { filePath: tempPath, project, version, filename, prefix: `${project}/${version}/` };
  }

  if (type === 'payload') {
    return {
      project,
      version,
      filename,
      contentType: 'application/zip',
      prefix: `${project}/${version}/`,
    };
  }

  throw new Error(`Unsupported test data type: ${type}`);
}

export async function setupTestEnv(adapter: TestAdapter, target: DeploymentTarget, overrides?: Partial<E2EConfig>): Promise<TestContext> {
  const config = getConfig(target, overrides);
  await adapter.setup(config);
  
  const healthy = await adapter.isHealthy(config);
  if (!healthy) {
    throw new Error(`Environment setup failed for target: ${target}`);
  }

  const client = await adapter.getClient(config);
  
  return {
    config,
    adapter,
    client,
    uploadedFiles: [],
    cleanupPrefixes: [],
  };
}

export async function cleanupTestEnv(context: TestContext): Promise<void> {
  if (context.config.cleanupOnFinish) {
    await context.adapter.cleanup(context.config);
  }

  // Clean up local temp files
  context.uploadedFiles.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });

  // Clean up storage data via API if prefixes are tracked
  for (const prefix of context.cleanupPrefixes) {
    const projectVersion = prefix.replace('/', ''); // Extract project/version from prefix
    const [project, version] = projectVersion.split('/');
    const response = await context.client(`/cleanup/${project}/${version}`, {
      method: 'DELETE',
      headers: {
        'X-Test-Cleanup': 'true',
      },
    });

    if (response.status !== 200) {
      console.warn(`Cleanup failed for prefix ${prefix}: ${response.status}`);
    }
  }
}

// Vitest hooks wrapper
export function withTestEnv(adapter: TestAdapter, target: DeploymentTarget, testFn: (ctx: TestContext) => void | Promise<void>) {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestEnv(adapter, target);
  });

  afterAll(async () => {
    await cleanupTestEnv(ctx);
  });

  describe(`E2E Tests for ${target}`, () => {
    it('should run tests in this environment', async () => {
      await testFn(ctx);
    });
  });
}

// Utility to wait for server readiness (complement to wait-on in scripts)
export async function waitForServer(url: string, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error(`Server not ready after ${timeout}ms`));
        } else {
          setTimeout(check, 1000);
        }
      } catch {
        if (Date.now() - start > timeout) {
          reject(new Error(`Server not ready after ${timeout}ms`));
        } else {
          setTimeout(check, 1000);
        }
      }
    };
    check();
  });
}