import { spawn, ChildProcess } from 'child_process';
import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';
import { waitForServer } from '../utils.ts';

export class DockerAdapter implements TestAdapter {
  private containerId: string | null = null;

  async setup(config: E2EConfig): Promise<void> {
    // Build the Docker image if not exists
    const buildProcess = spawn('docker', ['build', '-t', 'storybook-service:test', '.'], {
      stdio: 'pipe',
      env: process.env,
    });

    buildProcess.stdout?.on('data', (data) => console.log(`Docker build: ${data}`));
    buildProcess.stderr?.on('data', (data) => console.error(`Docker build error: ${data}`));

    await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => code === 0 ? resolve(void 0) : reject(new Error('Docker build failed')));
    });

    // Prepare env vars for container
    const envEntries = Object.entries(config.envVars || {}).map(([k, v]) => `${k}=${v}`).join(' ');

    // Run the container
    const runProcess = spawn('docker', [
      'run',
      '-d',
      '--name', `storybook-e2e-${Date.now()}`,
      '-p', '3000:3000',
      ...envEntries.split(' ').flatMap(e => ['-e', e]),
      'storybook-service:test'
    ], {
      stdio: 'pipe',
      env: process.env,
    });

    runProcess.stdout?.on('data', (data) => {
      this.containerId = data.toString().trim();
      console.log(`Docker container started: ${this.containerId}`);
    });

    runProcess.on('close', (code) => {
      if (code !== 0) console.error('Docker run failed');
    });

    await new Promise((resolve, reject) => {
      runProcess.on('close', (code) => code === 0 ? resolve(void 0) : reject(new Error('Docker run failed')));
    });

    // Wait for container to be ready
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
      return res.status === 404; // Expect 404 for unknown route
    } catch {
      return false;
    }
  }

  async cleanup(config: E2EConfig): Promise<void> {
    if (this.containerId) {
      spawn('docker', ['stop', this.containerId], { stdio: 'inherit' });
      spawn('docker', ['rm', this.containerId], { stdio: 'inherit' });
      this.containerId = null;
    }
  }
}