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

export async function cleanupTestEnv(context: TestContext | undefined): Promise<void> {
  // Handle undefined context gracefully
  if (!context) {
    console.log('Cleanup skipped: context is undefined');
    return;
  }

  // Clean up storage data via API BEFORE terminating the server
  // This ensures the server is still running when we make cleanup API calls
  for (const prefix of context.cleanupPrefixes || []) {
    try {
      // Parse prefix correctly: "project/version/" -> ["project", "version"]
      const trimmedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      const parts = trimmedPrefix.split('/');
      
      if (parts.length >= 2) {
        const project = parts[0];
        const version = parts[1];
        
        const response = await context.client(`/cleanup/${project}/${version}`, {
          method: 'DELETE',
          headers: {
            'X-Test-Cleanup': 'true',
          },
        });

        if (response.status !== 200 && response.status !== 404) {
          console.warn(`Cleanup failed for prefix ${prefix}: HTTP ${response.status}`);
        }
      } else {
        console.warn(`Invalid prefix format: ${prefix}, skipping cleanup`);
      }
    } catch (error) {
      // Only log if it's not a connection error (which might be expected during shutdown)
      if (error instanceof Error && !error.message.includes('ECONNREFUSED')) {
        console.warn(`Cleanup error for prefix ${prefix}:`, error.message);
      }
    }
  }

  // Clean up local temp files
  context.uploadedFiles?.forEach(file => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.warn(`Failed to delete temp file ${file}:`, error.message);
      } else {
        console.warn(`Failed to delete temp file ${file}:`, error);
      }
    }
  });

  // Finally, cleanup the adapter (terminate server processes)
  if (context.config?.cleanupOnFinish) {
    try {
      await context.adapter.cleanup(context.config);
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Adapter cleanup failed:', error.message);
      } else {
        console.warn('Adapter cleanup failed:', error);
      }
    }
  }
}

// Vitest hooks wrapper
export function withTestEnv(adapter: TestAdapter, target: DeploymentTarget, testFn: (ctx: TestContext) => void | Promise<void>) {
  let ctx: TestContext | undefined;

  beforeAll(async () => {
    try {
      ctx = await setupTestEnv(adapter, target);
    } catch (error) {
      console.warn(`Failed to setup test environment for ${target}:`, error);
      ctx = undefined;
    }
  });

  afterAll(async () => {
    await cleanupTestEnv(ctx);
  });

  describe(`E2E Tests for ${target}`, () => {
    it('should run tests in this environment', async () => {
      if (!ctx) {
        throw new Error(`Test environment setup failed for ${target}`);
      }
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
        const healthUrl = url.endsWith('/') ? url + 'health' : url + '/health';
        const res = await fetch(healthUrl);
        if (res.ok && res.status === 200) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error(`Server not ready after ${timeout}ms - last status: ${res.status}`));
        } else {
          setTimeout(check, 1000);
        }
      } catch (error) {
        if (Date.now() - start > timeout) {
          reject(new Error(`Server not ready after ${timeout}ms - error: ${error.message}`));
        } else {
          setTimeout(check, 1000);
        }
      }
    };
    check();
  });
}