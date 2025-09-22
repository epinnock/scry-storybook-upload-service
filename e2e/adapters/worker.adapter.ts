import { spawn, ChildProcess } from 'child_process';
import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';
import { waitForServer } from '../utils.ts';

export class WorkerAdapter implements TestAdapter {
  private devProcess: ChildProcess | null = null;

  async setup(config: E2EConfig): Promise<void> {
    // Check if port is already in use and if so, try to use existing service
    const port = config.port || 8787;
    const isAlreadyRunning = await this.isHealthy(config);
    
    if (isAlreadyRunning) {
      console.log(`Worker already running on port ${port}, using existing service`);
      return;
    }

    // Kill any existing processes on the port
    await this.killExistingProcess(port);

    // Set test environment variables for wrangler
    const env = { ...process.env, ...config.envVars };

    // Spawn wrangler dev
    this.devProcess = spawn('npx', ['wrangler', 'dev', '--port', port.toString()], {
      stdio: 'pipe',
      env,
      cwd: process.cwd(),
    });

    this.devProcess.stdout?.on('data', (data) => console.log(`Worker dev: ${data}`));
    this.devProcess.stderr?.on('data', (data) => console.error(`Worker dev error: ${data}`));

    // Handle process errors
    this.devProcess.on('error', (error) => {
      console.error(`Worker process error: ${error}`);
    });

    this.devProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`Worker process exited with code ${code}, signal ${signal}`);
      }
    });

    // Wait for Worker to be ready (default port 8787)
    await waitForServer(config.baseUrl, 60000); // Longer timeout for wrangler startup
  }

  private async killExistingProcess(port: number): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      // Kill any process using the port
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      // Wait a moment for the port to be released
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch {
      // Ignore errors - port might not be in use
    }
  }

  async getClient(config: E2EConfig): Promise<ApiClient> {
    return async (path: string, options?: RequestInit): Promise<Response> => {
      const url = new URL(path, config.baseUrl);
      return fetch(url.toString(), options);
    };
  }

  async isHealthy(config: E2EConfig): Promise<boolean> {
    try {
      const healthUrl = config.baseUrl.endsWith('/') ? config.baseUrl + 'health' : config.baseUrl + '/health';
      const res = await fetch(healthUrl);
      return res.ok && res.status === 200; // Expect 200 for health endpoint
    } catch {
      return false;
    }
  }

  async cleanup(config: E2EConfig): Promise<void> {
    if (this.devProcess) {
      // Send SIGTERM first for graceful shutdown
      this.devProcess.kill('SIGTERM');
      
      // Wait for process to exit
      const exitPromise = new Promise<void>((resolve) => {
        this.devProcess?.on('exit', () => resolve());
        // Force kill after 5 seconds if not exited
        setTimeout(() => {
          if (this.devProcess && !this.devProcess.killed) {
            this.devProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
      
      await exitPromise;
      this.devProcess = null;
      
      // Additional cleanup - kill any remaining processes on the port
      const port = config.port || 8787;
      await this.killExistingProcess(port);
    }
  }
}