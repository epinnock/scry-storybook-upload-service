import { TestAdapter, E2EConfig, ApiClient } from '../config.ts';

export class ProductionAdapter implements TestAdapter {
  async setup(config: E2EConfig): Promise<void> {
    // No-op for production; assume service is running
    console.log(`Production adapter setup for ${config.baseUrl}`);
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
      return res.status === 404; // Expect 404 for unknown route, indicating service is up
    } catch {
      return false;
    }
  }

  async cleanup(config: E2EConfig): Promise<void> {
    // No-op for production
    console.log(`Production adapter cleanup complete`);
  }
}