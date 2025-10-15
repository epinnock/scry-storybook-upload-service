import { spawn, ChildProcess } from 'child_process';
import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';
import { waitForServer } from '../utils.ts';

export class DockerAdapter implements TestAdapter {
  private containerId: string | null = null;

  async setup(config: E2EConfig): Promise<void> {
    // Check if port is already in use and if so, try to use existing service
    const port = config.port || 3000;
    const isAlreadyRunning = await this.isHealthy(config);
    
    if (isAlreadyRunning) {
      console.log(`Service already running on port ${port}, using existing service`);
      return;
    }

    // Kill any existing processes on the port
    await this.killExistingProcess(port);

    // Build the Docker image if not exists
    console.log('Building Docker image...');
    await this.buildDockerImage();

    // Prepare env vars for container
    const envArgs: string[] = [];
    if (config.envVars) {
      Object.entries(config.envVars).forEach(([key, value]) => {
        envArgs.push('-e', `${key}=${value}`);
      });
    }

    // Generate unique container name
    const containerName = `storybook-e2e-${Date.now()}`;

    // Run the container
    console.log(`Starting Docker container: ${containerName}`);
    const runArgs = [
      'run',
      '-d',
      '--name', containerName,
      '-p', `${port}:3000`,
      ...envArgs,
      'storybook-service:test'
    ];

    const runProcess = spawn('docker', runArgs, {
      stdio: 'pipe',
      env: process.env,
    });

    let stdout = '';
    runProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    runProcess.stderr?.on('data', (data) => {
      console.error(`Docker run error: ${data}`);
    });

    await new Promise((resolve, reject) => {
      runProcess.on('close', (code) => {
        if (code === 0) {
          this.containerId = stdout.trim();
          console.log(`Docker container started: ${this.containerId}`);
          resolve(void 0);
        } else {
          reject(new Error(`Docker run failed with code ${code}`));
        }
      });
    });

    // Wait for container to be ready
    await waitForServer(config.baseUrl, 45000); // Longer timeout for Docker startup
  }

  private async buildDockerImage(): Promise<void> {
    const buildProcess = spawn('docker', ['build', '-t', 'storybook-service:test', '.'], {
      stdio: 'pipe',
      env: process.env,
    });

    buildProcess.stdout?.on('data', (data) => console.log(`Docker build: ${data}`));
    buildProcess.stderr?.on('data', (data) => console.error(`Docker build error: ${data}`));

    await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve(void 0);
        } else {
          reject(new Error(`Docker build failed with code ${code}`));
        }
      });
    });
  }

  private async killExistingProcess(port: number): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      // Kill any process using the port
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      // Also stop any existing containers using the port
      execSync(`docker ps --filter "publish=${port}" --format "{{.ID}}" | xargs -r docker stop 2>/dev/null || true`, { stdio: 'ignore' });
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
    if (this.containerId) {
      try {
        console.log(`Stopping Docker container: ${this.containerId}`);
        const { execSync } = await import('child_process');
        
        // Stop the container
        execSync(`docker stop ${this.containerId}`, { stdio: 'ignore' });
        
        // Remove the container
        execSync(`docker rm ${this.containerId}`, { stdio: 'ignore' });
        
        console.log(`Docker container ${this.containerId} stopped and removed`);
        this.containerId = null;
      } catch (error) {
        console.error(`Error cleaning up Docker container: ${error.message}`);
      }
    }

    // Additional cleanup - stop any containers using our port
    const port = config.port || 3000;
    await this.killExistingProcess(port);
  }
}