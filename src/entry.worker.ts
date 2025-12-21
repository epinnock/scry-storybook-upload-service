// In src/entry.worker.ts

import { Hono } from 'hono';
import { app } from './app';
import { R2S3StorageService } from './services/storage/storage.worker';
import { MockStorageService } from './services/storage/storage.mock';
import { FirestoreServiceWorker } from './services/firestore/firestore.worker';
import { ApiKeyServiceWorker } from './services/apikey/apikey.worker';
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
    // Validate R2 credentials are properly configured
    const accessKeyId = c.env.R2_S3_ACCESS_KEY_ID;
    const secretAccessKey = c.env.R2_S3_SECRET_ACCESS_KEY;
    const accountId = c.env.R2_ACCOUNT_ID;
    
    // R2 access key IDs should be exactly 32 characters
    if (accessKeyId && accessKeyId.length !== 32) {
      console.error(`[CONFIG ERROR] R2_S3_ACCESS_KEY_ID has length ${accessKeyId.length}, should be 32. ` +
        `This usually means the secret was not properly set via 'wrangler secret put R2_S3_ACCESS_KEY_ID'. ` +
        `Check if placeholder values in wrangler.toml are overriding secrets.`);
    }
    
    // Log config status (without revealing sensitive values)
    console.log('[INFO] R2 Config Status:', {
      hasAccountId: !!accountId,
      accountIdLength: accountId?.length,
      hasAccessKeyId: !!accessKeyId,
      accessKeyIdLength: accessKeyId?.length,
      hasSecretAccessKey: !!secretAccessKey,
      hasBucketName: !!c.env.R2_BUCKET_NAME,
      hasBucketBinding: !!c.env.STORYBOOK_BUCKET
    });
    
    // Assemble the configuration for the S3 client from environment variables.
    const r2Config = {
      accountId: accountId,
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      bucketName: c.env.R2_BUCKET_NAME,
    };

    // Instantiate the hybrid storage service with both the native binding and the S3 config.
    storageService = new R2S3StorageService(c.env.STORYBOOK_BUCKET, r2Config);
  }

  // Place the service instance into the context for downstream handlers.
  c.set('storage', storageService);
  
  // Initialize Firestore and API Key services if Firebase credentials are configured
  if (c.env.FIREBASE_PROJECT_ID && c.env.FIREBASE_CLIENT_EMAIL && c.env.FIREBASE_PRIVATE_KEY) {
    const firestoreConfig = {
      projectId: c.env.FIREBASE_PROJECT_ID,
      clientEmail: c.env.FIREBASE_CLIENT_EMAIL,
      privateKey: c.env.FIREBASE_PRIVATE_KEY,
      serviceAccountId: c.env.FIRESTORE_SERVICE_ACCOUNT_ID || 'upload-service'
    };
    const firestoreService = new FirestoreServiceWorker(firestoreConfig);
    c.set('firestore', firestoreService);
    
    // Initialize API Key service for authentication
    const apiKeyConfig = {
      projectId: c.env.FIREBASE_PROJECT_ID,
      clientEmail: c.env.FIREBASE_CLIENT_EMAIL,
      privateKey: c.env.FIREBASE_PRIVATE_KEY
    };
    const apiKeyService = new ApiKeyServiceWorker(apiKeyConfig);
    c.set('apiKeyService', apiKeyService);
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
