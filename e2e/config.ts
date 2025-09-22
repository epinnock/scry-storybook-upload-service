import { Environment } from 'vitest';

export type DeploymentTarget = 'node' | 'worker' | 'docker' | 'production';

export interface E2EConfig {
  target: DeploymentTarget;
  baseUrl: string;
  port?: number;
  envVars?: Record<string, string>;
  cleanupOnFinish?: boolean;
}

export type ApiClient = (path: string, options?: RequestInit) => Promise<Response>;

export interface TestAdapter {
  setup(config: E2EConfig): Promise<void>;
  getClient(config: E2EConfig): Promise<ApiClient>;
  cleanup(config: E2EConfig): Promise<void>;
  isHealthy(config: E2EConfig): Promise<boolean>;
}

export const defaultConfig: Record<DeploymentTarget, Partial<E2EConfig>> = {
  node: {
    baseUrl: 'http://localhost:3001',
    port: 3001,
    envVars: {
      NODE_ENV: 'test',
    },
  },
  worker: {
    baseUrl: 'http://localhost:8787',
    port: 8787,
    envVars: {
      NODE_ENV: 'test',
    },
  },
  docker: {
    baseUrl: 'http://localhost:3000',
    port: 3000,
    envVars: {
      NODE_ENV: 'test',
    },
  },
  production: {
    baseUrl: process.env.E2E_PROD_URL || 'https://your-production-url.workers.dev',
    envVars: {
      NODE_ENV: 'production',
    },
  },
};

export function getConfig(target: DeploymentTarget, overrides?: Partial<E2EConfig>): E2EConfig {
  const base = defaultConfig[target] || {};
  const merged = { ...base, ...overrides };
  return {
    target,
    baseUrl: merged.baseUrl as string || 'http://localhost:3000', // Ensure string with fallback
    port: merged.port,
    envVars: merged.envVars,
    cleanupOnFinish: merged.cleanupOnFinish ?? true,
  };
}