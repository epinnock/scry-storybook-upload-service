import { spawn, ChildProcess } from 'child_process';
import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';
import { waitForServer } from '../utils.ts';
import path from 'path';

export class NodeAdapter implements TestAdapter {
  private serverProcess: ChildProcess | null = null;

  async setup(config: E2EConfig): Promise<void> {
    // Set test environment variables
    Object.entries(config.envVars || {}).forEach(([key, value]) => {
      process.env[key] = value;
    });

    // Build the project if not already built
    const { execSync } = await import('child_process');
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch {}

    // Spawn the Node.js server
    const serverPath = path.join(process.cwd(), 'dist', 'entry.node.js');
    this.serverProcess = spawn('node', [serverPath], {
      stdio: 'pipe',
      env: { ...process.env, ...config.envVars },
    });

    this.serverProcess.stdout?.on('data', (data) => console.log(`Node server: ${data}`));
    this.serverProcess.stderr?.on('data', (data) => console.error(`Node server error: ${data}`));

    // Wait for server to be ready
    await waitForServer(config.baseUrl, 30000);
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
      return res.status === 404; // Expect 404 for unknown route, indicating server is up
    } catch {
      return false;
    }
  }

  async cleanup(config: E2EConfig): Promise<void> {
    if (this.serverProcess) {
      // First try graceful shutdown
      this.serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      const exitPromise = new Promise<void>((resolve) => {
        this.serverProcess?.on('exit', () => resolve());
        // Force kill after 5 seconds if not exited
        setTimeout(() => {
          if (this.serverProcess && !this.serverProcess.killed) {
            this.serverProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
      
      await exitPromise;
      this.serverProcess = null;
      
      // Additional delay to ensure port is fully released
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}