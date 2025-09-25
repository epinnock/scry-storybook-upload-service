import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Increase timeout for e2e tests
    testTimeout: 60000,
    hookTimeout: 30000,
    
    // Use fewer workers to reduce process management issues
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 2,
      }
    },
    
    // Sequential execution for e2e tests to avoid conflicts
    fileParallelism: false,
    
    // Better error handling
    bail: 1,
    
    // Environment-specific configurations
    environment: 'node',
    
    // Reporters
    reporters: ['default'],
    
    // Include only unit tests by default, exclude e2e
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    
    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/e2e/**', // Exclude e2e tests from regular test runs
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
    ],
    
    // Global setup/teardown
    globalSetup: [],
    
    // Retry failed tests once
    retry: 1,
    
    // Graceful shutdown
    teardownTimeout: 10000,
    
    // Better logging for debugging
    logHeapUsage: true,
  },
});