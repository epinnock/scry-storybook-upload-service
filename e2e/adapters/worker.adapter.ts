import { spawn, ChildProcess } from 'child_process';
import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';
import { waitForServer } from '../utils.ts';

export class WorkerAdapter implements TestAdapter {
  private devProcess: ChildProcess | null = null;

  async setup(config: E2EConfig): Promise<void> {
    // Set test environment variables for wrangler
    const env = { ...process.env, ...config.envVars };

    // Spawn wrangler dev
    this.devProcess = spawn('npx', ['wrangler', 'dev'], {
      stdio: 'pipe',
      env,
      cwd: process.cwd(),
    });

    this.devProcess.stdout?.on('data', (data) => console.log(`Worker dev: ${data}`));
    this.devProcess.stderr?.on('data', (data) => console.error(`Worker dev error: ${data}`));

    // Wait for Worker to be ready (default port 8787)
    await waitForServer(config.baseUrl, 60000); // Longer timeout for wrangler startup
  }

  async getClient(config: E2EConfig): Promise<ApiClient> {
    return async (path: string, options?: RequestInit): Promise<Response> => {
      const url = new URL(path, config.baseUrl);
      return fetch(url.toString(), options);
    };
  }

  async isHealthy(config: E2EConfig): Promise<boolean> {
    try {
      const res = await fetch(config.baseUrl);
      return res.status === 404; // Expect 404 for unknown route
    } catch {
      return false;
    }
  }

  async cleanup(config: E2EConfig): Promise<void> {
    if (this.devProcess) {
      this.devProcess.kill('SIGTERM');
      this.devProcess = null;
    }
  }
}