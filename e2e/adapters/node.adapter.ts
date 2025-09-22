import { spawn, ChildProcess } from 'child_process';
import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';
import { waitForServer } from '../utils.ts';
import path from 'path';

export class NodeAdapter implements TestAdapter {
  private serverProcess: ChildProcess | null = null;

  async setup(config: E2EConfig): Promise<void> {
    // Check if port is already in use and if so, try to use existing service
    let port = config.port || 3001;
    let isAlreadyRunning = await this.isHealthy(config);
    
    if (isAlreadyRunning) {
      console.log(`Node server already running on port ${port}, using existing service`);
      return;
    }

    // Try to find an available port if the default is in use
    port = await this.findAvailablePort(port);
    
    // Update config with the actual port we'll use
    const actualConfig = { ...config, port, baseUrl: `http://localhost:${port}` };

    // Kill any existing processes on the port
    await this.killExistingProcess(port);

    // Set test environment variables
    Object.entries(actualConfig.envVars || {}).forEach(([key, value]) => {
      process.env[key] = value;
    });

    // Build the project if not already built
    const { execSync } = await import('child_process');
    try {
      console.log('Building project...');
      execSync('pnpm run build', { stdio: 'inherit' });
    } catch (error) {
      console.error('Build failed, but continuing anyway:', (error as { message: string }).message);
    }

    // Spawn the Node.js server
    const serverPath = path.join(process.cwd(), 'dist', 'entry.node.js');
    this.serverProcess = spawn('node', [serverPath], {
      stdio: 'pipe',
      env: { ...process.env, ...actualConfig.envVars, PORT: port.toString() },
    });

    this.serverProcess.stdout?.on('data', (data) => console.log(`Node server: ${data}`));
    this.serverProcess.stderr?.on('data', (data) => console.error(`Node server error: ${data}`));

    // Handle process errors
    this.serverProcess.on('error', (error) => {
      console.error(`Node server process error: ${error}`);
    });

    this.serverProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`Node server process exited with code ${code}, signal ${signal}`);
      }
    });

    // Wait for server to be ready using the actual port
    await waitForServer(actualConfig.baseUrl, 30000);
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    const net = await import('net');
    
    const isPortInUse = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.once('close', () => resolve(false));
          server.close();
        });
        server.on('error', () => resolve(true));
      });
    };

    let port = startPort;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const inUse = await isPortInUse(port);
      if (!inUse) {
        console.log(`Found available port: ${port}`);
        return port;
      }
      port++;
      attempts++;
    }

    throw new Error(`Could not find available port after ${maxAttempts} attempts starting from ${startPort}`);
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
      
      // Additional cleanup - kill any remaining processes on the port
      const port = config.port || 3000;
      await this.killExistingProcess(port);
    }
  }
}