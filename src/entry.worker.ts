// In src/entry.worker.ts

import { Hono } from 'hono';
import { app } from './app';
import { R2BindingStorageService } from './services/storage/storage.worker';
import type { AppEnv } from './app';

/**
 * Defines the specific Cloudflare Bindings expected by this Worker.
 * This provides type safety for c.env.
 */
type Bindings = {
  // This binding provides access to the R2 bucket for storybooks.
  STORYBOOK_BUCKET: R2Bucket;

  // Example of other potential bindings
  // API_SECRET: string;
  // METADATA_DB: D1Database;
};

// Create a new Hono instance specifically for the Worker, extending the shared AppEnv.
const workerApp = new Hono<AppEnv & { Bindings: Bindings }>();

/**
 * This top-level middleware is executed for every request.
 * It instantiates the Worker-specific storage service using the R2 binding
 * from the environment and injects it into the context as 'storage'.
 */
workerApp.use('*', async (c, next) => {
  // The R2Bucket is accessed safely from c.env.
  const storageService = new R2BindingStorageService(c.env.STORYBOOK_BUCKET);
  // c.set is used to place the service instance into the context's variable store.
  c.set('storage', storageService);
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
  // Other handlers like 'scheduled' for cron triggers could be added here.
  // scheduled: async (event, env, ctx) => {... }
};
