// In src/entry.worker.ts

import { Hono } from 'hono';
import { app } from './app';
import { R2S3StorageService } from './services/storage/storage.worker';
import { MockStorageService } from './services/storage/storage.mock';
import { FirestoreServiceWorker } from './services/firestore/firestore.worker';
import type { AppEnv } from './app';

/**
 * Defines the specific Cloudflare Bindings expected by this Worker.
 * This provides type safety for c.env.
 */
type Bindings = {
  // This binding provides access to the R2 bucket for storybooks.
  STORYBOOK_BUCKET: R2Bucket;

  // These are the secrets required for the S3-compatible API.
  // They should be set in the wrangler.toml or via the Cloudflare dashboard.
  R2_ACCOUNT_ID: string;
  R2_S3_ACCESS_KEY_ID: string;
  R2_S3_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  
  // Firebase/Firestore configuration
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIRESTORE_SERVICE_ACCOUNT_ID?: string;
  
  // Environment variable to detect test mode
  NODE_ENV?: string;
};

// Create a new Hono instance specifically for the Worker, extending the shared AppEnv.
const workerApp = new Hono<AppEnv & { Bindings: Bindings }>();

/**
 * This top-level middleware is executed for every request.
 * It instantiates the Worker-specific storage service using the R2 binding
 * and S3 credentials from the environment, then injects it into the context.
 */
workerApp.use('*', async (c, next) => {
  // Check if we're in test mode
  const isTestMode = c.env.NODE_ENV === 'test';
  
  let storageService;
  
  if (isTestMode) {
    // Use mock storage service for testing
    storageService = new MockStorageService();
  } else {
    // Assemble the configuration for the S3 client from environment variables.
    const r2Config = {
      accountId: c.env.R2_ACCOUNT_ID,
      accessKeyId: c.env.R2_S3_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_S3_SECRET_ACCESS_KEY,
      bucketName: c.env.R2_BUCKET_NAME,
    };

    // Instantiate the hybrid storage service with both the native binding and the S3 config.
    storageService = new R2S3StorageService(c.env.STORYBOOK_BUCKET, r2Config);
  }

  // Place the service instance into the context for downstream handlers.
  c.set('storage', storageService);
  
  // Initialize Firestore service if Firebase credentials are configured
  if (c.env.FIREBASE_PROJECT_ID && c.env.FIREBASE_CLIENT_EMAIL && c.env.FIREBASE_PRIVATE_KEY) {
    const firestoreConfig = {
      projectId: c.env.FIREBASE_PROJECT_ID,
      clientEmail: c.env.FIREBASE_CLIENT_EMAIL,
      privateKey: c.env.FIREBASE_PRIVATE_KEY,
      serviceAccountId: c.env.FIRESTORE_SERVICE_ACCOUNT_ID || 'upload-service'
    };
    const firestoreService = new FirestoreServiceWorker(firestoreConfig);
    c.set('firestore', firestoreService);
  }

  await next();
});

// Mount the shared application routes onto the worker-specific app.
workerApp.route('/', app);

/**
 * Export the final object that conforms to the Cloudflare Module Worker standard.
 * The runtime will invoke the 'fetch' method for each incoming HTTP request.
 */
export default {
  fetch: workerApp.fetch,
};
