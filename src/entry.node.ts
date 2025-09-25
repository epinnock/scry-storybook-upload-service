// In src/entry.node.ts

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { app } from './app.js';
import { R2S3StorageService } from './services/storage/storage.node.js';
import { MockStorageService } from './services/storage/storage.mock.js';
import type { AppEnv } from './app.js';

// This will be used if dotenv is configured for local development
import 'dotenv/config';

// Define a type for the R2 configuration expected from environment variables.
type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

// Check if we're in test mode
const isTestMode = process.env.NODE_ENV === 'test';

// Gather all configuration from process.env.
// The '!' non-null assertion operator is used assuming these are required for the app to start.
// In a production app, robust validation (e.g., with Zod) would be added here.
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  r2: isTestMode ? {
    // Use placeholder values for test mode
    accountId: 'test-account',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucketName: 'test-bucket',
  } : {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_S3_SECRET_ACCESS_KEY!,
    bucketName: process.env.R2_BUCKET_NAME!,
  },
};

// Basic validation to ensure the server doesn't start with missing configuration (except in test mode).
if (!isTestMode && Object.values(config.r2).some(v => !v)) {
  console.error("FATAL: Missing required R2 environment variables. Please check your .env file or environment configuration.");
  console.error("Required variables: R2_ACCOUNT_ID, R2_S3_ACCESS_KEY_ID, R2_S3_SECRET_ACCESS_KEY, R2_BUCKET_NAME");
  process.exit(1);
}

const nodeApp = new Hono<AppEnv>();

/**
 * This top-level middleware instantiates the Node.js-specific storage service
 * with configuration from environment variables and injects it into the context.
 */
nodeApp.use('*', async (c, next) => {
  const storageService = isTestMode 
    ? new MockStorageService()
    : new R2S3StorageService(config.r2);
  c.set('storage', storageService);
  await next();
});

// Mount the shared application routes.
nodeApp.route('/', app);

console.log(`Server is running on http://localhost:${config.port}${isTestMode ? ' (TEST MODE)' : ''}`);

// Use the serve adapter to start the Node.js server.
serve({
  fetch: nodeApp.fetch,
  port: config.port,
});
